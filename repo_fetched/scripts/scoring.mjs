// Plain-JS mirror of src/lib/scoring.ts. Keep the two in sync.
// scripts/validate.mjs runs this file so the scoring can be checked
// outside the browser without a TypeScript toolchain.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadData() {
  const config = JSON.parse(readFileSync(join(root, 'src/data/config.json'), 'utf8'));
  const sites = JSON.parse(readFileSync(join(root, 'src/data/sites.json'), 'utf8'));
  return { config, sites };
}

/** similarity = 1 - |value - target| / tolerance, clamped to 0..1 */
export function similarity(value, target, tolerance) {
  if (tolerance <= 0) return value === target ? 1 : 0;
  const s = 1 - Math.abs(value - target) / tolerance;
  return Math.max(0, Math.min(1, s));
}

/** confidence = completeness * resolution tier * 100 */
export function confidence(site) {
  return Math.round(site.completeness * site.resolutionTier * 100);
}

/**
 * Axes that no site in the dataset can score on at all, for example radiation.
 * They are reported separately instead of being averaged into every score.
 */
export function structuralMismatch(sites, profile, parameters) {
  const keys = [];
  for (const p of parameters) {
    const t = profile.targets[p.key];
    const anyNonZero = sites.some(
      (s) => similarity(s.values[p.key], t.target, t.tolerance) > 0
    );
    if (!anyNonZero) keys.push(p.key);
  }
  const blocked = new Set(keys);
  return {
    keys,
    labels: parameters.filter((p) => blocked.has(p.key)).map((p) => p.label),
    weight: keys.reduce((acc, k) => acc + profile.targets[k].weight, 0),
    scorableWeight: parameters
      .filter((p) => !blocked.has(p.key))
      .reduce((acc, p) => acc + profile.targets[p.key].weight, 0),
  };
}

export function scoreSite(site, profile, parameters, structural) {
  const blocked = new Set(structural.keys);
  const breakdown = parameters.map((p) => {
    const t = profile.targets[p.key];
    const value = site.values[p.key];
    const sim = similarity(value, t.target, t.tolerance);
    return {
      key: p.key,
      label: p.label,
      unit: p.unit,
      value,
      target: t.target,
      tolerance: t.tolerance,
      weight: t.weight,
      similarity: sim,
      contribution: t.weight * sim,
    };
  });
  const usable = breakdown.filter((b) => !blocked.has(b.key));
  const weightSum = usable.reduce((acc, b) => acc + b.weight, 0);
  const raw = usable.reduce((acc, b) => acc + b.contribution, 0);
  const score = weightSum > 0 ? (100 * raw) / weightSum : 0;
  return { site, score, confidence: confidence(site), breakdown, structural };
}

export function scoreAll(sites, profile, parameters) {
  const structural = structuralMismatch(sites, profile, parameters);
  return sites
    .map((s) => scoreSite(s, profile, parameters, structural))
    .sort((a, b) => b.score - a.score || a.site.name.localeCompare(b.site.name));
}
