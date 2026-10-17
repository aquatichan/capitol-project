"""Precompute placements for counties that have zcta.csv + sites.csv -> backend/data.json

  python scripts/build.py                      # every county that has both files
  python scripts/build.py 48201 11001          # only these (merged into the existing data.json)
  python scripts/build.py 10 48201             # a bare number that is not a 5-digit FIPS is the default radius (miles)
  python scripts/build.py --no-opt             # skip the exact solve (greedy only, much faster)
  python scripts/build.py --no-filter          # keep candidate sites that look like non-shelters

Model: choose k sites to maximize the weight (people on power-dependent equipment) of ZIPs whose center is within
R miles (straight-line) of a chosen site. R defaults to 10; override per county with "radius_miles" in meta.json.

Two placements are produced for every k = 3..10:
  * phased : greedy at R, run once to k=10; each k is a prefix, so centers are only ever ADDED as k grows.
  * robust : exact optimum (MILP, HiGHS) of the AVERAGE coverage at 0.8R, R and 1.2R, re-solved for each k, so its
             centers can move between k values. Benchmarked against 10 other algorithms (see benchmark_out/BENCHMARK.md):
             it gives up a little coverage on paper but holds up much better when the radius or the ZIP centers are off.
Also computed: the exact max-coverage optimum at R (used only to say how close each plan is to the best possible on paper).
Every plan reports: coverage at R; redundancy (share within reach of two or more centers); coverage at 0.8R and 1.2R;
and EXPECTED coverage if each ZIP's true center is displaced by about 0.35 x the distance to the next ZIP (an assumption).
Ties (many sites cover exactly the same ZIPs) are broken by site quality, not list order.
"""
import csv, json, re, sys, time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "narrowed"
OUT = ROOT / "backend" / "data.json"
KMIN, KMAX = 3, 10
MAX_EXACT_SITES = 1500      # after dominated-site pruning
MILP_SECONDS = 10

RADIUS_MULTS = (0.8, 1.0, 1.2)       # radii the robust plan optimizes against
SIGMA_SCALE, JIT_DRAWS, JIT_CAP_MI = 0.35, 200, 10.0     # ZIP-center uncertainty model for "expected" coverage

# Candidate sites that are very unlikely to work as community backup-power centers. Edit freely.
NON_SHELTER = re.compile(
    r"\b(swim|driving school|dance|ballet|karate|martial arts|cosmetology|barber|welding|tutoring|"
    r"child ?care|day ?care|nursery|pre-?school|kindergarten|head start|early childhood|juvenile|"
    r"baseball|softball|stadium|football|soccer|athletic fields?|ball ?fields?)\b", re.I)
PLACEHOLDER = re.compile(r"\([nwr]\d+\)$")      # fetch_sites names unnamed OSM features like "School (w123)"


# Tie-break preference ONLY. It never overrides coverage: it decides between sites that cover exactly the same ZIPs.
# This ranking is a planning assumption, not data: public-serving buildings first. Edit to match local practice.
TYPE_BONUS = {"library": 0.3, "community_centre": 0.3, "school": 0.2, "fire_station": 0.1}


def site_score(name, kind=""):
    """Tie-break quality, higher is better: a real name beats a placeholder; then the type preference above."""
    return (0.0 if PLACEHOLDER.search(name) else 1.0) + TYPE_BONUS.get(kind, 0.0)


def rows(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


def hav_matrix(slat, slon, zlat, zlon):
    p = np.pi / 180
    a, c = slat[:, None] * p, zlat[None, :] * p
    x = np.sin((c - a) / 2) ** 2 + np.cos(a) * np.cos(c) * np.sin((zlon[None, :] - slon[:, None]) * p / 2) ** 2
    return 3958.8 * 2 * np.arcsin(np.sqrt(x))


def greedy(C, w, k, score):
    nS = C.shape[0]
    Cf = C.astype(np.float64)
    covered = np.zeros(C.shape[1], bool)
    chosen = np.zeros(nS, bool)
    sel = []
    for _ in range(min(k, nS)):
        gains = Cf @ (w * ~covered)
        gains[chosen] = -1
        cand = np.flatnonzero(gains >= gains.max() - 1e-9)       # every site tied for the best gain
        s = int(cand[np.argmax(score[cand])])                    # best quality first, then lowest index
        sel.append(s); chosen[s] = True; covered |= C[s]
    return sel


def prune(C, score):
    """Drop sites whose ZIP coverage is a subset of another's (never needed for max coverage). Among sites with
    identical coverage the best-scoring one is kept. Returns (original indices kept, their coverage rows)."""
    order = np.lexsort((-score, -C.sum(axis=1)))                 # size desc, then score desc, then index
    kept = []; K = np.empty_like(C); n = 0
    for s in order:
        row = C[s]
        if not row.any():
            continue
        if n and (~row[None, :] | K[:n]).all(axis=1).any():
            continue
        K[n] = row; kept.append(int(s)); n += 1
    return np.array(kept, dtype=int), K[:n]


def optimal(K, w, k):
    """Exact max coverage by MILP. Returns (optimum weight, chosen row indices of K) or (None, None)."""
    from scipy.optimize import milp, LinearConstraint, Bounds
    from scipy.sparse import csr_matrix, hstack, vstack, identity
    nS, nZ = K.shape
    top = hstack([-csr_matrix(K.T.astype(float)), identity(nZ, format="csr")])       # y_z - sum x_s <= 0
    bot = hstack([csr_matrix(np.ones((1, nS))), csr_matrix((1, nZ))])                # sum x_s <= k
    A = vstack([top, bot]).tocsr()
    lo = np.full(nZ + 1, -np.inf); hi = np.concatenate([np.zeros(nZ), [k]])
    c = np.concatenate([np.zeros(nS), -w])
    res = milp(c, constraints=LinearConstraint(A, lo, hi),
               integrality=np.concatenate([np.ones(nS), np.zeros(nZ)]), bounds=Bounds(0, 1),
               options={"time_limit": MILP_SECONDS})
    if res.status != 0 or res.x is None:
        return None, None
    return -res.fun, np.flatnonzero(res.x[:nS] > 0.5)


def order_by_gain(C, w, idxs, score):
    """Order a chosen set so each center is the one adding the most people given those before it."""
    covered = np.zeros(C.shape[1], bool); remaining = list(idxs); out, gains = [], []
    while remaining:
        g = np.array([w[C[i] & ~covered].sum() for i in remaining])
        cand = [j for j in range(len(remaining)) if g[j] >= g.max() - 1e-9]
        j = max(cand, key=lambda j: (score[remaining[j]], -remaining[j]))
        i = remaining.pop(j); out.append(int(i)); gains.append(float(g[j])); covered |= C[i]
    return out, gains


def summarize(C, w, tot, sel):
    cz = C[sel].any(axis=0)
    two = (C[sel].sum(axis=0) >= 2)
    return {"cov": round(100 * float(w[cz].sum()) / tot, 1),
            "red": round(100 * float(w[two].sum()) / tot, 1),
            "unc": np.flatnonzero(~cz).tolist()}


def jitter_cloud(zl, seed):
    """JIT_DRAWS random displacements of every ZIP center (sigma = SIGMA_SCALE x distance to the nearest other ZIP, capped)."""
    Z = len(zl)
    if Z > 1:
        zz = hav_matrix(zl[:, 0], zl[:, 1], zl[:, 0], zl[:, 1]); np.fill_diagonal(zz, np.inf)
        sigma = np.minimum(SIGMA_SCALE * zz.min(axis=1), JIT_CAP_MI)
    else:
        sigma = np.full(Z, 3.0)
    dm = np.random.default_rng(seed).normal(size=(JIT_DRAWS, Z, 2)) * sigma[None, :, None]
    lat = zl[None, :, 0] + dm[:, :, 0] / 69.0
    lon = zl[None, :, 1] + dm[:, :, 1] / (69.0 * np.cos(np.radians(zl[None, :, 0])))
    return lat.reshape(-1), lon.reshape(-1)


def expected_cov(sl, sel, cloud, R, w, tot):
    """Mean coverage (%) over the displaced-ZIP draws."""
    if len(sel) == 0:
        return 0.0
    lat, lon = cloud
    d = hav_matrix(sl[sel, 0], sl[sel, 1], lat, lon).reshape(len(sel), JIT_DRAWS, -1)
    return float(((d <= R).any(axis=0) * w[None, :]).sum(axis=1).mean() / tot * 100)


def _process(job):
    fips, default_R, do_opt, do_filter = job
    t0 = time.time()
    d = DATA / fips
    meta = json.loads((d / "meta.json").read_text()) if (d / "meta.json").exists() else {}
    Z, S = rows(d / "zcta.csv"), rows(d / "sites.csv")
    dropped = 0
    if do_filter:
        keep = [s for s in S if not NON_SHELTER.search(s["name"])]
        dropped = len(S) - len(keep); S = keep
    if not Z or not S:
        return fips, None, f"{fips}: skipped (empty zcta.csv or sites.csv)"
    R = float(meta.get("radius_miles", default_R))
    w = np.array([float(z["weight"]) for z in Z])
    if w.sum() <= 0:
        return fips, None, f"{fips}: skipped (no electricity-dependent residents recorded in any ZIP)"
    tot = w.sum()
    zl = np.array([[float(z["lat"]), float(z["lon"])] for z in Z])
    sl = np.array([[float(s["lat"]), float(s["lon"])] for s in S])
    score = np.array([site_score(s["name"], s.get("type", "")) for s in S])
    D = hav_matrix(sl[:, 0], sl[:, 1], zl[:, 0], zl[:, 1])
    C = D <= R
    CM = np.hstack([D <= m * R for m in RADIUS_MULTS])           # coverage at several radii, side by side
    wM = np.tile(w, len(RADIUS_MULTS))
    if not (CM & (wM > 0)[None, :]).any():                       # nobody (weight > 0) is reachable at any radius
        return fips, None, (f"{fips} {meta.get('name', fips)}: skipped (no candidate site is within {RADIUS_MULTS[-1] * R:.1f} mi of a ZIP with residents; "
                            f"the {R:g} mi radius is too small for this county, set radius_miles in its meta.json, or check sites.csv)")
    cloud = jitter_cloud(zl, int(fips) if fips.isdigit() else 0)

    def stats(sel):
        out = summarize(C, w, tot, sel)
        out["exp"] = round(expected_cov(sl, sel, cloud, R, w, tot), 1)
        out["lo"] = round(100 * float(w[(D[sel] <= RADIUS_MULTS[0] * R).any(axis=0)].sum()) / tot, 1)
        out["hi"] = round(100 * float(w[(D[sel] <= RADIUS_MULTS[-1] * R).any(axis=0)].sum()) / tot, 1)
        return out
    sel = greedy(C, w, KMAX, score)
    seen = np.zeros(C.shape[1], bool); gains = []
    for si in sel:
        gains.append(float(w[C[si] & ~seen].sum())); seen |= C[si]
    kept, K = prune(C, score) if do_opt else (None, None)
    exact = do_opt and 0 < len(K) <= MAX_EXACT_SITES
    keptM, KM = prune(CM, score) if do_opt else (None, None)
    robust = do_opt and 0 < len(KM) <= MAX_EXACT_SITES
    c = {"name": meta.get("name", fips), "R": R, "total": float(tot), "gains": gains,
         "zips": [{"z": z["zip"], "lat": float(z["lat"]), "lon": float(z["lon"]), "w": float(z["weight"]),
                   "masked": z.get("masked") == "True"} for z in Z],
         "sites": [{"name": s["name"], "lat": float(s["lat"]), "lon": float(s["lon"]), "type": s.get("type", ""), "q": float(score[i])}
                   for i, s in enumerate(S)],
         "k": {}}
    for k in range(KMIN, KMAX + 1):
        ch = sel[:k]
        entry = {"sel": ch, **stats(ch), "opt": None, "ratio": None}
        if exact:                                              # best possible on paper (coverage at R), for comparison only
            val, rows_ = optimal(K, w, k)
            if val is not None:
                got = summarize(C, w, tot, [int(kept[r]) for r in rows_])["cov"]
                assert abs(got - 100 * val / tot) < 0.06, (fips, k, got, 100 * val / tot)    # the selection achieves the optimum
                entry["opt"] = max(got, entry["cov"])
                entry["ratio"] = round(100 * entry["cov"] / entry["opt"], 1) if entry["opt"] else 100.0
        if robust:
            val, rows_ = optimal(KM, wM, k)
            if val is not None and len(rows_) > 0:
                rsel, rgains = order_by_gain(C, w, [int(keptM[r]) for r in rows_], score)
                r = stats(rsel)
                entry.update({"rsel": rsel, "rgains": rgains, "rcov": r["cov"], "rred": r["red"], "runc": r["unc"],
                              "rexp": r["exp"], "rlo": r["lo"], "rhi": r["hi"]})
        c["k"][k] = entry
    k5 = c["k"][5]
    return fips, c, (f"{fips} {c['name']}: {len(S)} sites ({dropped} non-shelter dropped) -> "
                     f"{len(K) if K is not None else '-'} after pruning, k=5 phased {k5['cov']}% (expected {k5['exp']}%) / "
                     f"robust {k5.get('rcov')}% (expected {k5.get('rexp')}%) / best on paper {k5['opt']}%, "
                     f"{time.time()-t0:.1f}s")


def process(job):
    try:
        return _process(job)
    except Exception as e:                          # report it and keep going
        return job[0], None, f"{job[0]}: FAILED ({type(e).__name__}: {e})"


def main():
    args = sys.argv[1:]
    do_opt = "--no-opt" not in args
    do_filter = "--no-filter" not in args
    args = [a for a in args if not a.startswith("--")]
    fips_args = [a for a in args if a.isdigit() and len(a) == 5]
    nums = [a for a in args if a not in fips_args]
    default_R = float(nums[0]) if nums else 10.0
    if fips_args:
        targets = fips_args
    else:
        targets = sorted(p.name for p in DATA.iterdir() if (p / "zcta.csv").exists() and (p / "sites.csv").exists())
    ready = [f for f in targets if (DATA / f / "zcta.csv").exists() and (DATA / f / "sites.csv").exists()]
    for f in set(targets) - set(ready):
        print(f"{f}: skipped (needs zcta.csv and sites.csv)")
    out = {"R": default_R, "counties": {}}
    if fips_args and OUT.exists():
        out = json.loads(OUT.read_text()); out["R"] = default_R
        out.pop("narrowed", None)
        out.setdefault("counties", {})
    t0 = time.time()
    jobs = [(f, default_R, do_opt, do_filter) for f in ready]
    if len(jobs) > 1:
        with ProcessPoolExecutor() as ex:
            results = list(ex.map(process, jobs))
    else:
        results = [process(j) for j in jobs]
    skipped = failed = 0
    for fips, c, log in results:
        print(log)
        if c is not None:
            out["counties"][fips] = c
        elif "FAILED" in log:
            failed += 1
        else:
            skipped += 1
    if skipped or failed:
        print(f"{len(results) - skipped - failed} built, {skipped} skipped, {failed} failed (details above)")
    OUT.write_text(json.dumps(out))
    print(f"wrote {OUT.relative_to(ROOT)}: {len(out['counties'])} counties total, {time.time()-t0:.1f}s")


if __name__ == "__main__":
    main()