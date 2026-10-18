"""Placement algorithms for budgeted maximum coverage, compact. Same methods as frontend/src/lib/algos.js,
plus exact integer programming when scipy is installed. Every center costs 1, so the budget is k centers.

  from optimizer import Problem, compare
  p = Problem.from_county(data["counties"]["48201"], radius=10, k=5)
  for r in compare(p): print(r)
"""
import heapq, math, random, time
import numpy as np

EPS = 1e-9


class Problem:
    def __init__(self, w, cover, k):
        self.w, self.C, self.k = np.asarray(w, float), np.asarray(cover, bool), int(k)
        self.Cf = self.C.astype(float)

    @classmethod
    def from_county(cls, county, radius, k):
        p = np.pi / 180
        z = np.array([[x["lat"], x["lon"]] for x in county["zips"]]); s = np.array([[x["lat"], x["lon"]] for x in county["sites"]])
        a = np.sin((z[None, :, 0] - s[:, None, 0]) * p / 2) ** 2 + np.cos(s[:, None, 0] * p) * np.cos(z[None, :, 0] * p) * np.sin((z[None, :, 1] - s[:, None, 1]) * p / 2) ** 2
        return cls([x["w"] for x in county["zips"]], 3958.8 * 2 * np.arcsin(np.sqrt(a)) <= radius, k)

    def value(self, sel):
        return float(self.w[self.C[list(sel)].any(0)].sum()) if len(sel) else 0.0

    def gains(self, covered):
        return self.Cf @ (self.w * ~covered)


def greedy(p, start=()):
    sel, cov = list(start), p.C[list(start)].any(0) if start else np.zeros(p.C.shape[1], bool)
    while len(sel) < p.k:
        g = p.gains(cov); g[sel] = -1; b = int(np.argmax(g))
        if g[b] <= EPS: break
        sel.append(b); cov |= p.C[b]
    return {"sel": sel}


def lazy_greedy(p):
    cov, sel, evals = np.zeros(p.C.shape[1], bool), [], p.C.shape[0]
    h = [(-g, s, 0) for s, g in enumerate(p.gains(cov)) if g > EPS]; heapq.heapify(h)
    while h and len(sel) < p.k:
        g, s, at = heapq.heappop(h)
        if at == len(sel): sel.append(s); cov |= p.C[s]; continue
        ng = float(p.w[p.C[s] & ~cov].sum()); evals += 1
        if ng > EPS: heapq.heappush(h, (-ng, s, len(sel)))
    return {"sel": sel, "note": f"{evals} evaluations"}


def beam_search(p, width=6):
    states, best = [(0.0, (), np.zeros(p.C.shape[1], bool))], (0.0, ())
    for _ in range(p.k):
        kids = {}
        for v, sel, cov in states:
            g = p.gains(cov); g[list(sel)] = -1
            for s in np.argsort(-g)[:width]:
                if g[s] > EPS: kids.setdefault(frozenset(sel + (int(s),)), (v + g[s], sel + (int(s),), cov | p.C[s]))
        if not kids: break
        states = sorted(kids.values(), key=lambda x: -x[0])[:width]
        best = max(best, states[0][:2], key=lambda x: x[0])
    return {"sel": list(best[1])}


def local_search(p, start=None):
    sel, moves = list(greedy(p)["sel"] if start is None else start), 0
    while True:
        cur, best = p.value(sel), (EPS, None)
        cands = [(None, sel)] if len(sel) < p.k else []
        cands += [(i, sel[:i] + sel[i + 1:]) for i in range(len(sel))]
        for i, rest in cands:
            g = p.gains(p.C[rest].any(0) if rest else np.zeros(p.C.shape[1], bool)); g[sel] = -1; j = int(np.argmax(g))
            d = p.value(rest) + g[j] - cur
            if d > best[0]: best = (d, (i, j))
        if best[1] is None: return {"sel": sel, "note": f"{moves} moves"}
        i, j = best[1]
        sel = sel + [j] if i is None else sel[:i] + [j] + sel[i + 1:]; moves += 1


def simulated_annealing(p, iters=8000, seed=1):
    rng, sel = random.Random(seed), list(greedy(p)["sel"])
    out = [s for s in range(p.C.shape[0]) if s not in sel]
    v = bv = p.value(sel); bsel, t0 = list(sel), p.w.mean() or 1.0
    for i in range(iters):
        if not sel or not out: break
        T, a, b = t0 * 0.01 ** (i / iters), rng.randrange(len(sel)), rng.randrange(len(out))
        new = sel[:a] + [out[b]] + sel[a + 1:]; nv = p.value(new)
        if nv >= v or rng.random() < math.exp((nv - v) / T):
            out[b], sel, v = sel[a], new, nv
            if v > bv + EPS: bv, bsel = v, list(sel)
    return {"sel": bsel}


def genetic(p, pop_size=30, gens=60, seed=1):
    rng, n, cache = random.Random(seed), p.C.shape[0], {}
    fit = lambda pl: cache.setdefault(frozenset(pl), p.value(pl))
    def fill(pool, pl, greedy_pick):
        pl, pool = list(pl), [s for s in pool if s not in pl]
        while len(pl) < p.k and pool:
            i = int(np.argmax(p.Cf[pool] @ (p.w * ~p.C[pl].any(0)) if pl else p.Cf[pool] @ p.w)) if greedy_pick else rng.randrange(len(pool))
            pl.append(pool.pop(i))
        return pl
    pop = [greedy(p)["sel"]] + [fill(rng.sample(range(n), min(n, 40)), [], i % 2 == 1) for i in range(pop_size - 1)]
    for _ in range(gens):
        pop.sort(key=fit, reverse=True)
        pick = lambda: max(rng.sample(pop, 3), key=fit)
        nxt = pop[:2]
        while len(nxt) < pop_size:
            ch = fill(sorted(set(pick()) | set(pick())), [], rng.random() < 0.5)
            if ch and rng.random() < 0.35: ch.pop(rng.randrange(len(ch))); ch = fill(rng.sample(range(n), min(n, 40)), ch, False)
            nxt.append(ch)
        pop = nxt
    return {"sel": max(pop, key=fit), "note": f"{len(cache)} plans scored"}


def branch_and_bound(p, seconds=2.0):
    t0, st = time.perf_counter(), {"sel": local_search(p)["sel"], "nodes": 0, "out": False}
    st["v"], total = p.value(st["sel"]), p.w.sum()
    def dfs(sel, cov, forb):
        st["nodes"] += 1; cur = float(p.w[cov].sum())
        if cur > st["v"] + EPS: st["v"], st["sel"] = cur, list(sel)
        if st["v"] >= total - EPS or len(sel) >= p.k: return
        if time.perf_counter() - t0 > seconds: st["out"] = True; return
        g = p.gains(cov); g[forb] = -1; order = [int(s) for s in np.argsort(-g) if g[s] > EPS]
        for i, s in enumerate(order):
            if cur + g[order[i:i + p.k - len(sel)]].sum() <= st["v"] + EPS or st["out"]: break
            f = forb.copy(); f[order[:i]] = True
            dfs(sel + [s], cov | p.C[s], f)
    dfs([], np.zeros(p.C.shape[1], bool), np.zeros(p.C.shape[0], bool))
    return {"sel": st["sel"], "exact": not st["out"], "note": f"{st['nodes']} nodes"}


def exact_milp(p, seconds=10.0):
    from scipy.optimize import Bounds, LinearConstraint, milp
    from scipy.sparse import csr_matrix, hstack, identity, vstack
    nS, nZ = p.C.shape
    A = vstack([hstack([csr_matrix(-p.Cf.T), identity(nZ)]), csr_matrix(np.r_[np.ones(nS), np.zeros(nZ)][None])])
    r = milp(np.r_[np.zeros(nS), -p.w], constraints=LinearConstraint(A, -np.inf, np.r_[np.zeros(nZ), p.k]),
             integrality=np.r_[np.ones(nS), np.zeros(nZ)], bounds=Bounds(0, 1), options={"time_limit": seconds})
    return {"sel": [int(s) for s in np.flatnonzero(r.x[:nS] > 0.5)], "exact": r.status == 0}


ALGORITHMS = {"greedy": greedy, "lazy_greedy": lazy_greedy, "beam_search": beam_search, "local_search": local_search,
              "simulated_annealing": simulated_annealing, "genetic": genetic, "branch_and_bound": branch_and_bound,
              "exact_milp": exact_milp}


def compare(p, methods=None):
    out, total = [], p.w.sum() or 1.0
    for name in methods or ALGORITHMS:
        t = time.perf_counter()
        try: r = ALGORITHMS[name](p)
        except ImportError: continue                     # exact_milp without scipy
        out.append({"method": name, "sel": [int(s) for s in r["sel"]], "cov": round(100 * p.value(r["sel"]) / total, 2),
                    "ms": round(1000 * (time.perf_counter() - t), 1), "exact": bool(r.get("exact")), "note": r.get("note", "")})
    return out
