# CosmoCode: Earth Analog Finder

[![CI](https://github.com/NishadIslamUtso/CosmoCode/actions/workflows/ci.yml/badge.svg)](https://github.com/NishadIslamUtso/CosmoCode/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Next.js 14](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)

Ranks 24 Earth sites by how closely they match the conditions of a permanent **Moon base** or
**Mars base**, and shows the working behind every score.

**Live demo:** https://cosmo-code-mayer-doa.vercel.app/

<!-- Add a screenshot of the app: save it as docs/screenshot.png, then uncomment the next line.
![Earth Analog Finder](docs/screenshot.png)
-->

Built for the NASA Space Apps Challenge 2026 challenge *Identify Earth Locations that Analog the
Permanent Moon Base Locations and Mars*. Mission teams use Earth sites to test equipment, train
crews and study isolation before flying. This tool makes the choice of site explicit and checkable:
each score is a transparent weighted sum that can be traced to its inputs and recomputed with your
own priorities.

## Features

- **Interactive map** of all 24 sites, with markers coloured by score and dashed outlines for
  low-confidence sites. Street, satellite and topographic layers.
- **Moon base and Mars base profiles**, plus a **custom profile builder**: change any weight and
  the ranking recomputes instantly. Presets (Lunar geology, Mars arid, Mars aqueous) show how
  priorities change the order.
- **Per-site breakdown** across 13 parameters: value, target, tolerance, similarity, weight and
  contribution, with each parameter labelled measured, derived or estimated.
- **Structural mismatch reporting.** Axes that no Earth site can match (for example the lunar
  radiation dose) are set aside and shown separately, not averaged into every score.
- **Separate confidence rating** per site, so a well-scoring but poorly resolved site is visible.
- Search, filter, sort, and **CSV export**.

## Quick start

Requires Node.js 18.17 or newer. No API keys or accounts are needed.

```bash
npm install
npm run dev        # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm run validate` | Re-runs the scoring in the terminal and checks the invariants |
| `npm run sensitivity` | Weight-perturbation test of how stable the rankings are |

The scoring and data work offline. Only the map tiles need a network connection.

## How scoring works

```
similarity = clamp( 1 - |value - target| / tolerance , 0 , 1 )
score      = 100 * sum( weight * similarity ) / sum( weight )     over scorable axes only
confidence = completeness * resolutionTier * 100
```

A score is a comparative similarity to a stated profile, on the axes an Earth site can reach. It is
not a go/no-go engineering criterion and should not be read as "percent similar to the Moon".
Every target, tolerance and weight is in [`src/data/config.json`](src/data/config.json). See
[METHODOLOGY](docs/METHODOLOGY.md) for the full model and a worked example.

## Data

Of the 13 parameters, **9 are measured, 3 are derived by calculation, and 1 is an estimate**
(aqueous geochemistry). The measured values can be regenerated with the scripts in `scripts/`.

| Source | Used for |
| --- | --- |
| [NASA POWER](https://power.larc.nasa.gov/) | Temperature, temperature range, pressure, humidity, precipitation, dust |
| [SRTM 30 m](https://api.opentopodata.org/) / [ASTER 30 m](https://asterweb.jpl.nasa.gov/) | Elevation and slope |
| [ISRIC SoilGrids](https://soilgrids.org/) (CC BY 4.0) | Soil texture |
| [GeoNames](https://download.geonames.org/export/dump/) | Isolation |
| [LRO CRaTER](https://pds-geosciences.wustl.edu/missions/lro/crater.htm), [Curiosity RAD](https://pds-geosciences.wustl.edu/missions/msl/) | Moon and Mars radiation targets |

```bash
python3 scripts/fetch_power.py
python3 scripts/fetch_dem.py
python3 scripts/fetch_extra.py
python3 scripts/fetch_soil.py     # needs: pip install rasterio pyproj
```

Full details, including the elevation correction applied to the NASA POWER grid, are in
[PROVENANCE](docs/PROVENANCE.md).

## Limitations

- The app ranks a fixed list of 24 curated sites. It does not search for new analog locations.
- The Moon profile is an equatorial / mare global-mean reference. Lunar south-pole targets are not
  modelled.
- Weights and tolerances are the team's judgement. `npm run sensitivity` measures how much the
  rankings move when the weights change.
- Aqueous geochemistry is an estimate, and three Antarctic sites use estimated soil values because
  the soil dataset has no Antarctic coverage.
- Validation is internal consistency and weight sensitivity. It is not a comparison against an
  independent reference.
- Scores are point estimates with no uncertainty ranges yet.

The full list is in [METHODOLOGY](docs/METHODOLOGY.md#8-limitations).

## Project structure

```
src/
  app/            page.tsx (main view), layout.tsx, docs/ and api/docs/ (documentation pages)
  components/     map, filters, ranked table, site detail, profile builder
  lib/            scoring.ts (the model), data.ts (loading, filtering, CSV), types.ts
  data/           config.json (parameters, profiles, presets), sites.json (24 sites)
scripts/          validate.mjs, sensitivity.mjs, scoring.mjs, fetch_*.py (data retrieval)
docs/             METHODOLOGY.md, PROVENANCE.md, VALIDATION.md
```

## Documentation

- [Methodology](docs/METHODOLOGY.md): the scoring model, assumptions and limitations
- [Data provenance](docs/PROVENANCE.md): where each number comes from
- [Validation](docs/VALIDATION.md): automated checks and sensitivity results

The same pages are served by the app at `/docs`.

## Attribution

Map tiles: OpenStreetMap, OpenTopoMap and Esri World Imagery. Data sources are listed above and
credited in [PROVENANCE](docs/PROVENANCE.md). This project is not affiliated with or endorsed by
NASA.

## License

[MIT](LICENSE). Data from third-party sources remains under its own license.

---

Team CosmoCode.
