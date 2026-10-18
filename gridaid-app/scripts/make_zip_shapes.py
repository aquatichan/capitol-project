"""Cut ZIP boundary polygons for every county in backend/data.json -> frontend/public/zips/<fips>.json

  python scripts/make_zip_shapes.py path/to/cb_2020_us_zcta520_500k.shp

Boundaries are the US Census Bureau's 2020 cartographic ZIP Code Tabulation Areas (public domain):
  https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_us_zcta520_500k.zip
Unzip it somewhere outside the repo and pass the .shp path.

Why polygons: the map used to draw one circle per ZIP, so a ZIP's mark changed size with the zoom level and said
nothing about where the ZIP really is. Real boundaries stay put at every zoom.

Output per county: {"v": 1, "zips": {"77077": {"a": <land+water sq mi>, "p": [polygon, ...]}}, "missing": [...]}
  polygon = [ring, ...], ring = [[lat, lon], ...]  (Leaflet's order, 4 decimals ~ 11 m)
Neighbouring ZIPs are simplified together (shapely coverage_simplify) so shared borders stay shared and no slivers open up.
ZIPs with no ZCTA polygon (PO-box and single-building ZIPs) are listed under "missing"; the map draws them as points.
"""
import json
import math
import sys
from pathlib import Path

import shapefile
import shapely
from shapely.geometry import shape

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "backend" / "data.json"
OUT = ROOT / "frontend" / "public" / "zips"
TOLERANCE_DEG = 0.0007       # ~75 m: invisible at county zoom, still clean at street zoom
DECIMALS = 4
MILES_PER_DEG = 69.172


def area_sq_mi(geom):
    """Area in square miles using a local equirectangular projection (good to ~1% at county scale)."""
    lat0 = geom.centroid.y
    k = math.cos(math.radians(lat0))
    scaled = shapely.transform(geom, lambda xy: xy * [MILES_PER_DEG * k, MILES_PER_DEG])
    return scaled.area


def polygons_of(geom):
    if geom.is_empty:
        return []
    return list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]


def ring_out(ring):
    pts = [[round(y, DECIMALS), round(x, DECIMALS)] for x, y in ring.coords]
    out = [pts[0]]
    for p in pts[1:]:                                  # rounding can collapse neighbours
        if p != out[-1]:
            out.append(p)
    return out if len(out) >= 4 else None


def main(shp_path):
    counties = json.loads(DATA.read_text())["counties"]
    wanted = {z["z"] for c in counties.values() for z in c["zips"]}

    rd = shapefile.Reader(shp_path)
    fields = [f[0] for f in rd.fields[1:]]
    key = "ZCTA5CE20" if "ZCTA5CE20" in fields else "GEOID20"
    geoms = {}
    for sr in rd.iterShapeRecords():
        z = sr.record[fields.index(key)]
        if z in wanted:
            geoms[z] = shape(sr.shape.__geo_interface__)
    print(f"{len(geoms)} of {len(wanted)} ZIPs have a ZCTA polygon")

    OUT.mkdir(parents=True, exist_ok=True)
    total_bytes = 0
    for fips, c in sorted(counties.items()):
        ids = [z["z"] for z in c["zips"] if z["z"] in geoms]
        missing = [z["z"] for z in c["zips"] if z["z"] not in geoms]
        # simplify the county's ZIPs together, but cut each ZIP's geometry down to its own polygons first
        flat, owner = [], []
        for z in ids:
            for p in polygons_of(geoms[z]):
                flat.append(p)
                owner.append(z)
        try:
            simp = list(shapely.coverage_simplify(flat, TOLERANCE_DEG))
        except Exception:                               # invalid coverage (overlaps): fall back to per-polygon
            simp = [p.simplify(TOLERANCE_DEG, preserve_topology=True) for p in flat]
        zips = {}
        for z, orig, p in zip(owner, flat, simp):
            ent = zips.setdefault(z, {"a": 0.0, "p": []})
            ent["a"] += area_sq_mi(orig)
            for poly in polygons_of(p):
                rings = [ring_out(poly.exterior)] + [ring_out(r) for r in poly.interiors]
                if rings[0] is None:
                    continue
                ent["p"].append([r for r in rings if r])
        for z, ent in zips.items():
            ent["a"] = round(ent["a"], 2)
        text = json.dumps({"v": 1, "zips": zips, "missing": missing}, separators=(",", ":"))
        (OUT / f"{fips}.json").write_text(text)
        total_bytes += len(text)
        if fips == "48201":
            print(f"Harris: {len(zips)} polygons, {len(text) / 1024:.0f} KB, missing {missing}")
    print(f"wrote {len(counties)} files, {total_bytes / 1e6:.1f} MB total")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
