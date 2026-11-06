#!/usr/bin/env python3
"""Real elevation and slope for the 24 CosmoCode sites, from 30 m SRTM
via the public opentopodata API.

For each site we sample a 3x3 patch about 250 m across and take the mean
absolute gradient as the local slope in degrees.
"""
import json, math, time, urllib.parse, urllib.request

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
APIS = ["https://api.opentopodata.org/v1/srtm30m",
        "https://api.opentopodata.org/v1/aster30m"]   # aster covers the poles
D = 0.0025          # ~275 m of latitude
M_PER_DEG = 111320.0


def query(locs, api):
    s = "|".join(f"{a:.5f},{b:.5f}" for a, b in locs)
    url = f"{api}?{urllib.parse.urlencode({'locations': s})}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                d = json.loads(r.read().decode())
            if d.get("status") == "OK":
                return [x["elevation"] for x in d["results"]]
        except Exception:                        # noqa: BLE001
            pass
        time.sleep(3 * (attempt + 1))
    return None


def query_any(locs):
    """Prefer SRTM 30 m; fall back to ASTER 30 m where SRTM has no coverage
    (SRTM stops at 60 N / 56 S, so the polar sites need the fallback)."""
    for api in APIS:
        vals = query(locs, api)
        if vals and all(v is not None for v in vals):
            return vals, api.rsplit("/", 1)[-1]
        time.sleep(1.2)
    raise RuntimeError(f"DEM query failed for {locs[0]}")


def patch(lat, lon):
    """3x3 elevations, lon offset scaled by cos(lat) for ~square spacing."""
    dz = D / max(math.cos(math.radians(lat)), 0.15)
    pts = [(lat + dlat, lon + dlon) for dlat in (D, 0.0, -D) for dlon in (-dz, 0.0, dz)]
    return query_any(pts)


def slope_deg(z, lat):
    """z is row-major 3x3: row 0 = +D lat (north). Returns mean slope in degrees."""
    dy = D * M_PER_DEG
    dx = (D / max(math.cos(math.radians(lat)), 0.15)) * M_PER_DEG * math.cos(math.radians(lat))
    g = []
    for r in range(3):
        for c in range(3):
            if r < 2: g.append((z[r][c] - z[r + 1][c]) / dy)
            if c < 2: g.append((z[r][c] - z[r][c + 1]) / dx)
    return math.degrees(math.atan(math.sqrt(sum(v * v for v in g) / len(g))))


out = {}
for i, (sid, lat, lon) in enumerate(SITES, 1):
    flat, used = patch(lat, lon)
    z = [flat[0:3], flat[3:6], flat[6:9]]
    elev = z[1][1]
    out[sid] = {"lat": lat, "lon": lon,
                "elevation_m": round(float(elev), 1),
                "slope_deg": round(slope_deg(z, lat), 2),
                "dem": used}
    print(f"[{i:2d}/24] {sid:<20} elev={out[sid]['elevation_m']:>8.1f} m   "
          f"slope={out[sid]['slope_deg']:>5.2f} deg   [{used}]", flush=True)
    time.sleep(1.2)

json.dump(out, open("/tmp/gen/dem_raw.json", "w"), indent=2)
print(f"\nwrote /tmp/gen/dem_raw.json  ({len(out)} sites)")
