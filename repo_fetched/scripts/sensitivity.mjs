#!/usr/bin/env node
// Weight-sensitivity test for the CosmoCode ranking.
//
// Every weight is multiplied by a random factor drawn uniformly from
// [1 - SPREAD, 1 + SPREAD], the full ranking is recomputed, and the result is
// compared with the unperturbed ranking. This is repeated TRIALS times per
// profile. Targets and tolerances are NOT perturbed: only weights.
//
// The random generator is seeded, so the numbers are identical on every run
// and on every machine.
//
// Usage: npm run sensitivity
//        node scripts/sensitivity.mjs [trials] [seed]

import { loadData, scoreAll } from './scoring.mjs';

const TRIALS = Number(process.argv[2] ?? 5000);
const SEED = Number(process.argv[3] ?? 20261105);
const SPREAD = 0.25;
const TOP = 5;

// mulberry32: a small, well-known seeded generator.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const { config, sites } = loadData();
const parameters = config.parameters;
const rand = mulberry32(SEED);

console.log('CosmoCode weight sensitivity');
console.log('============================');
console.log(`Trials per profile: ${TRIALS}   Weight spread: +/-${SPREAD * 100}%   Seed: ${SEED}`);
console.log('');

const rows = [];
for (const [id, profile] of Object.entries(config.profiles)) {
  const baseline = scoreAll(sites, profile, parameters).map((r) => r.site.id);
  const baseTop = baseline.slice(0, TOP);

  let sameFirst = 0;
  let sameTopOrdered = 0;
  let sameTopSet = 0;
  let atLeastThree = 0;

  for (let i = 0; i < TRIALS; i += 1) {
    const targets = {};
    for (const [key, t] of Object.entries(profile.targets)) {
      targets[key] = { ...t, weight: t.weight * (1 - SPREAD + 2 * SPREAD * rand()) };
    }
    const ranked = scoreAll(sites, { ...profile, targets }, parameters).map((r) => r.site.id);
    const top = ranked.slice(0, TOP);
    if (ranked[0] === baseline[0]) sameFirst += 1;
    if (top.every((s, k) => s === baseTop[k])) sameTopOrdered += 1;
    if (top.every((s) => baseTop.includes(s))) sameTopSet += 1;
    if (top.filter((s) => baseTop.includes(s)).length >= 3) atLeastThree += 1;
  }

  const pct = (n) => ((100 * n) / TRIALS).toFixed(1) + '%';
  rows.push({
    id,
    first: pct(sameFirst),
    ordered: pct(sameTopOrdered),
    set: pct(sameTopSet),
    three: pct(atLeastThree),
  });
}

console.log('profile  #1 unchanged  top 5 same order  top 5 same sites  >=3 of top 5 kept');
console.log('-------  ------------  ----------------  ---------------  -----------------');
for (const r of rows) {
  console.log(
    `${r.id.padEnd(7)}  ${r.first.padStart(12)}  ${r.ordered.padStart(16)}  ${r.set.padStart(15)}  ${r.three.padStart(17)}`
  );
}
console.log('');
console.log('Only weights were perturbed. Targets and tolerances were held fixed.');
