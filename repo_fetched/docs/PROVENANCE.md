# Data provenance

Where every number in `src/data/sites.json` comes from, and what we had to estimate.

**Short version:** 12 of the 13 parameters are measured or calculated, and you can
reproduce them yourself with four scripts in this repo (9 measured, 3 derived). Exactly one
remains our own estimate: aqueous geochemistry.

## Parameter by parameter

| Parameter | Status | Source |
| --- | --- | --- |
| Mean temperature | **measured** | NASA POWER `T2M`, annual climatology, corrected to the site elevation |
| Temperature range | **measured** | NASA POWER `T2M_MAX` minus `T2M_MIN`, annual climatology |
| Atmospheric pressure | **measured** | NASA POWER `PS`, annual climatology, corrected to the site elevation |
| Relative humidity | **measured** | NASA POWER `RH2M`, annual climatology |
| Precipitation | **measured** | NASA POWER `PRECTOTCORR`, annual climatology, times 365.25 |
| Elevation | **measured** | SRTM 30 m, or ASTER 30 m where SRTM has no coverage |
| Dust activity | **measured** | NASA POWER `AOD_55`, aerosol optical depth at 550 nm |
| Isolation | **measured** | Distance to the nearest settlement of 15,000+, from GeoNames |
| Slope | **derived** | Gradient of a 3x3 patch of the same DEM, about 250 m across |
| Daylight | **derived** | Computed from latitude for the summer solstice. Exact, not measured |
| Radiation dose | **derived** | Calculated from elevation and geomagnetic latitude. See below |
| Soil composition | **measured** | ISRIC SoilGrids 250 m, sand fraction at 0-5 cm |
| Aqueous geochemistry | *estimated* | Literature-informed 0 to 100 index. The only one left |

## How to reproduce the measured values

```bash
python3 scripts/fetch_power.py     # climate: temperature, pressure, humidity, rain, dust
python3 scripts/fetch_dem.py       # elevation and slope
python3 scripts/fetch_extra.py     # dust, isolation, cosmic-ray dose
python3 scripts/fetch_soil.py      # soil texture  (needs: pip install rasterio pyproj)
```

None of them needs an API key or an account. Together they reproduce 12 of the 13
parameters. Re-running them refreshes the retrieval date.

| Source | Endpoint | Used for |
| --- | --- | --- |
| NASA POWER | `https://power.larc.nasa.gov/api/temporal/climatology/point` | temperature, temperature range, pressure, humidity, precipitation |
| SRTM 30 m | `https://api.opentopodata.org/v1/srtm30m` | elevation and slope |
| ASTER 30 m | `https://api.opentopodata.org/v1/aster30m` | elevation and slope at the polar sites SRTM does not cover |

## The elevation correction, and why it was needed

NASA POWER is a gridded reanalysis. Its cells are coarse, and at sites with steep local
terrain the grid samples the wrong place entirely. Two examples:

| Site | POWER grid elevation | True elevation (30 m DEM) | POWER raw temperature | After correction | Real value |
| --- | --- | --- | --- | --- | --- |
| Mauna Kea | 636 m | 4147 m | +20.9 C | -1.9 C | about -2 C |
| Death Valley | 846 m | -82 m | +19.1 C | +25.1 C | about 25 C |
| Danakil Depression | 1063 m | -91 m | +26.0 C | +33.5 C | about 34 C |

So we correct two parameters from the grid elevation to the site elevation:

- **Temperature**: `T_site = T_grid - 6.5 C/km x (h_site - h_grid)`, the standard
  free-air lapse rate.
- **Pressure**: `P_site = P_grid x exp(-(h_site - h_grid) / 8400 m)`, the barometric
  formula with an 8.4 km scale height.

Both are approximations. They are recorded in `scripts/` and in the `sourceNote` field of
each parameter in `src/data/config.json`, and they are the reason the resolution tier
below still costs confidence at sites with a large elevation gap.

## Resolution tier

Each site carries a `resolutionTier` derived from the gap between the POWER grid elevation
and the true site elevation, because the correction above is approximate and because
humidity and precipitation cannot be corrected at all:

| Gap between grid and site elevation | Tier |
| --- | --- |
| 300 m or less | 1.0 |
| up to 1000 m | 0.9 |
| up to 2000 m | 0.8 |
| more than 2000 m | 0.7 |

Sites such as Mauna Kea, Teide, Etna, Danakil and Ladakh land in the bottom two rows.
That is real: our climate data genuinely does not resolve them well, and their dashed
markers on the map say so.

## The one that is still an estimate

Aqueous geochemistry is **our judgement, not a measurement.** It is informed by the
analog-site literature, but no value was pulled from any dataset.

We looked hard for a source. The obvious candidates all need registration rather than
being openly queryable: GLORICH and GEMStat hold river and water-quality chemistry but
require an account, HydroSHEDS covers water flow rather than chemistry, and the instrument
usually cited in this area, MRO CRISM, orbits Mars and cannot measure an Earth site at all.

There is a tempting shortcut we deliberately did not take. Aqueous activity depends on
liquid water being present, and we already measure precipitation. It would be easy to
derive this parameter from that. We did not, because it would score essentially the same
signal twice and inflate the weight of rainfall in the result. Saying "we could not
measure this" is better than quietly double-counting.

## Soil: how we got there

Soil took the longest. The right dataset is ISRIC SoilGrids (250 m, CC BY 4.0), which
publishes sand, silt, clay and pH globally. Its JSON API was returning `503` for the whole
time we were building this, and the WCS fallback returned rendered images rather than raw
values.

What worked was skipping the API entirely. SoilGrids also publishes its rasters as Cloud
Optimized GeoTIFFs, which support HTTP range requests, so `scripts/fetch_soil.py` reads a
few kilobytes around each site instead of downloading the multi-gigabyte global files.

**Sand fraction is the regolith proxy**, on the reasoning that lunar and Martian regolith
is silicate and effectively clay-free, so clay-rich terrestrial soils are the poorer
analogues.

One honest gap: **SoilGrids has no Antarctic coverage.** Dry Valleys, Deception Island and
the East Antarctic Plateau return nothing, so those three sites keep their estimated soil
values while the other 21 are measured.

## How radiation is calculated

No instrument reports ground-level radiation dose per site globally, so instead of
guessing we calculate it from two things we already measure: how high the site is and how
far it sits from the magnetic pole.

1. Geomagnetic latitude from the IGRF-13 dipole pole position.
2. Vertical cutoff rigidity, `R = 14.9 x cos^4(lambda_gm)` GV, the Stormer dipole
   approximation after Smart and Shea (2009).
3. A latitude factor rising from 1.00 at the equator to 2.05 at the poles, scaled by
   cutoff rigidity.
4. An altitude term, with dose rate doubling roughly every 1500 m, fitted to the table in
   Lindborg et al. (2004) from a sea level base of 0.034 uSv/h.

Two honest caveats. It is a model with published inputs, not an instrument reading, which
is why it is labelled *derived* rather than *measured*. And it covers cosmic dose only,
not the terrestrial dose from local rock, which varies a great deal with geology and is
not modelled at all.

The results behave correctly: Dome C comes out highest at 7.56 uSv/day (high and polar),
Danakil lowest at 0.84 uSv/day (below sea level and near the equator).

## Planetary targets

- **Moon base.** Equatorial/mare global-mean reference for a permanent lunar base. Radiation
  target 380 uSv/day from LRO CRaTER, temperature and terrain baseline from LRO Diviner and
  LOLA. South-pole (e.g. Artemis) targets are future work.
- **Mars base.** Global-mean reference. Radiation target 210 uSv/day from Curiosity RAD,
  temperature and terrain baseline from MGS TES and MOLA.

Both dose rates are unreachable at Earth's surface, which is the point of the structural
mismatch reported in `docs/VALIDATION.md`.

## What is measured versus what is judgement

- **Targets** trace to an instrument or a dataset, cited above.
- **Tolerances** are our judgement. They set how far a site can sit from a target before it
  scores zero.
- **Weights** are our judgement too, chosen from what matters for a habitat.

Both are editable in `src/data/config.json` and in the app's profile builder, and
`docs/VALIDATION.md` reports how much the ranking moves when you change them.

## Site photos

Site photos were removed. The earlier placeholders showed landscapes that are not the real
sites, which is worse than no photo for a science demo. The `imageUrl` and `imageCredit`
fields stay in the type and the render stays guarded, so real NASA or Wikimedia photos with
attribution can go back in without touching the components.

## Known limitations

- Power is grid smoothed. Precipitation is the weakest of the measured set.
- The elevation correction is an approximation, not a downscaling model.
- ASTER replaces SRTM at five polar sites, so those elevations come from a different sensor.
- One parameter remains an estimate: aqueous geochemistry. See the section above.
- Three Antarctic sites keep an estimated soil value, because SoilGrids has no coverage
  there. The other 21 are measured.
- Radiation is a model, not a reading, and excludes terrestrial dose from local rock.
- There is no uncertainty propagation. The score is a point estimate.
