#!/usr/bin/env python3
"""Pull real soil texture for the CosmoCode sites from ISRIC SoilGrids.

No API key needed. Writes /tmp/gen/soil_raw.json.

SoilGrids is a global 250 m dataset of machine-learned soil properties
(ISRIC World Soil Information, CC BY 4.0), covering sand, silt, clay, pH and
more. We read it straight from ISRIC's public Cloud Optimized GeoTIFFs over
HTTP range requests, so a single site costs a few kilobytes instead of
downloading the multi-gigabyte global rasters.

Requires:
    pip install rasterio pyproj

Usage:
    python3 scripts/fetch_soil.py

Known limitation: SoilGrids has no coverage for Antarctica, so the three
Antarctic sites return nothing and keep their estimated values. It also has
no data over open water, so sites on or beside a lake are sampled from a
wider window and the surrounding land is averaged.
"""

import json
import os

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.windows import Window

PROPERTIES = ["sand", "clay", "silt", "phh2o"]
BASE = "https://files.isric.org/soilgrids/latest/data/{p}/{p}_0-5cm_mean.vrt"


def window_mean(src, row, col, half):
    """Mean of the valid pixels in a square window, ignoring nodata."""
    try:
        w = src.read(1, window=Window(col - half, row - half,
                                      half * 2 + 1, half * 2 + 1),
                     boundless=True).astype(float)
    except Exception:                                # noqa: BLE001
        return None
    w[w <= -32768] = np.nan
    w[w > 100000] = np.nan
    if np.all(np.isnan(w)):
        return None
    return float(np.nanmean(w))


def sample_site(src, transformer, lon, lat):
    """Widen the window until something valid turns up."""
    x, y = transformer.transform(lon, lat)
    row, col = src.index(x, y)
    for half in (3, 10, 40, 120):
        v = window_mean(src, row, col, half)
        if v is not None:
            return v
    return None


def main():
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sites = json.load(open(os.path.join(repo, "src/data/sites.json")))

    out = {s["id"]: {} for s in sites}
    for prop in PROPERTIES:
        url = "/vsicurl/" + BASE.format(p=prop)
        with rasterio.open(url) as src:
            tr = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True)
            for s in sites:
                out[s["id"]][prop] = sample_site(src, tr, s["lon"], s["lat"])
        got = sum(1 for v in out.values() if v[prop] is not None)
        print(f"  {prop:<7} {got}/24 sites", flush=True)

    os.makedirs("/tmp/gen", exist_ok=True)
    json.dump(out, open("/tmp/gen/soil_raw.json", "w"), indent=1)

    print(f"\n  {'site':<24}{'sand%':>7}{'clay%':>7}{'silt%':>7}{'pH':>7}")
    for s in sites:
        d = out[s["id"]]
        if d["sand"] is None:
            print(f"  {s['name']:<22}   no SoilGrids coverage")
        else:
            print(f"  {s['name']:<22}{d['sand']/10:>7.1f}{d['clay']/10:>7.1f}"
                  f"{d['silt']/10:>7.1f}{d['phh2o']/10:>7.1f}")
    print(f"\nwrote /tmp/gen/soil_raw.json  ({len(out)} sites)")


if __name__ == "__main__":
    main()
