# Methodology

How CosmoCode turns site data into a ranked list, and what that ranking does and does not mean.
The implementation is [`src/lib/scoring.ts`](../src/lib/scoring.ts) (about 150 lines);
[`scripts/scoring.mjs`](../scripts/scoring.mjs) is a plain-JavaScript mirror used by
`npm run validate` and `npm run sensitivity`.

## 1. Overview

For each of 24 Earth sites, the app measures how close the site is to a planetary target on each of
13 parameters, combines those closeness values into a single 0 to 100 score using weights, and
reports a separate confidence value. Nothing is hidden: every intermediate number is visible in the
site detail panel and in the CSV export.

A score is a **comparative similarity to a stated profile**. It is not a go/no-go engineering
criterion and it is not a probability.

## 2. Parameters

| Parameter | Unit | Status | What it represents |
| --- | --- | --- | --- |
| Mean temperature | °C | measured | Annual mean air temperature at the site. |
| Temperature range | °C | measured | Typical day to night temperature swing. |
| Radiation dose | µSv/day | derived | Surface dose rate from cosmic radiation, modelled from elevation and geomagnetic latitude. |
| Terrain slope | ° | derived | Mean local slope over a patch about 250 m across. |
| Soil composition | % sand | measured | Sand fraction of the surface soil (0 to 5 cm), used as a proxy for how regolith-like the surface is. |
| Atmospheric pressure | kPa | measured | Mean surface atmospheric pressure. |
| Daylight | h/day | derived | Hours of daylight on the longest day of the year, computed from latitude. |
| Precipitation | mm/yr | measured | Mean annual precipitation (rain plus snow water equivalent). |
| Relative humidity | % | measured | Mean annual relative humidity. |
| Dust activity | AOD | measured | Aerosol optical depth at 550 nm, a proxy for airborne dust. |
| Isolation | km | measured | Distance to the nearest settlement of 15,000 or more people. |
| Elevation | m | measured | Elevation above sea level. |
| Aqueous geochemistry | index | estimated | 0 to 100 index of how closely water and rock chemistry matches aqueous environments. The only parameter that is our own estimate. |

Status meanings: **measured** values are retrieved from a named dataset; **derived** values are
calculated from measured inputs with a published method; **estimated** values are judgement.
Sources and processing for each are in [PROVENANCE.md](PROVENANCE.md).

## 3. Similarity and score

For one site, one parameter and one profile:

```
similarity = clamp( 1 - |value - target| / tolerance , 0 , 1 )
```

A similarity of 1 means the site matches the target exactly. A similarity of 0 means the site is one
tolerance or more away from it.

The score is the weighted mean of the similarities, taken over the axes a site can actually score on
(see section 4):

```
score = 100 * sum( weight_i * similarity_i ) / sum( weight_i )
```

**Why distance to a target?** The question is "how Moon-like or Mars-like is this place", so a site
should score well by being *close to the planetary value*, not by being extreme compared with the
other Earth sites. Min-max or z-score normalisation across the sample would answer a different
question (relative ranking among Earth sites).

### Worked example

East Antarctic Plateau against the Moon base profile (score 58.1):

| Parameter | Site value | Target | Tolerance | Similarity | Weight | Weight × similarity |
| --- | --- | --- | --- | --- | --- | --- |
| Mean temperature | -51.46 °C | -20 | 45 | 0.30 | 1.2 | 0.36 |
| Terrain slope | 0.57 ° | 4 | 8 | 0.57 | 0.7 | 0.40 |
| Soil composition | 50 % sand | 55 | 45 | 0.89 | 1.0 | 0.89 |
| Atmospheric pressure | 64.48 kPa | 0 | 100 | 0.36 | 0.8 | 0.28 |
| Precipitation | 29.2 mm/yr | 0 | 60 | 0.51 | 1.1 | 0.56 |
| Relative humidity | 89.76 % | 0 | 40 | 0.00 | 0.6 | 0.00 |
| Dust activity | 0 AOD | 0 | 0.3 | 1.00 | 0.7 | 0.70 |
| Isolation | 3727.3 km | 4000 | 4000 | 0.93 | 0.8 | 0.75 |
| Elevation | 3264 m | 1000 | 3000 | 0.25 | 0.3 | 0.07 |
| Aqueous geochemistry | 15 index | 10 | 60 | 0.92 | 0.5 | 0.46 |
| **Total over scorable axes** | | | | | **7.70** | **4.476** |
| Temperature range, radiation dose, daylight | set aside (section 4) | | | | 1.80 | not counted |

Score = 100 × 4.476 / 7.70 = **58.1**.

## 4. Structural mismatch

Some axes cannot be matched by any Earth site. For the Moon profile these are temperature range,
radiation dose and daylight (a 336-hour lunar day). For the Mars profile they are radiation dose
and atmospheric pressure. On these axes every one of the 24 sites has similarity 0.

The model detects this automatically (an axis is unreachable when no site has a non-zero
similarity on it) and **leaves these axes out of the weighted mean**, then reports them separately
in the app. For the built-in profiles this is 1.80 of 9.50 total weight (19%) for the Moon and
1.70 of 10.00 (17%) for Mars.

The reason is that including all-zero axes would only multiply every score by the same constant
(7.70 / 9.50 in the Moon case) without changing the order. Reporting the set-aside weight
separately keeps the finding visible instead of folding it into every number.

Consequence for reading scores: a score is out of 100 **on the reachable axes only**. It should not
be read as "percent similar to the Moon".

## 5. Confidence

Confidence is reported separately from the score:

```
confidence = completeness * resolutionTier * 100
```

`completeness` (0 to 1) is how much of the site's data we have. It is a per-site value assigned
in [`src/data/sites.json`](../src/data/sites.json) (currently 0.69 to 0.9); it is not computed by a
script. `resolutionTier` (0.7 to 1.0) reflects how well the gridded climate data resolves the site,
derived from the gap between the NASA POWER grid-cell elevation and the true site elevation (see
[PROVENANCE.md](PROVENANCE.md)). Low-confidence sites are drawn with a dashed marker on the map.

For the example above: 0.8 × 1.0 × 100 = 80.

## 6. Profiles

Targets, tolerances and weights live in [`src/data/config.json`](../src/data/config.json). The
built-in profiles are:

| Parameter | Moon target | Moon tolerance | Moon weight | Mars target | Mars tolerance | Mars weight |
| --- | --- | --- | --- | --- | --- | --- |
| Mean temperature (°C) | -20 | 45 | 1.2 | -60 | 50 | 1.2 |
| Temperature range (°C) | 250 | 180 | 0.6 | 60 | 45 | 0.6 |
| Radiation dose (µSv/day) | 380 | 200 | 0.8 | 210 | 120 | 0.8 |
| Terrain slope (°) | 4 | 8 | 0.7 | 5 | 9 | 0.6 |
| Soil composition (% sand) | 55 | 45 | 1.0 | 65 | 45 | 0.9 |
| Atmospheric pressure (kPa) | 0 | 100 | 0.8 | 0.6 | 50 | 0.9 |
| Daylight (h/day) | 336 | 300 | 0.4 | 12.3 | 14 | 0.4 |
| Precipitation (mm/yr) | 0 | 60 | 1.1 | 0 | 60 | 1.1 |
| Relative humidity (%) | 0 | 40 | 0.6 | 5 | 45 | 0.6 |
| Dust activity (AOD) | 0 | 0.3 | 0.7 | 0.4 | 0.4 | 0.9 |
| Isolation (km) | 4000 | 4000 | 0.8 | 4000 | 4000 | 0.8 |
| Elevation (m) | 1000 | 3000 | 0.3 | 3000 | 3500 | 0.6 |
| Aqueous geochemistry (index) | 10 | 60 | 0.5 | 45 | 55 | 0.6 |
| **Total weight** | | | **9.5** | | | **10.0** |

- **Moon base:** an equatorial / mare global-mean reference. Radiation target from LRO CRaTER,
  temperature and terrain baseline from LRO Diviner and LOLA.
- **Mars base:** a global-mean reference. Radiation target from Curiosity RAD, temperature and
  terrain baseline from MGS TES and MOLA.

The **custom profile builder** lets a user change any weight and re-rank every site instantly. Three
presets start from a built-in profile, change a number of its weights, and also move one or more
targets (the weights of each preset are in `config.json`):

| Preset | Change from the base profile |
| --- | --- |
| Lunar geology | Soil target raised to 92 (fresh basalt), tolerance 25. |
| Mars arid | Precipitation tolerance tightened to 25, humidity target 2 with tolerance 20. |
| Mars aqueous | Aqueous geochemistry target raised to 90, tolerance 45, so water-altered sites such as Rio Tinto climb the table. |

## 7. Assumptions

1. **Targets are point estimates** of planetary baselines, not site-specific values. A polar or
   crater-specific base would shift them.
2. **Tolerances and weights are the team's judgement.** They are physically motivated but not
   derived from a mission requirements document. [VALIDATION.md](VALIDATION.md) measures how much
   the ranking moves when the weights change.
3. **Sand fraction is a regolith proxy.** It rests on the reasoning that lunar and Martian
   regolith is silicate and effectively clay-free, so clay-rich terrestrial soils are poorer
   analogues. It does not describe grain shape, mineralogy or cohesion.
4. **Isolation is distance to a settlement**, a logistics and human-factors surrogate rather than a
   physiological measurement.
5. **Daylight is a single scalar** (longest-day length), so it cannot represent the lunar 14-day
   light and dark cycle.
6. **Radiation covers cosmic dose only.** It is modelled, not measured, and excludes the terrestrial
   dose from local rock.
7. **Climate values are annual climatologies** from a coarse gridded reanalysis, corrected to the
   site elevation with a lapse rate and the barometric formula.

## 8. Limitations

- **The candidate set is fixed.** The app ranks 24 curated, mostly well-studied sites. It does not
  search for analog locations that are not already in the list.
- **The Moon profile is equatorial.** South-pole (for example Artemis region) targets are not
  modelled.
- **Validation is internal.** The automated checks show that the code implements the stated formula
  and that rankings are stable under weight changes. They do not compare the ranking against an
  independent reference such as published analog-site assessments.
- **One parameter is an estimate**, and three Antarctic sites (East Antarctic Plateau, McMurdo Dry
  Valleys, Deception Island) use estimated soil values because the soil dataset has no Antarctic
  coverage. The two top-ranked Moon sites are among them.
- **There is no uncertainty propagation.** Each score is a point estimate.
- Precipitation is the weakest of the measured values, and the elevation correction is an
  approximation rather than a downscaling model.

## 9. Future work

- Add region-specific targets, starting with a lunar south-pole profile.
- Replace the fixed list with a broader candidate set or a grid scan, so new sites can be found.
- Retrieve aqueous geochemistry from a real dataset to replace the estimate.
- Propagate uncertainty (for example Monte Carlo over tolerances and measurement error) to give
  scores error bars, and extend the sensitivity test beyond weights to targets and tolerances.
- Compare rankings against independently published analog assessments.
