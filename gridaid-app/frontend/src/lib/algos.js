// Placement algorithms for budgeted max coverage (every center costs 1, so the budget is k centers).
// Compact ports of backend/optimizer.py; they run inside solver.worker.js so the page never stalls.
// A problem is a list of "elements" (ZIP, or ZIP x reach for the robust plan) with weights, and for each
// candidate site the elements it reaches. Sites that reach exactly the same elements are merged first.

const EPS = 1e-9;

// Optional time limit for the slow searches (the logistics page runs all seven at once on big budgets).
// They stop early and return the best plan so far. Infinity unless a caller sets it; always reset after use.
const T = { stop: Infinity };
export const deadline = (ms) => { T.stop = performance.now() + ms; };
const late = () => performance.now() > T.stop;

export function makeProblem(D, Z, S, radii, w, q) {
  const m = Z * radii.length, W = new Float64Array(m);
  radii.forEach((_, r) => { for (let z = 0; z < Z; z++) W[r * Z + z] = w[z] / radii.length; });
  const seen = new Map(), cov = [], site = [], qq = [];
  for (let s = 0; s < S; s++) {
    const L = [];
    radii.forEach((R, r) => { for (let z = 0; z < Z; z++) if (D[s * Z + z] <= R) L.push(r * Z + z); });
    if (!L.length) continue;
    const key = L.join(","), j = seen.get(key);
    if (j != null) { if (q[s] > qq[j]) { site[j] = s; qq[j] = q[s]; } continue; }
    seen.set(key, cov.length); cov.push(Int32Array.from(L)); site.push(s); qq.push(q[s]);
  }
  // drop sites whose reach is a strict subset of another site's: they can never do better (bitset subset test)
  const nw = (m + 31) >> 5, bits = cov.map((L) => { const b = new Uint32Array(nw); for (const e of L) b[e >> 5] |= 1 << (e & 31); return b; });
  const keep = cov.map((L, a) => !cov.some((M, b) => b !== a && M.length > L.length && bits[a].every((x, i) => (x & bits[b][i]) === x)));
  const f = (arr) => arr.filter((_, i) => keep[i]);
  return { n: keep.filter(Boolean).length, m, W, cov: f(cov), site: f(site), q: f(qq), total: W.reduce((a, b) => a + b, 0) };
}

const add = (P, c, s) => { for (const e of P.cov[s]) c[e]++; };
const rem = (P, c, s) => { for (const e of P.cov[s]) c[e]--; };
const gain = (P, c, s) => { let g = 0; for (const e of P.cov[s]) if (!c[e]) g += P.W[e]; return g; };
const counts = (P, sel) => { const c = new Uint16Array(P.m); sel.forEach((s) => add(P, c, s)); return c; };
export const value = (P, sel) => { const c = counts(P, sel); let v = 0; for (let e = 0; e < P.m; e++) if (c[e]) v += P.W[e]; return v; };
const rng = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const beats = (P, g, s, bg, b) => g > bg + EPS || (b >= 0 && Math.abs(g - bg) <= EPS && P.q[s] > P.q[b]);

// Greedy: add the site that reaches the most people not yet covered. At least 63% of optimal.
export function greedy(P, k, start = []) {
  const sel = [...start], c = counts(P, sel), used = new Uint8Array(P.n);
  sel.forEach((s) => (used[s] = 1));
  while (sel.length < k) {
    let b = -1, bg = EPS;
    for (let s = 0; s < P.n; s++) if (!used[s]) { const g = gain(P, c, s); if (beats(P, g, s, bg, b)) { b = s; bg = g; } }
    if (b < 0) break;
    sel.push(b); used[b] = 1; add(P, c, b);
  }
  return { sel };
}

// Lazy greedy (CELF): same picks, but a site's old gain bounds its new one, so most sites are never re-scored.
export function lazy(P, k) {
  const c = new Uint16Array(P.m), sel = [], h = [];
  let evals = 0;
  const up = (i) => { while (i) { const p = (i - 1) >> 1; if (h[p][0] >= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } };
  const down = (i) => { for (;;) { let m = i; const l = 2 * i + 1, r = l + 1; if (l < h.length && h[l][0] > h[m][0]) m = l; if (r < h.length && h[r][0] > h[m][0]) m = r; if (m === i) return; [h[m], h[i]] = [h[i], h[m]]; i = m; } };
  const push = (x) => { h.push(x); up(h.length - 1); };
  const pop = () => { const t = h[0], last = h.pop(); if (h.length) { h[0] = last; down(0); } return t; };
  for (let s = 0; s < P.n; s++) { push([gain(P, c, s), s, 0]); evals++; }
  while (sel.length < k && h.length) {
    const [g, s, at] = pop();
    if (at === sel.length) { if (g <= EPS) break; sel.push(s); add(P, c, s); continue; }
    const ng = gain(P, c, s); evals++;
    if (ng > EPS) push([ng, s, sel.length]);
  }
  return { sel, note: `${evals.toLocaleString()} evaluations` };
}

// Beam search: greedy that keeps the best few partial plans alive instead of one.
export function beam(P, k, width = 6) {
  let states = [{ sel: [], c: new Uint16Array(P.m), v: 0 }], best = states[0];
  for (let step = 0; step < k; step++) {
    if (late()) break;
    const kids = new Map();
    for (const st of states) {
      const g = [];
      for (let s = 0; s < P.n; s++) if (!st.sel.includes(s)) { const x = gain(P, st.c, s); if (x > EPS) g.push([x, s]); }
      g.sort((a, b) => b[0] - a[0]);
      for (const [x, s] of g.slice(0, width)) {
        const sel = [...st.sel, s], key = [...sel].sort((a, b) => a - b).join();
        if (!kids.has(key)) { const c = st.c.slice(); add(P, c, s); kids.set(key, { sel, c, v: st.v + x }); }
      }
    }
    if (!kids.size) break;
    states = [...kids.values()].sort((a, b) => b.v - a.v).slice(0, width);
    if (states[0].v > best.v) best = states[0];
  }
  return { sel: best.sel };
}

// Local search: from a plan, keep making the single best add or swap until none helps.
export function local(P, k, start = greedy(P, k).sel) {
  const sel = [...start], c = counts(P, sel), used = new Uint8Array(P.n);
  sel.forEach((s) => (used[s] = 1));
  let V = value(P, sel), moves = 0;
  for (let it = 0; it < 500 && !late(); it++) {
    let bd = EPS, bp = -2, bj = -1;
    if (sel.length < k) for (let j = 0; j < P.n; j++) if (!used[j]) { const g = gain(P, c, j); if (g > bd) { bd = g; bp = -1; bj = j; } }
    for (let p = 0; p < sel.length; p++) {
      const r = sel[p]; rem(P, c, r);
      let lost = 0; for (const e of P.cov[r]) if (!c[e]) lost += P.W[e];
      for (let j = 0; j < P.n; j++) if (!used[j]) { const d = gain(P, c, j) - lost; if (d > bd) { bd = d; bp = p; bj = j; } }
      add(P, c, r);
    }
    if (bp === -2) break;
    if (bp >= 0) { rem(P, c, sel[bp]); used[sel[bp]] = 0; sel[bp] = bj; } else sel.push(bj);
    used[bj] = 1; add(P, c, bj); V += bd; moves++;
  }
  return { sel, note: `${moves} moves` };
}

// Simulated annealing: random swaps; worse plans are sometimes accepted early on to escape traps.
export function anneal(P, k, start = greedy(P, k).sel, iters = 8000, seed = 1) {
  const R = rng(seed), sel = [...start], c = counts(P, sel), used = new Uint8Array(P.n);
  sel.forEach((s) => (used[s] = 1));
  const out = []; for (let s = 0; s < P.n; s++) if (!used[s]) out.push(s);
  let V = value(P, sel), best = V, bestSel = [...sel];
  const t0 = P.W.reduce((a, b) => a + b, 0) / P.m || 1, t1 = t0 / 100;
  for (let i = 0; i < iters && out.length && sel.length && ((i & 255) || !late()); i++) {
    const T = t0 * Math.pow(t1 / t0, i / iters), p = Math.floor(R() * sel.length), j = Math.floor(R() * out.length), r = sel[p], s = out[j];
    rem(P, c, r);
    let d = -0; for (const e of P.cov[r]) if (!c[e]) d -= P.W[e];
    d += gain(P, c, s);
    if (d >= 0 || R() < Math.exp(d / T)) { add(P, c, s); sel[p] = s; out[j] = r; V += d; if (V > best + EPS) { best = V; bestSel = [...sel]; } }
    else add(P, c, r);
  }
  return { sel: bestSel };
}

// Genetic algorithm: a population of plans; children mix two parents' sites, sometimes mutate.
export function genetic(P, k, seed = 1, popSize = 30, gens = 60) {
  const R = rng(seed), cache = new Map();
  const fit = (pl) => { const key = [...pl].sort((a, b) => a - b).join(); if (!cache.has(key)) cache.set(key, value(P, pl)); return cache.get(key); };
  const fill = (pool, pl, greedyPick) => {
    pl = [...pl]; const c = counts(P, pl); pool = pool.filter((s) => !pl.includes(s));
    while (pl.length < k && pool.length) {
      let i = Math.floor(R() * pool.length);
      if (greedyPick) { let bg = -1; pool.forEach((s, x) => { const g = gain(P, c, s); if (g > bg) { bg = g; i = x; } }); }
      const s = pool.splice(i, 1)[0]; pl.push(s); add(P, c, s);
    }
    return pl;
  };
  const all = [...Array(P.n).keys()], shuffled = () => [...all].sort(() => R() - 0.5);
  let pop = [greedy(P, k).sel];
  while (pop.length < popSize) pop.push(fill(shuffled().slice(0, 40), [], pop.length % 2 === 1));
  let best = pop[0];
  for (let g = 0; g < gens && !late(); g++) {
    pop.sort((a, b) => fit(b) - fit(a));
    if (fit(pop[0]) > fit(best) + EPS) best = pop[0];
    const pick = () => { let b = pop[Math.floor(R() * pop.length)]; for (let t = 0; t < 2; t++) { const x = pop[Math.floor(R() * pop.length)]; if (fit(x) > fit(b)) b = x; } return b; };
    const next = pop.slice(0, 2);
    while (next.length < popSize) {
      let ch = fill([...new Set([...pick(), ...pick()])], [], R() < 0.5);
      if (R() < 0.35 && ch.length) { ch.splice(Math.floor(R() * ch.length), 1); ch = fill(shuffled().slice(0, 40), ch, false); }
      next.push(ch);
    }
    pop = next;
  }
  return { sel: best, note: `${cache.size} plans scored` };
}

// Branch and bound: exhaustive search that drops any branch whose best case (sum of the top remaining gains)
// cannot beat the best plan so far. Exact when it finishes inside the time limit.
export function bnb(P, k, ms = 1500, incumbent = local(P, k).sel) {
  const t0 = performance.now();
  let best = value(P, incumbent), bestSel = [...incumbent], nodes = 0, timedOut = false;
  const forb = new Uint8Array(P.n), c = new Uint16Array(P.m), sel = [];
  const dfs = (cur) => {
    nodes++;
    if (cur > best + EPS) { best = cur; bestSel = [...sel]; }
    if (best >= P.total - EPS) return;                    // everyone is covered: nothing can beat it
    if ((nodes & 255) === 0 && performance.now() - t0 > ms) timedOut = true;
    if (timedOut || sel.length >= k) return;
    const room = k - sel.length, cand = [];
    for (let s = 0; s < P.n; s++) if (!forb[s]) { const g = gain(P, c, s); if (g > EPS) cand.push([g, s]); }
    cand.sort((a, b) => b[0] - a[0]);
    const tried = [];
    for (let i = 0; i < cand.length && !timedOut; i++) {
      let bound = cur; for (let j = i; j < Math.min(cand.length, i + room); j++) bound += cand[j][0];
      if (bound <= best + EPS) break;
      const s = cand[i][1];
      sel.push(s); add(P, c, s); dfs(cur + cand[i][0]); rem(P, c, s); sel.pop();
      forb[s] = 1; tried.push(s);
    }
    tried.forEach((s) => (forb[s] = 0));
  };
  dfs(0);
  return { sel: bestSel, exact: !timedOut, note: `${nodes.toLocaleString()} nodes${timedOut ? ", stopped at time limit" : ""}` };
}

// The portfolio the "Optimal" placement uses: lazy greedy, then local search, then branch and bound;
// if that cannot prove optimality in time, annealing gets one more try.
export function best(P, k, ms = 1500) {
  const l = local(P, k, lazy(P, k).sel), b = bnb(P, k, ms, l.sel);
  if (b.exact) return b;
  const a = anneal(P, k, b.sel);
  return value(P, a.sel) > value(P, b.sel) + EPS ? { ...a, exact: false } : b;
}

export const ALGORITHMS = [
  ["greedy", "Greedy", "Add the site that reaches the most people not yet covered, one at a time.", greedy],
  ["lazy", "Lazy greedy", "Same picks as greedy, but skips re-scoring sites that cannot have improved.", lazy],
  ["beam", "Beam search", "Greedy that keeps the six best partial plans alive at each step.", beam],
  ["local", "Local search", "Starts from greedy and keeps the best single add or swap until none helps.", local],
  ["anneal", "Simulated annealing", "Random swaps; early on it accepts worse plans to escape dead ends.", anneal],
  ["genetic", "Genetic", "Breeds a population of plans, mixing and mutating the strongest.", genetic],
  ["bnb", "Branch and bound", "Checks every plan that could still win, skipping the rest. Exact if it finishes.", bnb],
];
