# Validation

How we check the scoring, and the exact output of the check.

## Run it

```bash
npm run validate
```

`scripts/validate.mjs` re-runs the full scoring outside the browser (plain Node, no build step) and checks the rankings for both profiles. It exits non-zero if anything fails, so it works in CI too.

## What it checks

- 13 parameters defined, and both profiles (Moon base, Mars base) define all 13 targets, tolerances and weights.
- Every site has a finite value for all 13 parameters, plus completeness and resolution tier in range.
- No placeholder photo fields remain in `src/data/sites.json`.
- Scores stay within 0..100, similarities within 0..1, confidence within 0..100.
- Rankings are sorted descending, and every score equals `100 * sum(weight * similarity) / sum(weight)` (checked to 1e-9).

These are internal-consistency checks: they show that the code implements the documented formula
and that the data is complete and in range. They do not compare the ranking against an independent
reference such as published analog-site assessments (see Limitations in
[METHODOLOGY.md](METHODOLOGY.md)).

## Counts

- Sites: 24
- Parameters: 13
- Profiles: 2 (Moon base, Mars base), plus the in-app custom profile builder

## Latest output

Exact output of `npm run validate` (2026-11-05):

```text
CosmoCode scoring validation
============================
Sites: 24
Parameters: 13
Profiles: moon, mars

Invariants:
  [ok] parameter count is 13
  [ok] every site has a finite value for all 13 parameters
  [ok] moon: defines all 13 parameters
  [ok] moon: targets finite, tolerances and weights positive
  [ok] mars: defines all 13 parameters
  [ok] mars: targets finite, tolerances and weights positive
  [ok] all sites have completeness and resolution tier in range
  [ok] no placeholder photo fields remain in sites.json

  [ok] moon: scored 24/24 sites
  [ok] moon: scores within 0..100
  [ok] moon: similarities within 0..1
  [ok] moon: confidence within 0..100
  [ok] moon: ranking sorted descending
  [ok] moon: score equals 100 * sum(weight * similarity) / sum(weight) over scorable axes only
  [ok] moon: structurally unreachable axes score 0 for every site and are excluded
  [ok] mars: scored 24/24 sites
  [ok] mars: scores within 0..100
  [ok] mars: similarities within 0..1
  [ok] mars: confidence within 0..100
  [ok] mars: ranking sorted descending
  [ok] mars: score equals 100 * sum(weight * similarity) / sum(weight) over scorable axes only
  [ok] mars: structurally unreachable axes score 0 for every site and are excluded

Moon base profile (top 10 of 24)
rank  site                      score  confidence
   1  East Antarctic Plateau     58.1          80
   2  McMurdo Dry Valleys        56.7          85
   3  Atacama Desert             48.2          81
   4  Devon Island               45.1          85
   5  Svalbard                   40.7          80
   6  Craters of the Moon        39.1          85
   7  Mojave Desert              38.7          81
   8  Sonoran Desert             37.2          80
   9  Mauna Kea                  37.0          56
  10  Deception Island           36.7          69

Mars base profile (top 10 of 24)
rank  site                      score  confidence
   1  East Antarctic Plateau     55.9          80
   2  Atacama Desert             50.7          81
   3  McMurdo Dry Valleys        46.3          85
   4  Erta Ale                   39.9          63
   5  Ladakh                     39.1          60
   6  Mojave Desert              38.8          81
   7  Sonoran Desert             38.0          80
   8  Namib Desert               35.9          68
   9  Mount Etna                 35.5          60
  10  Pilbara                    35.1          80

Structural mismatch:
Moon base: no site can score on tempRange, radiation, daylight (Temperature range, Radiation dose, Daylight)
  1.80 of 9.50 total weight (19%) is unreachable and is excluded from the mean.
Mars base: no site can score on radiation, pressure (Radiation dose, Atmospheric pressure)
  1.70 of 10.00 total weight (17%) is unreachable and is excluded from the mean.
These axes are reported separately rather than averaged in, because averaging them
would only scale every score by the same constant and hide the finding.

PASSED: all checks passed (24 sites, 13 parameters, 2 profiles).
```

## How much does the ranking depend on the weights?

The weights are our judgement, so we measured how much that matters. `npm run sensitivity`
multiplies each of the 13 weights by a random factor drawn uniformly between 0.75 and 1.25,
recomputes the full ranking, and repeats this 5,000 times per profile. The random generator is
seeded (seed 20261105), so the output is identical on every run. Only the weights are perturbed:
targets, tolerances and data values are held fixed.

| Profile | #1 unchanged | Same top 5 sites (any order) | Same top 5 in the same order | At least 3 of the top 5 kept |
| --- | --- | --- | --- | --- |
| Moon base | 80.8% | 97.0% | 76.2% | 100% |
| Mars base | 98.7% | 51.9% | 40.6% | 100% |

Running with a different seed changes each figure by about one percentage point or less. Reading
the table: the Moon #1 site is unchanged in about four of five trials and the Mars #1 site in
nearly all of them. The exact Mars top five is much less stable, with the same five sites
appearing in about half the trials, so neighbouring ranks there should be read as ties. Stability
below the top five was not tested, and this test does not cover targets, tolerances or the
estimated parameter values.

## Reading the output

- Moon base: `tempRange` and `radiation` score 0 similarity for every Earth site. No Earth site reproduces the 250 °C lunar day/night swing, and Earth's atmosphere and magnetic field shield the surface from the 380 µSv/day lunar dose rate (LRO CRaTER).
- Mars base: `radiation` and `pressure` score 0 similarity for every Earth site. No ground site matches the 210 µSv/day Mars surface dose rate (Curiosity RAD), and no Earth site has Mars-thin 0.6 kPa air.
- These zeros are expected. The app shows them separately instead of averaging them into every score.
