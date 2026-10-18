// Runs the slow placement work off the main thread: robust and optimal plans, the algorithm comparison,
// and the "Optimal" buttons (fewest centers / shortest reach for a coverage target).
import { buildDistances, greedyCurve, minCenters, minReach } from "./plan.js";
import { ALGORITHMS, best, deadline, makeProblem, value } from "./algos.js";

const counties = new Map();

function problem(c, radii) {
  const key = radii.join("|");
  if (!c.probs.has(key)) {
    if (c.probs.size > 12) c.probs.delete(c.probs.keys().next().value);
    c.probs.set(key, makeProblem(c.D, c.Z, c.S, radii, c.w, c.q));
  }
  return c.probs.get(key);
}

// back to original site indices, ordered by how many people each adds at reach R
function finish(c, P, sel, R) {
  const left = sel.map((i) => P.site[i]), out = [], gains = [], cov = new Uint8Array(c.Z);
  while (left.length) {
    let bi = 0, bg = -1;
    left.forEach((s, i) => { let g = 0; for (let z = 0; z < c.Z; z++) if (!cov[z] && c.D[s * c.Z + z] <= R) g += c.w[z]; if (g > bg) { bg = g; bi = i; } });
    const s = left.splice(bi, 1)[0];
    for (let z = 0; z < c.Z; z++) if (c.D[s * c.Z + z] <= R) cov[z] = 1;
    out.push(s); gains.push(bg);
  }
  return { sel: out, gains };
}

const pct = (c, P, sel) => (100 * value(P, sel)) / (c.w.reduce((a, b) => a + b, 0) || 1);

const ops = {
  load({ fips, zips, sites }) {
    const county = { zips: zips.map(([lat, lon, w]) => ({ lat, lon, w })), sites: sites.map(([lat, lon, q]) => ({ lat, lon, q })) };
    counties.set(fips, { county, D: buildDistances(county), Z: zips.length, S: sites.length, w: zips.map((z) => z[2]), q: sites.map((s) => s[2]), probs: new Map() });
    return true;
  },
  // robust: best average coverage at 0.8R, R and 1.2R. optimal: the best plan at R the portfolio can find.
  plan({ fips, method, k, R }) {
    const c = counties.get(fips), radii = method === "robust" ? [0.8 * R, R, 1.2 * R] : [R];
    const P = problem(c, radii), r = best(P, k, method === "robust" ? 900 : 1500);
    return { ...finish(c, P, r.sel, R), exact: !!r.exact };
  },
  compare({ fips, k, R }) {
    const c = counties.get(fips), P = problem(c, [R]);
    return ALGORITHMS.map(([key, name, about, fn]) => {
      const t = performance.now(), r = fn(P, k);
      return { key, name, about, cov: pct(c, P, r.sel), ms: performance.now() - t, exact: !!r.exact, note: r.note ?? "" };
    });
  },
  // every algorithm's placement, for the logistics simulator: sites in order of people added, each capped in time
  placements({ fips, k, R, ms = 1800 }) {
    const c = counties.get(fips), P = problem(c, [R]);
    try {
      return ALGORITHMS.map(([key, name, about, fn]) => {
        const t = performance.now();
        deadline(ms);
        const r = key === "bnb" ? fn(P, k, ms) : fn(P, k);
        return { key, name, about, cov: pct(c, P, r.sel), ms: performance.now() - t, exact: !!r.exact, ...finish(c, P, r.sel, R) };
      });
    } finally {
      deadline(Infinity);
    }
  },
  // fewest centers that reach the target at reach R; greedy gives an upper bound, the exact search tries one fewer
  minCenters({ fips, R, target }) {
    const c = counties.get(fips);
    let k = minCenters(greedyCurve(c.county, c.D, R, 40), target);
    if (k == null) return { k: null };
    const P = problem(c, [R]);
    while (k > 1 && pct(c, P, best(P, k - 1, 800).sel) >= target - 1e-9) k--;
    return { k };
  },
  minReach({ fips, k, target }) {
    const c = counties.get(fips);
    return { R: minReach(c.county, c.D, k, target) };
  },
};

self.onmessage = ({ data: { id, op, ...args } }) => {
  try { self.postMessage({ id, result: ops[op](args) }); }
  catch (e) { self.postMessage({ id, error: String(e?.message ?? e) }); }
};
