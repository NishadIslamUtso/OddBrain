#!/usr/bin/env python3
"""Pull real climatology for the 24 CosmoCode sites from NASA POWER.

No API key needed. Writes /tmp/gen/power_raw.json.

Parameters pulled (annual climatology, source-native resolution):
  T2M          air temperature at 2 m          deg C
  T2M_MAX      max air temperature at 2 m      deg C
  T2M_MIN      min air temperature at 2 m      deg C
  RH2M         relative humidity at 2 m        %
  PS           surface pressure                kPa
  PRECTOTCORR  precipitation, corrected        mm/day
The POINT response also carries the grid elevation in metres.
"""
import json, time, urllib.parse, urllib.request, sys

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

BASE = "https://power.larc.nasa.gov/api/temporal/climatology/point"
PARAMS = "T2M,T2M_MAX,T2M_MIN,RH2M,PS,PRECTOTCORR"


def fetch(lat, lon, tries=4):
    q = urllib.parse.urlencode({
        "parameters": PARAMS, "community": "RE",
        "longitude": f"{lon:.4f}", "latitude": f"{lat:.4f}", "format": "JSON",
    })
    last = None
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(f"{BASE}?{q}", timeout=60) as r:
                return json.loads(r.read().decode())
        except Exception as e:                      # noqa: BLE001
            last = e
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"failed {lat},{lon}: {last}")


out = {}
for i, (sid, lat, lon) in enumerate(SITES, 1):
    d = fetch(lat, lon)
    p = d["properties"]["parameter"]
    elev = d["geometry"]["coordinates"][2]
    ann = {k: float(v["ANN"]) for k, v in p.items()}
    out[sid] = {
        "lat": lat, "lon": lon,
        "elevation_m": round(float(elev), 1),
        "T2M": round(ann["T2M"], 2),
        "T2M_MAX": round(ann["T2M_MAX"], 2),
        "T2M_MIN": round(ann["T2M_MIN"], 2),
        "RH2M": round(ann["RH2M"], 2),
        "PS": round(ann["PS"], 2),
        "PRECTOTCORR_mm_day": round(ann["PRECTOTCORR"], 4),
        "precip_mm_yr": round(ann["PRECTOTCORR"] * 365.25, 1),
        "diurnal_range": round(ann["T2M_MAX"] - ann["T2M_MIN"], 2),
    }
    print(f"[{i:2d}/24] {sid:<20} T2M={out[sid]['T2M']:>7.2f}C  "
          f"RH={out[sid]['RH2M']:>5.1f}%  PS={out[sid]['PS']:>6.2f}kPa  "
          f"elev={out[sid]['elevation_m']:>7.1f}m  "
          f"precip={out[sid]['precip_mm_yr']:>7.1f}mm/yr", flush=True)
    time.sleep(1.2)

json.dump(out, open("/tmp/gen/power_raw.json", "w"), indent=2)
print(f"\nwrote /tmp/gen/power_raw.json  ({len(out)} sites)")
