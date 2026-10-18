// Live planning in the browser: the same greedy as scripts/build.py, so the reach slider can be explored without a rebuild.
// Parity with Python (same selections, same coverage) is checked in the tests.

const RAD = Math.PI / 180;
export const TARGETS = [80, 90, 95];
export const KLIVE = 300;                      // how many centers the live greedy computes (a big budget buys ~270 hookups)

export function hav(lat1, lon1, lat2, lon2) {  // miles
  const x = Math.sin(((lat2 - lat1) * RAD) / 2) ** 2 +
            Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(((lon2 - lon1) * RAD) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(x));
}

// site x zip distance matrix (row-major, Float64 so threshold comparisons match Python exactly)
export function buildDistances(county) {
  const { zips, sites } = county, Z = zips.length, S = sites.length;
  const D = new Float64Array(S * Z);
  for (let s = 0; s < S; s++)
    for (let z = 0; z < Z; z++) D[s * Z + z] = hav(sites[s].lat, sites[s].lon, zips[z].lat, zips[z].lon);
  return D;
}

function coverLists(D, S, Z, R) {
  const lists = new Array(S);
  for (let s = 0; s < S; s++) {
    const out = [];
    for (let z = 0; z < Z; z++) if (D[s * Z + z] <= R) out.push(z);
    lists[s] = Int32Array.from(out);
  }
  return lists;
}

// Greedy max coverage. Ties go to the higher-quality site (q), then the lower index: same rule as build.py.
// Keeps choosing up to kmax even when nothing is left to gain (those picks add 0), like the Python phased plan.
export function greedyCurve(county, D, R, kmax = KLIVE) {
  const { zips, sites } = county, Z = zips.length, S = sites.length;
  const w = zips.map((z) => z.w), tot = w.reduce((a, b) => a + b, 0) || 1;
  const lists = coverLists(D, S, Z, R);
  const covered = new Uint8Array(Z), chosen = new Uint8Array(S);
  const sel = [], gains = [], cum = [];
  let running = 0;
  for (let step = 0; step < Math.min(kmax, S); step++) {
    let best = -1, bestGain = -1, bestQ = -Infinity;
    for (let s = 0; s < S; s++) {
      if (chosen[s]) continue;
      let g = 0;
      const L = lists[s];
      for (let i = 0; i < L.length; i++) if (!covered[L[i]]) g += w[L[i]];
      const q = sites[s].q ?? 0;
      if (g > bestGain + 1e-9 || (g >= bestGain - 1e-9 && q > bestQ)) { best = s; bestGain = g; bestQ = q; }
    }
    chosen[best] = 1; sel.push(best); gains.push(bestGain);
    const L = lists[best];
    for (let i = 0; i < L.length; i++) covered[L[i]] = 1;
    running += bestGain; cum.push((100 * running) / tot);
  }
  return { sel, gains, cum };
}

// small per-county cache so dragging a slider back and forth does not recompute
const curveCache = new WeakMap();
export function getCurve(county, D, R) {
  let m = curveCache.get(county);
  if (!m) { m = new Map(); curveCache.set(county, m); }
  if (!m.has(R)) { if (m.size > 24) m.delete(m.keys().next().value); m.set(R, greedyCurve(county, D, R)); }
  return m.get(R);
}

// fewest centers for the target, or null if even KLIVE centers cannot reach it
export function minCenters(curve, targetPct) {
  const i = curve.cum.findIndex((c) => c >= targetPct - 1e-9);
  return i < 0 ? null : i + 1;
}

// smallest reach (miles) at which k greedy centers hit the target; bisection, returned value is always sufficient
export function minReach(county, D, k, targetPct, lo = 0.25, hi = 150) {
  const covAt = (R) => { const c = greedyCurve(county, D, R, k).cum; return c[c.length - 1]; };
  if (covAt(hi) < targetPct - 1e-9) return null;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (covAt(mid) >= targetPct - 1e-9) hi = mid; else lo = mid;
  }
  return hi;
}

// ----- scoring a plan at reach R: coverage, overlap, reach band, and expected coverage if ZIP centers are off -----
function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const SIGMA_SCALE = 0.35, JIT_CAP = 10, JIT_DRAWS = 200;
const cloudCache = new WeakMap();
function jitterCloud(county, seed) {                       // same model as build.py (own random numbers, so values agree only approximately)
  if (cloudCache.has(county)) return cloudCache.get(county);
  const { zips } = county, Z = zips.length;
  const sigma = zips.map((a, i) => {
    if (Z < 2) return 3;
    let nn = Infinity;
    for (let j = 0; j < Z; j++) if (j !== i) nn = Math.min(nn, hav(a.lat, a.lon, zips[j].lat, zips[j].lon));
    return Math.min(SIGMA_SCALE * nn, JIT_CAP);
  });
  const rnd = mulberry32(seed), lat = new Float64Array(JIT_DRAWS * Z), lon = new Float64Array(JIT_DRAWS * Z);
  const normal = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  for (let d = 0; d < JIT_DRAWS; d++)
    for (let z = 0; z < Z; z++) {
      lat[d * Z + z] = zips[z].lat + (normal() * sigma[z]) / 69.0;
      lon[d * Z + z] = zips[z].lon + (normal() * sigma[z]) / (69.0 * Math.cos(zips[z].lat * RAD));
    }
  const out = { lat, lon };
  cloudCache.set(county, out);
  return out;
}

export function evaluatePlan(county, D, sel, R, seed = 0) {
  const { zips, sites } = county, Z = zips.length;
  const w = zips.map((z) => z.w), tot = w.reduce((a, b) => a + b, 0) || 1;
  const cnt = new Uint16Array(Z), lo = new Uint8Array(Z), hi = new Uint8Array(Z);
  for (const s of sel)
    for (let z = 0; z < Z; z++) {
      const d = D[s * Z + z];
      if (d <= R) cnt[z]++;
      if (d <= 0.8 * R) lo[z] = 1;
      if (d <= 1.2 * R) hi[z] = 1;
    }
  let cov = 0, red = 0, cl = 0, ch = 0; const unc = [];
  for (let z = 0; z < Z; z++) {
    if (cnt[z] >= 1) cov += w[z]; else unc.push(z);
    if (cnt[z] >= 2) red += w[z];
    if (lo[z]) cl += w[z];
    if (hi[z]) ch += w[z];
  }
  const { lat, lon } = jitterCloud(county, seed);
  let acc = 0;
  for (let d = 0; d < JIT_DRAWS; d++)
    for (let z = 0; z < Z; z++) {
      for (const s of sel) {
        if (hav(sites[s].lat, sites[s].lon, lat[d * Z + z], lon[d * Z + z]) <= R) { acc += w[z]; break; }
      }
    }
  const pct = (x) => Math.round((1000 * x) / tot) / 10;
  return { cov: pct(cov), red: pct(red), unc, lo: pct(cl), hi: pct(ch), exp: Math.round((1000 * acc) / (JIT_DRAWS * tot)) / 10 };
}