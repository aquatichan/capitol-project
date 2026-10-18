// The logistics page's what-if engine. A scenario is a list of sites, each with its own position and reach, so a
// council member can drag a site or widen one circle and see exactly who gains or loses coverage.
// All numbers trace back to the county workbook (logistics.json) or emPOWER; estimates are labelled as such.
import { hav } from "./plan.js";
import { GEN, GEN_ORDER, IN } from "./budget.js";
import logistics from "../data/logistics.json";

export const SERVICES = [
  ["oxygen", "Home oxygen"],
  ["dialysis", "Dialysis at a center"],
  ["homeHealth", "Home health care"],
  ["hospice", "Hospice at home"],
];

// Who each site reaches. A ZIP counts as reached when its point is inside at least one site's circle; each reached
// ZIP is served by its nearest reaching site (that is the load the site must hold).
export function evaluate(county, sites) {
  const { zips } = county, Z = zips.length, S = sites.length;
  const total = county.total || 1;
  const reachBy = new Uint16Array(Z), first = new Int16Array(Z).fill(-1), serve = new Int16Array(Z).fill(-1);
  const near = new Int16Array(Z).fill(-1), nearD = new Float64Array(Z).fill(Infinity);
  const per = sites.map(() => ({ within: 0, gain: 0, served: 0, overlap: 0, zips: 0 }));
  for (let z = 0; z < Z; z++) {
    const { lat, lon, w } = zips[z];
    let bestServe = Infinity;
    for (let i = 0; i < S; i++) {
      const d = hav(lat, lon, sites[i].lat, sites[i].lon);
      if (d < nearD[z]) { nearD[z] = d; near[z] = i; }
      if (d <= sites[i].r) {
        reachBy[z]++;
        per[i].within += w;
        per[i].zips++;
        if (first[z] < 0) first[z] = i;
        if (d < bestServe) { bestServe = d; serve[z] = i; }
      }
    }
    if (first[z] >= 0) per[first[z]].gain += w;
    if (serve[z] >= 0) per[serve[z]].served += w;
    if (reachBy[z] > 1) for (let i = 0; i < S; i++) if (hav(lat, lon, sites[i].lat, sites[i].lon) <= sites[i].r) per[i].overlap += w;
  }
  let reached = 0, backed = 0;
  const unreached = [];
  for (let z = 0; z < Z; z++) {
    if (reachBy[z]) reached += zips[z].w; else unreached.push(z);
    if (reachBy[z] > 1) backed += zips[z].w;
  }
  unreached.sort((a, b) => zips[b].w - zips[a].w);
  return {
    reached, total, missed: total - reached, pct: (100 * reached) / total, backedPct: (100 * backed) / total,
    per, reachBy, near, nearD, unreached,
  };
}

// Power for the people a site serves: turnout x watts per person (workbook inputs), as a low-high range in kW.
export const kwFor = (people) => [(people * IN.turnout * IN.wattsLow) / 1000, (people * IN.turnout * IN.wattsHigh) / 1000];
export const visitorsFor = (people) => people * IN.turnout;

// Setup and running costs for n sites of one generator type. Running = one long outage (IN.days days).
export function costs(n, gen) {
  const g = GEN[gen];
  const setup = n * g.cost;
  const running = n * (g.fuelPerDay * IN.days + (g.rentPerWeek ? g.rentPerWeek * Math.ceil(IN.days / 7) : 0));
  return { setup, fema: setup * IN.fema, local: setup * (1 - IN.fema), running, perSite: g.cost };
}

export const allCosts = (n) => GEN_ORDER.map((gen) => ({ gen, ...costs(n, gen) }));

// How many reached and missed people use each service, estimated from the county-wide mix (workbook services).
// Only the ten workbook counties have a mix; others return null.
export function serviceSplit(fips, reached, missed) {
  const T = logistics.counties[fips];
  if (!T?.services || !T.rely) return null;
  return SERVICES.map(([key, label]) => {
    const share = (T.services[key] ?? 0) / T.rely;
    return { key, label, share, county: T.services[key] ?? 0, reached: reached * share, missed: missed * share };
  });
}

export const areaOf = (zip) => logistics.areas?.[zip] ?? null;

// Things a council member should check before committing to a site. Derived from the data only.
// `busy`: this is one of the three sites serving the most people, so its room is worth checking first.
export function flagsFor(site, m, gen, { busy = false } = {}) {
  const out = [];
  const visitors = visitorsFor(m.served);
  if (site.custom) out.push({ t: "Placed by hand: pick a real building here", warn: true });
  else if (site.unnamed) out.push({ t: "Unnamed in public map data: confirm the building", warn: true });
  if (site.moved) out.push({ t: "Moved by hand from the solver's spot", warn: false });
  if (m.gain < 1) out.push({ t: "Reaches no one the earlier sites don't", warn: true });
  if (busy && visitors >= 50) out.push({ t: `One of the busiest: check room for about ${Math.round(visitors)} at once`, warn: true });
  if (m.overlap > 0 && m.within > 0 && m.overlap / m.within > 0.6) out.push({ t: "Mostly overlaps other sites", warn: false });
  if (site.type === "school") out.push({ t: "School: confirm access on weekends and breaks", warn: false });
  if (site.type === "fire_station") out.push({ t: "Fire station: crews may be out during the disaster", warn: false });
  if (gen === "gas") out.push({ t: "Natural gas: confirm a gas line reaches the building", warn: false });
  if (gen === "solar") out.push({ t: "Solar: critical loads only (oxygen, medicine, phones)", warn: false });
  return out;
}

// When each step can realistically happen, from the workbook's own notes ("Hookups: weeks per site",
// "Generators: months; grants can take years", urban counties "phase in by region over several years").
export function timeline(type, n, firstSite) {
  if (type === "Urban")
    return [
      ["Months 1 to 3", `Confirm the first sites in the ZIP codes with the most people at risk${firstSite ? `, starting with ${firstSite}` : ""}. Install hookups there.`],
      ["Year 1", `Hookups at all ${n} sites. Rental and fuel contracts signed. FEMA grant applications filed.`],
      ["Years 2 to 5", "Permanent generators, one region at a time, as grants come through."],
    ];
  return [
    ["Month 1", `Each site's board or owner agrees${firstSite ? `, ${firstSite} first` : ""}. Sites added to the county emergency plan.`],
    ["Months 2 to 3", "Hookups installed. A generator rental and fuel delivery lined up for each site."],
    ["Years 1 to 3", "Permanent generators through FEMA grants, busiest site first."],
  ];
}

export const READY = { hookup: "Weeks", diesel: "Months; grants can take years", gas: "Months; needs a gas line", solar: "Months to a year" };
export const GEN_NOTE = {
  hookup: "Cheapest to set up, but the county pays rent and fuel every outage.",
  diesel: "Built in. Needs fuel deliveries during a long outage.",
  gas: "No fuel deliveries, but only where piped gas exists.",
  solar: "No fuel cost, but less power: critical loads only.",
};
