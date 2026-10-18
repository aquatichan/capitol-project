import logistics from "../data/logistics.json";

// Everything here comes from GridAid_County_Plans.xlsx (scripts/extract_logistics.py writes logistics.json).
export const GEN = logistics.generators;          // hookup, diesel, gas, solar: cost per site, fuel per day, rent
export const IN = logistics.inputs;               // FEMA share, turnout, watts per person, reach, kW per site
export const GEN_ORDER = ["hookup", "diesel", "gas", "solar"];

// The county's budget is one fixed amount: the workbook's recommended budget, priced from past generator programs
// (NC 2019, $58,333 per diesel site). How many generators it buys depends on the type: budget / cost per site.
// Counties not in the workbook get the workbook's own formula (sites for power at the low wattage) run on their
// emPOWER count, priced the same way.
export function estimate(fips, county) {
  if (!county) return null;
  const T = logistics.counties[fips];
  const budget = T ? T.budget.recommended.diesel
    : Math.max(1, Math.ceil((county.total * IN.turnout * IN.wattsLow) / 1000 / IN.kwPerSite)) * GEN.diesel.cost;
  const counts = Object.fromEntries(GEN_ORDER.map((g) => [g, Math.floor(budget / GEN[g].cost + 1e-9)]));
  return { fromTable: !!T, type: T?.type ?? null, reach: T ? T.reach : county.R, budget, counts };
}

// generators actually placed: what the budget buys, at least one, and no more than the county has candidate sites
export const sitesFor = (est, gen, county) => Math.max(1, Math.min(est.counts[gen], county.sites.length));
