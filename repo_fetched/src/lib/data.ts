// src/lib/data.ts
//
// Loads the two JSON files and holds the small helpers the UI needs:
// filtering, sorting and CSV export. There is no fetching here on purpose,
// the dataset ships with the app so the scoring works offline.

import configJson from '@/data/config.json';
import sitesJson from '@/data/sites.json';
import type { Config, Parameter, ScoredSite, Site } from './types';

export const config = configJson as unknown as Config;
export const sites = sitesJson as unknown as Site[];
export const parameters: Parameter[] = config.parameters;
export const profiles = config.profiles;
export const presets = config.presets;
export const sourceLinks = config.sources;

export type SortKey = 'score' | 'name' | 'confidence';

export interface FilterState {
  query: string;
  minScore: number;
  sortKey: SortKey;
}

/** Apply the search box, the score slider and the sort order. */
export function applyFilters(rows: ScoredSite[], f: FilterState): ScoredSite[] {
  const q = f.query.trim().toLowerCase();
  const filtered = rows.filter((r) => {
    if (r.score < f.minScore) return false;
    if (!q) return true;
    return (
      r.site.name.toLowerCase().includes(q) ||
      r.site.country.toLowerCase().includes(q)
    );
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (f.sortKey === 'name') return a.site.name.localeCompare(b.site.name);
    if (f.sortKey === 'confidence') {
      return b.confidence - a.confidence || b.score - a.score;
    }
    return b.score - a.score || a.site.name.localeCompare(b.site.name);
  });
  return sorted;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per site: the score, the confidence, and every raw value. */
export function toCsv(rows: ScoredSite[], profileName: string): string {
  const head = [
    'profile',
    'rank',
    'id',
    'site',
    'country',
    'lat',
    'lon',
    'score',
    'confidence',
    ...parameters.map((p) => `${p.key} (${p.unit})`),
  ];
  const lines = [head.map(csvCell).join(',')];
  rows.forEach((r, i) => {
    lines.push(
      [
        profileName,
        i + 1,
        r.site.id,
        r.site.name,
        r.site.country,
        r.site.lat,
        r.site.lon,
        r.score.toFixed(1),
        r.confidence,
        ...parameters.map((p) => r.site.values[p.key]),
      ]
        .map(csvCell)
        .join(',')
    );
  });
  return lines.join('\n');
}

/** Trigger a browser download for a CSV string. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Round for display without showing a trailing wall of zeroes. */
export function fmt(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '-';
  return Number(value.toFixed(digits)).toString();
}
