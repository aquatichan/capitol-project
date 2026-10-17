"""GridAid precompute. For each folder data/<county>/ containing:
   zcta.csv  -> zip,lat,lon,weight   (weight = emPOWER count; suppressed cells already filled)
   sites.csv -> name,lat,lon         (candidate backup-power centers)
Writes data.json. Usage: python build.py [R_miles]  (default 10)
Coverage = share of weight within R miles (straight-line) of a chosen site."""
import csv, json, math, os, sys
R = float(sys.argv[1]) if len(sys.argv) > 1 else 10.0
KMIN, KMAX = 3, 10

def hav(a, b, c, d):
    p = math.pi/180; x = math.sin((c-a)*p/2)**2 + math.cos(a*p)*math.cos(c*p)*math.sin((d-b)*p/2)**2
    return 3958.8*2*math.asin(math.sqrt(x))

def rows(path): return list(csv.DictReader(open(path)))

def greedy(cov, w, nS, k):
    covered, sel = set(), []
    for _ in range(k):
        best, gain = None, -1
        for s in range(nS):
            if s in sel: continue
            g = sum(w[z] for z in cov[s] if z not in covered)
            if g > gain: best, gain = s, g
        sel.append(best); covered |= cov[best]
    return sel, covered

def optimal(cov, w, nS, k):
    """Exact max coverage via MILP (scipy/HiGHS). Vars: x_s (site chosen), y_z (zip covered)."""
    import numpy as np
    from scipy.optimize import milp, LinearConstraint, Bounds
    from scipy.sparse import lil_matrix
    nZ = len(w); n = nS + nZ
    c = np.concatenate([np.zeros(nS), -np.array(w)])           # maximize covered weight
    A = lil_matrix((nZ + 1, n)); lo = np.full(nZ + 1, -np.inf); hi = np.zeros(nZ + 1)
    for z in range(nZ):                                        # y_z - sum(x_s covering z) <= 0
        A[z, nS + z] = 1
        for s in range(nS):
            if z in cov[s]: A[z, s] = -1
    for s in range(nS): A[nZ, s] = 1                           # sum x_s <= k
    hi[nZ] = k
    res = milp(c, constraints=LinearConstraint(A.tocsr(), lo, hi), integrality=np.concatenate([np.ones(nS), np.zeros(nZ)]),
               bounds=Bounds(0, 1), options={"time_limit": 20})
    return -res.fun if res.x is not None else None

out = {"R": R, "counties": {}}
for name in sorted(os.listdir("data")):
    d = os.path.join("data", name)
    if not os.path.isfile(os.path.join(d, "zcta.csv")): continue
    Z = rows(os.path.join(d, "zcta.csv")); S = rows(os.path.join(d, "sites.csv"))
    w = [float(z["weight"]) for z in Z]; tot = sum(w) or 1
    cov = [{i for i, z in enumerate(Z) if hav(float(s["lat"]), float(s["lon"]), float(z["lat"]), float(z["lon"])) <= R} for s in S]
    c = {"zips": [{"z": z["zip"], "lat": float(z["lat"]), "lon": float(z["lon"]), "w": w[i]} for i, z in enumerate(Z)],
         "sites": [{"name": s["name"], "lat": float(s["lat"]), "lon": float(s["lon"])} for s in S], "k": {}}
    sel, _ = greedy(cov, w, len(S), KMAX)          # one run to k=10; slider = prefix
    for k in range(KMIN, KMAX+1):
        ch = sel[:k]; cz = set().union(*[cov[s] for s in ch])
        g = sum(w[z] for z in cz)
        opt = optimal(cov, w, len(S), k) if len(S) <= 400 else None
        c["k"][k] = {"sel": ch, "cov": round(100*g/tot, 1), "unc": [i for i in range(len(Z)) if i not in cz],
                     "opt": round(100*opt/tot, 1) if opt else None,
                     "ratio": round(100*g/opt, 1) if opt else None}
    out["counties"][name] = c
    print(name, {k: (v["cov"], v["opt"]) for k, v in c["k"].items()})
json.dump(out, open("data.json", "w"))
