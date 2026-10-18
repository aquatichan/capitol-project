import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { buildDistances, evaluatePlan, getCurve, minCenters } from "./plan.js";
import { solve } from "./solver.js";

export const KMIN = 3;
export const KMAX = 300;       // plans for more than KPRE centers are computed live in the browser
export const KPRE = 10;        // largest budget with a precomputed plan (and a robust plan)
export const RMIN = 0.25, RMAX = 60;       // reach slider, miles, log scale
export const TARGET = 90;      // coverage the "Optimal" buttons aim for
export const MODES = { phased: "Phased", robust: "Robust", optimal: "Optimal" };

export const rToT = (r) => Math.max(0, Math.min(100, (100 * Math.log(r / RMIN)) / Math.log(RMAX / RMIN)));
export const tToR = (t) => RMIN * Math.pow(RMAX / RMIN, t / 100);
export const niceR = (r) => (r < 2 ? Math.round(r * 20) / 20 : r < 10 ? Math.round(r * 10) / 10 : Math.round(r * 2) / 2);
export const niceRUp = (r) => (r < 2 ? Math.ceil(r * 20) / 20 : r < 10 ? Math.ceil(r * 10) / 10 : Math.ceil(r * 2) / 2);

// The controls show k and reach immediately; the plan follows a frame behind (useDeferredValue), so dragging a
// slider never waits on the map. Robust and optimal plans not precomputed by build.py come from the worker.
export function usePlan({ data, fips, k: kNow, radius: rNow, mode }) {
  const k = useDeferredValue(kNow), radius = useDeferredValue(rNow);
  const county = data && fips ? data.counties[fips] ?? null : null;
  const R = county ? radius ?? county.R : 0;
  const atDefault = !county || radius == null || Math.abs(radius - county.R) < 1e-9;
  const pre = county && atDefault && k <= KPRE ? county.k[String(k)] ?? null : null;

  const D = useMemo(() => (county ? buildDistances(county) : null), [county]);
  const curve = useMemo(() => (county && D ? getCurve(county, D, R) : null), [county, D, R]);

  // robust/optimal from the worker, debounced so a slider drag sends one request, not forty
  const preRobust = mode === "robust" && Array.isArray(pre?.rsel);
  const asyncKey = county && mode !== "phased" && !preRobust ? `${fips}|${mode}|${k}|${R}` : null;
  const [solved, setSolved] = useState(null);
  useEffect(() => {
    if (!asyncKey) return;
    let live = true;
    const t = setTimeout(() => {
      solve(fips, county, "plan", { method: mode, k, R }).then((r) => live && setSolved({ key: asyncKey, ...r })).catch(() => {});
    }, 160);
    return () => { live = false; clearTimeout(t); };
  }, [asyncKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = useMemo(() => {
    if (!county || !D || !curve) return null;
    const ev = (sel) => evaluatePlan(county, D, sel, R, Number(fips) || 0);
    let v, source = mode, pending = false, exact = false;
    if (preRobust) v = { sel: pre.rsel, gains: pre.rgains, unc: pre.runc, cov: pre.rcov, red: pre.rred, exp: pre.rexp, lo: pre.rlo, hi: pre.rhi };
    else if (asyncKey && solved?.key === asyncKey) { v = { sel: solved.sel, gains: solved.gains, ...ev(solved.sel) }; exact = solved.exact; }
    else {
      pending = !!asyncKey;
      source = "phased";
      v = pre
        ? { sel: pre.sel, gains: county.gains.slice(0, pre.sel.length), unc: pre.unc, cov: pre.cov, red: pre.red, exp: pre.exp, lo: pre.lo, hi: pre.hi }
        : { sel: curve.sel.slice(0, k), gains: curve.gains.slice(0, k), ...ev(curve.sel.slice(0, k)) };
    }
    const { zips } = county, Z = zips.length, tot = county.total || 1;
    // a center that reaches no one the others don't already reach is not needed: drop it (last ones first)
    const cnt = new Uint16Array(Z);
    for (const s of v.sel) for (let z = 0; z < Z; z++) if (D[s * Z + z] <= R) cnt[z]++;
    const keep = v.sel.map(() => true);
    for (let i = v.sel.length - 1; i >= 0; i--) {
      const s = v.sel[i];
      let needed = false;
      for (let z = 0; z < Z && !needed; z++) if (D[s * Z + z] <= R && cnt[z] < 2 && zips[z].w > 0) needed = true;
      if (needed) continue;
      keep[i] = false;
      for (let z = 0; z < Z; z++) if (D[s * Z + z] <= R) cnt[z]--;
    }
    if (keep.includes(false) && keep.includes(true)) {
      const sel = v.sel.filter((_, i) => keep[i]);
      // a dropped center may have come first and claimed people the kept ones also reach: recount each one's gain
      const got = new Uint8Array(Z);
      const gains = sel.map((s) => {
        let g = 0;
        for (let z = 0; z < Z; z++) if (!got[z] && D[s * Z + z] <= R) { got[z] = 1; g += zips[z].w; }
        return g;
      });
      v = { sel, gains, ...ev(sel) };
    }
    let run = 0;
    const chosen = v.sel.map((si, i) => {
      run += v.gains?.[i] ?? 0;
      return { ...county.sites[si], idx: si, n: i + 1, gain: v.gains?.[i] ?? 0, cum: Math.min(100, (100 * run) / tot) };
    });
    // nearest planned center per ZIP, straight line from the ZIP's representative point
    const nearN = new Int16Array(Z), nearD = new Float64Array(Z);
    for (let z = 0; z < Z; z++) {
      let best = Infinity, bi = 0;
      for (let i = 0; i < v.sel.length; i++) {
        const d = D[v.sel[i] * Z + z];
        if (d < best) { best = d; bi = i; }
      }
      nearN[z] = bi + 1;
      nearD[z] = best;
    }
    return { ...v, chosen, uncovered: new Set(v.unc), nearN, nearD, source, pending, exact };
  }, [county, D, curve, pre, preRobust, asyncKey, solved, mode, k, R, fips]);

  const needed = useMemo(() => (curve ? minCenters(curve, TARGET) : null), [curve]);

  return { county, R, atDefault, D, curve, plan, needed };
}
