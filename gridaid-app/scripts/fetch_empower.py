import csv
import sys
import time
from pathlib import Path

import requests

URL = (
    "https://services2.arcgis.com/ZQ4jTQn6k7VPXEwO/ArcGIS/rest/services/"
    "HHS_emPOWER_REST_Service_Public/FeatureServer/1/query"
)

FIELDS = [
    "OBJECTID",
    "Zip_Code",
    "COUNTY",
    "STATE",
    "FIPS_Code",
    "Medicare_Benes",
    "Power_Dependent_Devices_DME",
]

PAGE_SIZE = 2000
OUT_NAME = str(Path(__file__).resolve().parent.parent / "data" / "raw" / "empower_national.csv")


def get(params, tries=4):
    """GET with retries, since a national pull makes many requests."""
    for attempt in range(1, tries + 1):
        try:
            resp = requests.get(URL, params=params, timeout=120)
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise RuntimeError(data["error"])
            return data
        except Exception as e:
            if attempt == tries:
                raise
            wait = 5 * attempt
            print(f"  Request failed ({e}). Retrying in {wait}s...")
            time.sleep(wait)


def vertex_center(geometry):
    """Rough center of a polygon: the average of its outer ring's points."""
    ring = geometry["rings"][0]
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return sum(ys) / len(ys), sum(xs) / len(xs)


def fetch_page(offset, with_geometry):
    params = {
        "where": "1=1",
        "outFields": ",".join(FIELDS),
        "orderByFields": "OBJECTID",
        "resultOffset": offset,
        "resultRecordCount": PAGE_SIZE,
        "returnCentroid": "true",
        "returnGeometry": "true" if with_geometry else "false",
        "outSR": "4326",  # latitude/longitude
        "f": "json",
    }
    if with_geometry:
        # Simplify shapes so national pages stay small. We only need a center.
        params["maxAllowableOffset"] = "0.01"
        params["geometryPrecision"] = "4"
    return get(params)


def center_of(feature):
    centroid = feature.get("centroid")
    if centroid:
        return centroid["y"], centroid["x"]
    geometry = feature.get("geometry")
    if geometry and geometry.get("rings"):
        return vertex_center(geometry)
    return None, None


def main():
    total = get({"where": "1=1", "returnCountOnly": "true", "f": "json"})["count"]
    print(f"ZIP codes to download: {total}")

    # Try the light version (centers only, no shapes). If the service
    # doesn't send centers that way, fall back to simplified shapes.
    first = fetch_page(0, with_geometry=False)
    with_geometry = not any(f.get("centroid") for f in first.get("features", []))
    if with_geometry:
        print("Centers not returned without shapes; using simplified shapes.")
        first = fetch_page(0, with_geometry=True)

    rows = 0
    offset = 0
    page = first
    with open(OUT_NAME, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(FIELDS + ["lat", "lon", "masked"])

        while True:
            features = page.get("features", [])
            for feat in features:
                attrs = feat["attributes"]
                lat, lon = center_of(feat)
                # emPOWER masks any count from 1 to 10 as 11.
                masked = attrs.get("Power_Dependent_Devices_DME") == 11
                writer.writerow([attrs.get(k) for k in FIELDS] + [lat, lon, masked])
            rows += len(features)
            print(f"  {rows} / {total}")

            if not features or rows >= total:
                break
            offset += len(features)
            time.sleep(0.5)  
            page = fetch_page(offset, with_geometry)

    print(f"Saved {rows} ZIP codes to {OUT_NAME}")
    if rows < total:
        print("Warning: fewer rows than expected. Run it again or tell Claude.")
        sys.exit(1)


if __name__ == "__main__":
    main()

