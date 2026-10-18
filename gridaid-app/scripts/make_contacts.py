"""Public contact details for candidate sites -> frontend/public/contacts/<fips>.json

  python scripts/make_contacts.py            # every county in backend/data.json that has cached OSM data

Only what OpenStreetMap contributors have published on the building itself: phone, website, street address,
operator. Nothing is guessed. Sites are matched to backend/data.json by name and position (build.py drops some
sites, so list positions differ). Output is keyed by the site's index in data.json; sites with nothing are left out.
"""
import csv, json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "frontend" / "public" / "contacts"


def key(name, lat, lon):
    return f"{name}|{round(float(lat), 5)}|{round(float(lon), 5)}"


def main():
    counties = json.loads((ROOT / "backend" / "data.json").read_text())["counties"]
    OUT.mkdir(parents=True, exist_ok=True)
    total = found = 0
    for fips, c in sorted(counties.items()):
        osm_path, csv_path = ROOT / "data" / "raw" / "osm" / f"{fips}.json", ROOT / "data" / "narrowed" / fips / "sites.csv"
        if not osm_path.exists() or not csv_path.exists():
            continue
        raw = json.loads(osm_path.read_text())
        tags = {f"{e['type']}/{e['id']}": e.get("tags", {}) for e in (raw.get("elements", raw) if isinstance(raw, dict) else raw)}
        with open(csv_path, newline="") as f:
            osm_of = {key(r["name"], r["lat"], r["lon"]): r.get("osm", "") for r in csv.DictReader(f)}
        out = {}
        for i, s in enumerate(c["sites"]):
            t = tags.get(osm_of.get(key(s["name"], s["lat"], s["lon"]), ""), {})
            addr = " ".join(x for x in [t.get("addr:housenumber"), t.get("addr:street")] if x)
            if addr and t.get("addr:city"):
                addr += f", {t['addr:city']}"
            info = {"phone": t.get("phone") or t.get("contact:phone"), "web": t.get("website") or t.get("contact:website"),
                    "addr": addr or None, "op": t.get("operator")}
            info = {k: v for k, v in info.items() if v}
            if info:
                out[str(i)] = info
        (OUT / f"{fips}.json").write_text(json.dumps(out, separators=(",", ":")))
        total += len(c["sites"]); found += len(out)
    print(f"contacts for {found} of {total} sites")


if __name__ == "__main__":
    main()
