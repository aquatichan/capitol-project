"""Fetch candidate backup-power sites for counties -> data/counties/<fips>/sites.csv

  python scripts/fetch_sites.py                 # every county folder that has a zcta.csv
  python scripts/fetch_sites.py 48201 11001     # specific counties (FIPS)
  python scripts/fetch_sites.py --refresh       # ignore cached downloads
  python scripts/fetch_sites.py --types fire_station,library

How it works
  1. County boundary: US Census TIGERweb (authoritative), cached in data/raw/boundaries/<fips>.geojson
  2. Facilities: OpenStreetMap via Overpass, queried over the boundary's bounding box, cached raw in
     data/raw/osm/<fips>.json so reruns work offline.
  3. Keep only sites that fall INSIDE the county polygon (point-in-polygon), drop private-access sites,
     and merge duplicate mappings of the same facility (same name within 150 m).
  4. Report a quality check: share of the county's emPOWER weight within the county radius of >= 1 site.

Output columns: name,lat,lon,type,osm
"""
import csv, json, math, re, sys, time
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "narrowed"
RAW = ROOT / "data" / "raw"
HEADERS = {"User-Agent": "GridAid/1.0 (county backup-power planning; github.com/aquatichan)"}
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
TIGER = ("https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query")
CATEGORIES = {   # label -> (OSM key, value)
    "fire_station": ("amenity", "fire_station"),
    "library": ("amenity", "library"),
    "community_centre": ("amenity", "community_centre"),
    "school": ("amenity", "school"),
}
DEDUPE_M = 150
DEFAULT_RADIUS = 10.0   # must match build.py


# ---------- geometry ----------
def hav_mi(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(x))


def in_ring(lon, lat, ring):
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]; xj, yj = ring[j][0], ring[j][1]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def polygons_of(geom):
    """GeoJSON Polygon/MultiPolygon -> list of polygons; each polygon = [outer_ring, *hole_rings]."""
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    if geom["type"] == "MultiPolygon":
        return geom["coordinates"]
    raise ValueError(f"unsupported geometry {geom['type']}")


def in_county(lon, lat, polys):
    for poly in polys:
        if in_ring(lon, lat, poly[0]) and not any(in_ring(lon, lat, h) for h in poly[1:]):
            return True
    return False


def bbox_of(polys):
    pts = [pt for poly in polys for ring in poly for pt in ring]
    lons, lats = [p[0] for p in pts], [p[1] for p in pts]
    return min(lats), min(lons), max(lats), max(lons)


# ---------- network (cached) ----------
def cached(path, refresh, producer):
    if path.exists() and not refresh:
        return json.loads(path.read_text())
    data = producer()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data))
    return data


def get_boundary(fips, refresh):
    def go():
        params = {"where": f"GEOID='{fips}'", "outFields": "GEOID,NAME", "outSR": "4326", "f": "geojson",
                  "maxAllowableOffset": "0.0005", "geometryPrecision": "5"}   # ~50 m simplification
        r = requests.get(TIGER, params=params, headers=HEADERS, timeout=120)
        r.raise_for_status()
        j = r.json()
        if not j.get("features"):
            raise RuntimeError(f"Census returned no county for GEOID {fips}")
        return j
    return cached(RAW / "boundaries" / f"{fips}.geojson", refresh, go)


def overpass(query):
    last = None
    for attempt in range(4):
        for url in OVERPASS:
            try:
                r = requests.post(url, data={"data": query}, headers=HEADERS, timeout=300)
                if r.status_code in (429, 504):
                    raise RuntimeError(f"HTTP {r.status_code} (server busy)")
                r.raise_for_status()
                j = r.json()
                if "remark" in j and "error" in j["remark"].lower():
                    raise RuntimeError(j["remark"])
                return j
            except Exception as e:
                last = e
                print(f"  {url.split('/')[2]}: {e}")
        time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"Overpass failed after retries: {last}")


def get_osm(fips, bbox, types, refresh):
    s, w, n, e = bbox
    parts = "".join(f'nwr["{CATEGORIES[t][0]}"="{CATEGORIES[t][1]}"]({s:.5f},{w:.5f},{n:.5f},{e:.5f});' for t in types)
    q = f"[out:json][timeout:240];({parts});out center tags;"
    return cached(RAW / "osm" / f"{fips}.json", refresh, lambda: overpass(q))


# ---------- parsing / cleaning ----------
def label_of(tags, types):
    for t in types:
        k, v = CATEGORIES[t]
        if tags.get(k) == v:
            return t
    return None


def norm(name):
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


def parse(elements, polys, types):
    """Elements -> cleaned site rows. Drops: no coordinates, outside county, private/no access, duplicates."""
    out, by_name, dropped = [], {}, {"outside": 0, "private": 0, "duplicate": 0}
    for e in elements:
        t = e.get("tags", {})
        lat = e.get("lat", (e.get("center") or {}).get("lat"))
        lon = e.get("lon", (e.get("center") or {}).get("lon"))
        typ = label_of(t, types)
        if lat is None or lon is None or typ is None:
            continue
        if t.get("access") in ("private", "no"):
            dropped["private"] += 1; continue
        if not in_county(lon, lat, polys):
            dropped["outside"] += 1; continue
        name = t.get("name") or f"{typ.replace('_', ' ').title()} ({e['type'][0]}{e['id']})"
        key = norm(name)
        if t.get("name") and any(hav_mi(lat, lon, la, lo) * 1609.34 < DEDUPE_M for la, lo in by_name.get(key, [])):
            dropped["duplicate"] += 1; continue
        by_name.setdefault(key, []).append((lat, lon))
        out.append((name, round(lat, 6), round(lon, 6), typ, f"{e['type']}/{e['id']}"))
    return out, dropped


def quality(d, rows):
    """Share of the county's emPOWER weight within the county radius of at least one site."""
    meta = json.loads((d / "meta.json").read_text()) if (d / "meta.json").exists() else {}
    R = float(meta.get("radius_miles", DEFAULT_RADIUS))
    with open(d / "zcta.csv", newline="") as f:
        Z = [(float(r["lat"]), float(r["lon"]), float(r["weight"])) for r in csv.DictReader(f)]
    tot = sum(z[2] for z in Z) or 1
    cov = sum(w for la, lo, w in Z if any(hav_mi(la, lo, s[1], s[2]) <= R for s in rows))
    return R, 100 * cov / tot


def fetch(fips, types, refresh):
    d = DATA / fips
    if not (d / "zcta.csv").exists():
        print(f"{fips}: no zcta.csv (run make_zcta.py {fips} first), skipped"); return
    geo = get_boundary(fips, refresh)
    polys = polygons_of(geo["features"][0]["geometry"])
    osm = get_osm(fips, bbox_of(polys), types, refresh)
    rows, dropped = parse(osm.get("elements", []), polys, types)
    with open(d / "sites.csv", "w", newline="") as f:
        w = csv.writer(f); w.writerow(["name", "lat", "lon", "type", "osm"]); w.writerows(rows)
    by = {}
    for r in rows: by[r[3]] = by.get(r[3], 0) + 1
    R, pct = quality(d, rows) if rows else (None, 0.0)
    print(f"{fips}: {len(rows)} sites {by}; dropped {dropped}")
    if rows: print(f"      {pct:.1f}% of emPOWER weight is within {R:g} mi of at least one site")
    if len(rows) < 10: print(f"      WARNING: only {len(rows)} sites. OSM may be sparse here; the optimizer will have little to choose from.")
    elif pct < 60: print(f"      WARNING: low reachable share. Check the radius in meta.json or OSM coverage.")


if __name__ == "__main__":
    args = sys.argv[1:]
    refresh = "--refresh" in args
    types = list(CATEGORIES)
    if "--types" in args:
        i = args.index("--types"); types = args[i + 1].split(","); del args[i:i + 2]
        bad = [t for t in types if t not in CATEGORIES]
        if bad: sys.exit(f"unknown type(s) {bad}; choose from {list(CATEGORIES)}")
    targets = [a for a in args if not a.startswith("--")] or sorted(p.name for p in DATA.iterdir() if (p / "zcta.csv").exists())
    for i, fips in enumerate(targets):
        try:
            fetch(fips, types, refresh)
        except Exception as e:
            print(f"{fips}: FAILED ({e})")
        if i < len(targets) - 1: time.sleep(3)   # be polite to public servers
