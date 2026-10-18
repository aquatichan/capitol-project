// Briefing and petition PDFs, drawn in the browser from the scenario on screen (jsPDF, loaded only on click).
// The map is vector: ZIP shapes, reach circles and numbered sites, so it prints sharp at any size.
import { fmt, KIND } from "../../lib/format.js";
import { costs, kwFor, serviceSplit, timeline, areaOf } from "../../lib/scenario.js";
import { GEN, IN } from "../../lib/budget.js";
import { apaPlain } from "../ui/Apa.jsx";
import { GEN_LABEL } from "./Simulator.jsx";
import { money } from "./money.js";

const INK = [27, 29, 31], INK2 = [69, 73, 77], INK3 = [124, 129, 134], NAVY = [20, 51, 95], GAP = [200, 70, 47], RULE = [225, 226, 228];
const RAMP = [[223, 230, 238], [188, 203, 223], [147, 173, 208], [100, 134, 179], [54, 93, 143], [20, 51, 95]];
const W = 612, H = 792, M = 42;
const today = () => new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
const ascii = (t) => String(t).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/→/g, "->");

async function newDoc() {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.setFont("helvetica", "normal");
  return doc;
}

function text(doc, s, x, y, { size = 10, color = INK, bold = false, width, lh = 1.35, align } = {}) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(...color);
  const lines = width ? doc.splitTextToSize(ascii(s), width) : [ascii(s)];
  lines.forEach((l, i) => doc.text(l, x, y + i * size * lh, align ? { align } : undefined));
  return y + lines.length * size * lh;
}

function rule(doc, y, x0 = M, x1 = W - M) {
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.6);
  doc.line(x0, y, x1, y);
}

// ZIP shapes, reach circles and sites, fitted into a box
function drawMap(doc, S, box) {
  const { county, shapes, scale, sites, ev } = S;
  let s = 90, w = 180, n = -90, e = -180;
  const eat = (lat, lon) => { s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lon); e = Math.max(e, lon); };
  county.zips.forEach((z) => {
    const ent = shapes?.zips?.[z.z];
    if (ent) ent.p.forEach((poly) => poly[0].forEach(([la, lo]) => eat(la, lo)));
    else eat(z.lat, z.lon);
  });
  const kx = Math.cos((((s + n) / 2) * Math.PI) / 180);
  const sc = Math.min(box.w / ((e - w) * kx), box.h / (n - s));
  const ox = box.x + (box.w - (e - w) * kx * sc) / 2, oy = box.y + (box.h - (n - s) * sc) / 2;
  const P = (la, lo) => [ox + (lo - w) * kx * sc, oy + (n - la) * sc];
  const ptsPerMile = sc / 69.172;

  doc.setFillColor(244, 244, 242);
  doc.rect(box.x, box.y, box.w, box.h, "F");
  doc.setLineWidth(0.25);
  county.zips.forEach((z, i) => {
    const ent = shapes?.zips?.[z.z], out = ev && !ev.reachBy[i];
    const fill = out ? [246, 216, 210] : RAMP[scale ? scale.classes[i] : 2];
    doc.setFillColor(...fill);
    doc.setDrawColor(...(out ? GAP : [255, 255, 255]));
    if (!ent) { const [x, y] = P(z.lat, z.lon); doc.circle(x, y, 1.6, "FD"); return; }
    ent.p.forEach((poly) => {
      const ring = poly[0];
      const pts = [];
      ring.forEach(([la, lo]) => {
        const p = P(la, lo), last = pts[pts.length - 1];
        if (!last || Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) > 0.5) pts.push(p);
      });
      if (pts.length < 3) return;
      const rel = pts.slice(1).map((p, j) => [p[0] - pts[j][0], p[1] - pts[j][1]]);
      doc.lines(rel, pts[0][0], pts[0][1], [1, 1], "FD", true);
    });
  });
  doc.setLineDashPattern([2, 2], 0);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  sites.forEach((st) => { const [x, y] = P(st.lat, st.lon); doc.circle(x, y, st.r * ptsPerMile, "S"); });
  doc.setLineDashPattern([], 0);
  sites.forEach((st, i) => {
    const [x, y] = P(st.lat, st.lon);
    doc.setFillColor(...INK);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.8);
    doc.circle(x, y, 5.2, "FD");
    text(doc, String(i + 1), x, y + 2.3, { size: i >= 9 ? 5.2 : 6.2, color: [255, 255, 255], bold: true, align: "center" });
  });
  // scale bar: 5 or 10 miles
  const mi = (box.w / ptsPerMile) > 60 ? 10 : 5;
  doc.setDrawColor(...INK2);
  doc.setLineWidth(0.8);
  doc.line(box.x + 8, box.y + box.h - 10, box.x + 8 + mi * ptsPerMile, box.y + box.h - 10);
  text(doc, `${mi} miles`, box.x + 8, box.y + box.h - 14, { size: 6.5, color: INK2 });
}

function kpis(doc, y, items) {
  doc.setFillColor(...NAVY);
  doc.roundedRect(M, y, W - 2 * M, 66, 6, 6, "F");
  const cw = (W - 2 * M) / items.length;
  items.forEach(([label, value], i) => {
    const x = M + 14 + i * cw;
    text(doc, label, x, y + 20, { size: 7.5, color: [200, 212, 230] });
    text(doc, value, x, y + 46, { size: 17, color: [255, 255, 255], bold: true });
  });
  return y + 66;
}

const summary = (S) => {
  const c = costs(S.sites.length, S.gen);
  return { ...c, n: S.sites.length };
};

export async function briefingPdf(S) {
  const doc = await newDoc();
  const { county, ev, sites, gen, fips } = S;
  const c = summary(S);

  let y = M;
  text(doc, "GridAid", M, y + 8, { size: 10, bold: true, color: INK2 });
  text(doc, `Prepared ${today()}`, W - M, y + 8, { size: 8, color: INK3, align: "right" });
  y = text(doc, `Backup-power plan: ${county.name}`, M, y + 34, { size: 20, bold: true });
  y = text(doc, `${sites.length} sites, ${GEN_LABEL[gen].toLowerCase()}, ${S.R}-mile reach. Placement: ${S.methodName}${S.edited ? ", with hand edits" : ""}.`, M, y + 2, { size: 10, color: INK2 });

  y = kpis(doc, y + 10, [
    ["People within reach", `${fmt(ev.reached)} (${ev.pct.toFixed(0)}%)`],
    ["Not reached", fmt(ev.missed)],
    ["Full setup", money(c.setup)],
    ["County share", money(c.local)],
  ]) + 16;

  drawMap(doc, S, { x: M, y, w: 300, h: 300 });
  text(doc, "Shaded by people who rely on powered medical equipment; red ZIPs are out of reach. Dashed circles are each site's reach, drawn to scale.", M, y + 312, { size: 7, color: INK3, width: 300 });

  // right column: who, money
  const rx = M + 318, rw = W - M - rx;
  let ry = text(doc, "Who needs power", rx, y + 10, { size: 11, bold: true });
  ry = text(doc, `${fmt(county.total)} people in ${county.zips.length} ZIP codes rely on powered medical equipment (HHS emPOWER, Medicare members).`, rx, ry + 2, { size: 8.5, color: INK2, width: rw });
  const split = serviceSplit(fips, ev.reached, ev.missed);
  if (split) {
    ry += 4;
    split.forEach((s) => {
      text(doc, s.label, rx, ry + 9, { size: 8.5 });
      text(doc, `${fmt(s.missed)} not reached`, rx + rw, ry + 9, { size: 8.5, color: s.missed >= 0.5 ? GAP : INK2, align: "right" });
      ry += 13;
    });
    ry = text(doc, "Estimated from the county's service mix; services overlap.", rx, ry + 8, { size: 7, color: INK3, width: rw });
  }
  ry = text(doc, "Cost", rx, ry + 16, { size: 11, bold: true });
  [["Full setup", money(c.setup)], [`FEMA (${Math.round(IN.fema * 100)}%)`, money(c.fema)], ["County share", money(c.local)], [`Each ${IN.days}-day outage`, c.running ? money(c.running) : "No fuel"], ["Fast start: hookups", money(costs(sites.length, "hookup").setup)]].forEach(([a, b]) => {
    text(doc, a, rx, ry + 10, { size: 8.5, color: INK2 });
    text(doc, b, rx + rw, ry + 10, { size: 8.5, bold: true, align: "right" });
    ry += 14;
  });
  const [lo, hi] = kwFor(ev.reached);
  ry = text(doc, `Power for the people reached: ${fmt(lo)} to ${fmt(hi)} kW, against ${fmt(sites.length * IN.kwPerSite)} kW of generators.`, rx, ry + 14, { size: 8, color: INK2, width: rw });

  // page 2: sites
  doc.addPage();
  y = text(doc, "Site by site", M, M + 14, { size: 14, bold: true }) + 4;
  const cols = [[M, "#"], [M + 18, "Site"], [M + 250, "New people"], [M + 318, "Power (kW)"], [M + 390, "Phone"]];
  cols.forEach(([x, h]) => text(doc, h, x, y + 8, { size: 7.5, color: INK3, bold: true }));
  y += 12;
  rule(doc, y);
  sites.forEach((s, i) => {
    if (y > H - 120) { doc.addPage(); y = M + 10; }
    const m = ev.per[i], [a, b] = kwFor(m.served), ct = s.idx != null ? S.contacts[String(s.idx)] : null;
    text(doc, String(i + 1), M, y + 12, { size: 8.5, bold: true });
    text(doc, s.name, M + 18, y + 12, { size: 8.5, width: 225 });
    text(doc, s.custom ? "Placed by hand" : `${KIND[s.type] ?? s.type}${ct?.addr ? ` · ${ct.addr}` : ""}`, M + 18, y + 22, { size: 7, color: INK3, width: 225 });
    text(doc, fmt(m.gain), M + 250, y + 12, { size: 8.5 });
    text(doc, `${Math.round(a)}-${Math.round(b)}`, M + 318, y + 12, { size: 8.5 });
    text(doc, ct?.phone ?? "not listed", M + 390, y + 12, { size: 8.5, color: ct?.phone ? INK : INK3 });
    y += 30;
    rule(doc, y);
  });

  y += 18;
  if (ev.unreached.length) {
    y = text(doc, "Not reached yet", M, y, { size: 11, bold: true });
    ev.unreached.slice(0, 6).forEach((i) => {
      const z = county.zips[i];
      text(doc, `ZIP ${z.z}${areaOf(z.z) ? ` (${areaOf(z.z)})` : ""}: ${z.masked ? "1-10" : fmt(z.w)} people, ${ev.near[i] >= 0 ? `${ev.nearD[i].toFixed(1)} mi from site ${ev.near[i] + 1}` : "no site"}`, M, y + 10, { size: 8.5, color: INK2 });
      y += 13;
    });
    y += 10;
  }
  if (y > H - 220) { doc.addPage(); y = M + 10; }
  y = text(doc, "Timeline", M, y + 4, { size: 11, bold: true });
  timeline(S.est?.type ?? (sites.length > 10 ? "Urban" : "Rural"), sites.length, sites[0]?.name).forEach(([when, what]) => {
    text(doc, when, M, y + 10, { size: 8.5, bold: true });
    y = text(doc, what, M + 90, y + 10, { size: 8.5, color: INK2, width: W - 2 * M - 90 }) + 2;
  });

  y += 14;
  y = text(doc, "Assumptions and sources", M, y, { size: 11, bold: true });
  y = text(doc, `Reach is straight-line distance, not travel time. ${Math.round(IN.turnout * 100)}% of people reached are assumed to come to a site (a placeholder the county should set), at ${IN.wattsLow} to ${IN.wattsHigh} watts each. ${GEN[gen].name}: ${money(GEN[gen].cost)} per site. Costs are planning estimates, not quotes.`, M, y + 2, { size: 7.5, color: INK2, width: W - 2 * M });
  ["empower", "osm", "ncdps", "njoem", "fema", "inogen", "church"].forEach((id) => {
    if (y > H - 60) { doc.addPage(); y = M; }
    y = text(doc, apaPlain(id), M, y + 6, { size: 6.8, color: INK3, width: W - 2 * M });
  });
  doc.save(`GridAid-briefing-${county.name.replace(/[^A-Za-z]+/g, "-")}.pdf`);
}

export async function petitionPdf(S, form) {
  const doc = await newDoc();
  const { county, ev, sites, gen } = S;
  const c = summary(S);
  const T = S.logistics;
  const to = form.to?.trim() || `the ${county.name.split(",")[0]} governing body`;

  let y = M;
  text(doc, "Petition", M, y + 10, { size: 10, bold: true, color: INK2 });
  y = text(doc, `Backup power for neighbors who rely on medical equipment`, M, y + 36, { size: 18, bold: true, width: W - 2 * M });
  y = text(doc, `To ${to}`, M, y + 4, { size: 11, color: INK2 });

  y = text(doc, `We, the undersigned residents of ${county.name}, ask you to plan backup-power sites before the next long outage.`, M, y + 16, { size: 10.5, width: W - 2 * M });
  y = text(doc, `${fmt(county.total)} people here rely on electricity-powered medical equipment: home oxygen, dialysis, powered wheelchairs. When the power stays out for days, they are in danger first.${T?.outage ? ` ${T.outage.what} (${T.outage.date}).` : ""}`, M, y + 6, { size: 10, color: INK2, width: W - 2 * M });

  y = text(doc, "We ask you to:", M, y + 14, { size: 10.5, bold: true });
  [
    `Adopt ${sites.length} backup-power sites into the county emergency plan, reaching about ${fmt(ev.reached)} people (${ev.pct.toFixed(0)}%) within ${S.R} miles: ${sites.slice(0, 6).map((s) => s.name).join("; ")}${sites.length > 6 ? `; and ${sites.length - 6} more` : ""}.`,
    `Fund a fast start: quick-connect hookups at every site (about ${money(costs(sites.length, "hookup").setup)}), so a rented generator can plug in within weeks.`,
    `Apply for FEMA's Hazard Mitigation Grant Program for permanent ${GEN_LABEL[gen].toLowerCase()} (about ${money(c.setup)}; the county's share near ${money(c.local)} if FEMA pays ${Math.round(IN.fema * 100)}%).`,
    ev.missed > 0.5 ? `Find sites for the ${fmt(ev.missed)} people still out of reach, starting with ZIP ${county.zips[ev.unreached[0]].z}.` : "Keep the plan current as the county grows.",
    "Tell every household that relies on powered equipment where its nearest site is.",
  ].forEach((ask, i) => {
    text(doc, `${i + 1}.`, M + 4, y + 10, { size: 9.5, bold: true });
    y = text(doc, ask, M + 20, y + 10, { size: 9.5, width: W - 2 * M - 20 }) + 2;
  });

  if (form.note?.trim()) {
    y = text(doc, "In our words", M, y + 12, { size: 10.5, bold: true });
    y = text(doc, form.note.trim(), M, y + 4, { size: 9.5, color: INK2, width: W - 2 * M });
  }
  if (form.name?.trim()) y = text(doc, `Organized by ${form.name.trim()}${form.zip ? `, ZIP ${form.zip}` : ""}.`, M, y + 12, { size: 9, color: INK2 });

  // signature lines on the rest of the page, then a full page more
  const rows = (startY) => {
    let yy = startY;
    [[M, "Name"], [M + 160, "Address or ZIP"], [M + 320, "Signature"], [M + 470, "Date"]].forEach(([x, h]) => text(doc, h, x, yy, { size: 7.5, bold: true, color: INK3 }));
    yy += 6;
    while (yy < H - 60) { yy += 26; rule(doc, yy); }
  };
  rows(y + 24);
  doc.addPage();
  rows(M + 10);
  doc.save(`GridAid-petition-${county.name.replace(/[^A-Za-z]+/g, "-")}.pdf`);
}
