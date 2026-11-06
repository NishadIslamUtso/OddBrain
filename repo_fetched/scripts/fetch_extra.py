#!/usr/bin/env python3
"""Pull the remaining measured inputs for the 24 CosmoCode sites.

No API key needed. Writes /tmp/gen/extra_raw.json.

Three parameters are covered here:

  dust        NASA POWER AOD_55, aerosol optical depth at 550 nm.
              A real satellite/reanalysis measurement of how much dust and
              aerosol is in the air column above each site.
  isolation   Distance in km to the nearest settlement of 15,000 people or
              more, from the GeoNames cities15000 dataset (CC BY 4.0).
  radiation   Not measured anywhere on the ground at global scale, so it is
              calculated instead of guessed. See the dose model below.

SOIL and AQUEOUS are deliberately not covered here. See docs/PROVENANCE.md
for why they remain estimates.

Usage:
    python3 scripts/fetch_extra.py
"""

import csv
import io
import json
import math
import os
import time
import urllib.parse
import urllib.request
import zipfile

SITES = [
    ("atacama", -23.85, -69.15), ("rio-tinto", 37.70, -6.55),
    ("dry-valleys", -77.50, 161.00), ("devon-island", 75.55, -89.25),
    ("craters-of-the-moon", 43.42, -113.52), ("kilauea", 19.42, -155.29),
    ("mauna-kea", 19.82, -155.47), ("mojave", 35.05, -115.50),
    ("sonoran", 32.25, -112.50), ("namib", -24.50, 15.30),
    ("danakil", 14.24, 40.30), ("erta-ale", 13.60, 40.67),
    ("pilbara", -22.00, 118.20), ("wadi-rum", 29.60, 35.42),
    ("negev", 30.50, 34.90), ("ladakh", 34.10, 77.60),
    ("deception", -62.95, -60.63), ("dome-c", -75.10, 123.35),
    ("svalbard", 78.22, 15.65), ("etna", 37.75, 14.99),
    ("lanzarote", 29.05, -13.65), ("teide", 28.27, -16.64),
    ("death-valley", 36.25, -116.82), ("mono-lake", 38.00, -119.00),
]

POWER = "https://power.larc.nasa.gov/api/temporal/climatology/point"
GEONAMES = "https://download.geonames.org/export/dump/cities15000.zip"

# Geomagnetic north pole, IGRF-13 epoch 2020, in degrees.
POLE_LAT = 80.65
POLE_LON = -72.68


# --------------------------------------------------------------------------
# dust: aerosol optical depth from NASA POWER
# --------------------------------------------------------------------------
def fetch_aod(lat, lon, tries=4):
    q = urllib.parse.urlencode({
        "parameters": "AOD_55", "community": "RE",
        "longitude": f"{lon:.4f}", "latitude": f"{lat:.4f}", "format": "JSON",
    })
    last = None
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(f"{POWER}?{q}", timeout=60) as r:
                d = json.loads(r.read().decode())
            return float(d["properties"]["parameter"]["AOD_55"]["ANN"])
        except Exception as e:                      # noqa: BLE001
            last = e
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"AOD failed for {lat},{lon}: {last}")


# --------------------------------------------------------------------------
# isolation: distance to the nearest real settlement
# --------------------------------------------------------------------------
def load_cities():
    """Download GeoNames cities15000 and return (lat, lon) pairs."""
    with urllib.request.urlopen(GEONAMES, timeout=120) as r:
        blob = r.read()
    z = zipfile.ZipFile(io.BytesIO(blob))
    name = z.namelist()[0]
    rows = list(csv.reader(io.StringIO(z.read(name).decode("utf-8")),
                           delimiter="\t"))
    out = []
    for row in rows:
        try:
            out.append((float(row[4]), float(row[5])))
        except (ValueError, IndexError):
            continue
    return out


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0088
    p = math.radians
    dlat = p(lat2 - lat1)
    dlon = p(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(p(lat1)) * math.cos(p(lat2)) * math.sin(dlon / 2) ** 2)
    return 2 * r * math.asin(math.sqrt(a))


def nearest_city_km(lat, lon, cities):
    return min(haversine_km(lat, lon, cla, clo) for cla, clo in cities)


# --------------------------------------------------------------------------
# radiation: calculated, not measured and not guessed
#
# Ground-level cosmic-ray dose depends mainly on two things we already know
# for every site: how high it is, and how far it is from the magnetic pole.
#
#   1. Geomagnetic latitude from the IGRF-13 dipole pole position.
#   2. Vertical cutoff rigidity, R = 14.9 * cos^4(lambda_gm) GV
#      (Stormer dipole approximation, after Smart & Shea 2009).
#   3. Latitude enhancement factor, 1.00 at the equator rising to 2.05 at
#      the poles, scaled linearly by cutoff rigidity.
#   4. Altitude: dose rate doubles roughly every 1500 m through the lower
#      atmosphere, fitted to the Lindborg et al. (2004) table, with a sea
#      level base of 0.034 uSv/h.
#
# This is a transparent model with published inputs, not an instrument
# reading, and PROVENANCE.md says so. It does not include terrestrial dose
# from local rock, which varies a lot by geology and is not modelled.
# --------------------------------------------------------------------------
def geomagnetic_latitude(lat, lon):
    p = math.radians
    s = (math.sin(p(lat)) * math.sin(p(POLE_LAT))
         + math.cos(p(lat)) * math.cos(p(POLE_LAT))
         * math.cos(p(lon - POLE_LON)))
    return math.degrees(math.asin(max(-1.0, min(1.0, s))))


def cosmic_dose_usv_day(lat, lon, elevation_m):
    lam = geomagnetic_latitude(lat, lon)
    rc = 14.9 * (math.cos(math.radians(lam)) ** 4)      # GV
    f_lat = 1.0 + 1.05 * (1.0 - rc / 14.9)              # 1.00 .. 2.05
    base = 0.034 * (2.0 ** (elevation_m / 1500.0))      # uSv/h
    return base * f_lat * 24.0                          # uSv/day


def main():
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sites = json.load(open(os.path.join(repo, "src/data/sites.json")))
    elev = {s["id"]: s["values"]["elevation"] for s in sites}

    print("loading GeoNames settlements ...", flush=True)
    cities = load_cities()
    print(f"  {len(cities)} settlements\n", flush=True)

    out = {}
    for i, (sid, lat, lon) in enumerate(SITES, 1):
        aod = fetch_aod(lat, lon)
        dist = nearest_city_km(lat, lon, cities)
        h = elev.get(sid, 0.0)
        dose = cosmic_dose_usv_day(lat, lon, h)
        lam = geomagnetic_latitude(lat, lon)

        out[sid] = {
            "lat": lat, "lon": lon,
            "aod_55": round(aod, 4),
            "nearest_city_km": round(dist, 1),
            "geomagnetic_latitude_deg": round(lam, 2),
            "elevation_m": round(h, 1),
            "cosmic_dose_usv_day": round(dose, 2),
        }
        print(f"[{i:2d}/24] {sid:<20} AOD={aod:>6.3f}  "
              f"nearest={dist:>7.1f}km  lat_gm={lam:>6.1f}  "
              f"dose={dose:>5.2f} uSv/day", flush=True)
        time.sleep(1.2)

    os.makedirs("/tmp/gen", exist_ok=True)
    json.dump(out, open("/tmp/gen/extra_raw.json", "w"), indent=2)
    print(f"\nwrote /tmp/gen/extra_raw.json  ({len(out)} sites)")


if __name__ == "__main__":
    main()
