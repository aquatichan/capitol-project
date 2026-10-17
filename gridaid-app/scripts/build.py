"""Precompute coverage for every county that has both zcta.csv and sites.csv.

  python scripts/build.py [R_miles]      (default 10)

Reads  data/counties/<fips>/{zcta.csv, sites.csv, meta.json}
Writes backend/data.json (what the API serves).
Coverage = share of weight within R miles (straight-line) of a chosen site.
Greedy runs once to k=10; each slider value is a prefix of that run. Exact optimum via MILP (SciPy/HiGHS).
"""
import csv, json, math, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "narrowed"
OUT = ROOT / "backend" / "data.json"
R = float(sys.argv[1]) if len(sys.argv) > 1 else 10.0
KMIN, KMAX = 3, 10


def hav(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(x))


def rows(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def greedy(cov, w, nS, k):
    covered, sel = set(), []
    for _ in range(min(k, nS)):
        best, gain = None, -1
        for s in range(nS):
            if s in sel:
                continue
            g = sum(w[z] for z in cov[s] if z not in covered)
            if g > gain:
                best, gain = s, g
        sel.append(best)
        covered |= cov[best]
    return sel


def prune(cov):
    """Keep only sites whose ZIP coverage is not contained in another site's. A dominated site is never needed
    for max coverage, so the exact optimum is unchanged but the solve is far smaller."""
    sets = sorted({frozenset(c) for c in cov if c}, key=len, reverse=True)
    kept = []
    for s in sets:
        if not any(s <= t for t in kept):
            kept.append(s)
    return [set(s) for s in kept]


def optimal(cov, w, nS, k):
    """Exact max coverage via MILP. Vars: x_s (site chosen), y_z (zip covered)."""
    import numpy as np
    from scipy.optimize import milp, LinearConstraint, Bounds
    from scipy.sparse import lil_matrix
    nZ = len(w); n = nS + nZ
    c = np.concatenate([np.zeros(nS), -np.array(w, dtype=float)])
    A = lil_matrix((nZ + 1, n)); lo = np.full(nZ + 1, -np.inf); hi = np.zeros(nZ + 1)
    for z in range(nZ):
        A[z, nS + z] = 1
        for s in range(nS):
            if z in cov[s]:
                A[z, s] = -1
    for s in range(nS):
        A[nZ, s] = 1
    hi[nZ] = k
    res = milp(c, constraints=LinearConstraint(A.tocsr(), lo, hi),
               integrality=np.concatenate([np.ones(nS), np.zeros(nZ)]),
               bounds=Bounds(0, 1), options={"time_limit": 20})
    return -res.fun if res.x is not None else None


out = {"R": R, "narrowed": {}}
for d in sorted(p for p in DATA.iterdir() if p.is_dir()):
    if not (d / "zcta.csv").exists() or not (d / "sites.csv").exists():
        print(f"{d.name}: skipped (needs zcta.csv and sites.csv)")
        continue
    meta = json.loads((d / "meta.json").read_text()) if (d / "meta.json").exists() else {}
    Z, S = rows(d / "zcta.csv"), rows(d / "sites.csv")
    Rc = float(meta.get("radius_miles", R))   # per-county override; small counties need a small radius
    w = [float(z["weight"]) for z in Z]
    tot = sum(w) or 1
    cov = [{i for i, z in enumerate(Z)
            if hav(float(s["lat"]), float(s["lon"]), float(z["lat"]), float(z["lon"])) <= Rc} for s in S]
    c = {"name": meta.get("name", d.name), "R": Rc,
         "zips": [{"z": z["zip"], "lat": float(z["lat"]), "lon": float(z["lon"]), "w": w[i],
                   "masked": z.get("masked") == "True"} for i, z in enumerate(Z)],
         "sites": [{"name": s["name"], "lat": float(s["lat"]), "lon": float(s["lon"]), "type": s.get("type", "")} for s in S],
         "k": {}}
    ucov = prune(cov)
    sel = greedy(cov, w, len(S), KMAX)
    for k in range(KMIN, KMAX + 1):
        ch = sel[:k]
        cz = set().union(*[cov[s] for s in ch])
        g = sum(w[z] for z in cz)
        opt = optimal(ucov, w, len(ucov), k) if len(ucov) <= 1500 else None
        c["k"][k] = {"sel": ch, "cov": round(100 * g / tot, 1),
                     "unc": [i for i in range(len(Z)) if i not in cz],
                     "opt": round(100 * opt / tot, 1) if opt else None,
                     "ratio": round(100 * g / opt, 1) if opt else None}
    out["narrowed"][d.name] = c
    print(d.name, c["name"], {k: (v["cov"], v["opt"]) for k, v in c["k"].items()})

OUT.write_text(json.dumps(out))
print(f"wrote {OUT.relative_to(ROOT)} with {len(out['narrowed'])} counties")
