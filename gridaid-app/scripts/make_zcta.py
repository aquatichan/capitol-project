"""Split the national emPOWER pull into per-county inputs for the optimizer.

  python scripts/make_zcta.py 48113 48157          # specific counties by FIPS
  python scripts/make_zcta.py --all                # every county (3,206 folders)

Writes data/counties/<fips>/zcta.csv  (zip,lat,lon,weight,masked) and meta.json.
weight = Power_Dependent_Devices_DME as published. HHS publishes any count of 1-10 as 11
(masked=True), so those ZIPs are slightly overstated; we keep the published value.
"""
import csv, json, sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "empower_national.csv"
OUT = ROOT / "data" / "narrowed"
RADIUS = {"11001": 1.5}   # per-county overrides, miles; default is 10. DC is ~10 mi across, so large radii saturate at k=3-4

by_fips = defaultdict(list)
with open(RAW, newline="") as f:
    for r in csv.DictReader(f):
        by_fips[r["FIPS_Code"]].append(r)

args = sys.argv[1:]
if not args:
    sys.exit("usage: make_zcta.py <fips> [<fips> ...]   or   make_zcta.py --all")
targets = sorted(by_fips) if "--all" in args else args
for fips in targets:
    rows = by_fips.get(fips)
    if not rows:
        print(f"{fips}: not in data, skipped"); continue
    d = OUT / fips; d.mkdir(parents=True, exist_ok=True)
    with open(d / "zcta.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["zip", "lat", "lon", "weight", "masked"])
        for r in sorted(rows, key=lambda r: r["Zip_Code"]):
            w.writerow([r["Zip_Code"], r["lat"], r["lon"], r["Power_Dependent_Devices_DME"], r["masked"]])
    name = f'{rows[0]["COUNTY"]} County, {rows[0]["STATE"]}' if rows[0]["STATE"] != "DC" else "District of Columbia"
    meta = {"fips": fips, "name": name}
    if fips in RADIUS: meta["radius_miles"] = RADIUS[fips]
    (d / "meta.json").write_text(json.dumps(meta, indent=2))
    tot = sum(int(r["Power_Dependent_Devices_DME"]) for r in rows)
    print(f"{fips} {name}: {len(rows)} ZIPs, weight {tot}, masked {sum(r['masked']=='True' for r in rows)}")
