'use client';

import type { FilterState, SortKey } from '@/lib/data';

const SORTS: { id: SortKey; name: string }[] = [
  { id: 'score', name: 'Score (high to low)' },
  { id: 'confidence', name: 'Confidence (high to low)' },
  { id: 'name', name: 'Name (A to Z)' },
];

interface Props {
  value: FilterState;
  onChange: (next: FilterState) => void;
  shown: number;
  total: number;
}

export default function Filters({ value, onChange, shown, total }: Props) {
  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-surface px-4 py-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Search site or country
        <input
          type="search"
          value={value.query}
          onChange={(e) => onChange({ ...value, query: e.target.value })}
          placeholder="Atacama"
          className="w-48 rounded border border-border bg-surface px-2 py-1 text-sm text-ink"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Minimum score: {value.minScore}
        <input
          type="range"
          min={0}
          max={60}
          step={1}
          value={value.minScore}
          onChange={(e) => onChange({ ...value, minScore: Number(e.target.value) })}
          className="w-48"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs text-muted">
        Sort by
        <select
          value={value.sortKey}
          onChange={(e) => onChange({ ...value, sortKey: e.target.value as SortKey })}
          className="w-56 rounded border border-border bg-surface px-2 py-1 text-sm text-ink"
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <p className="ml-auto text-xs text-muted">
        Showing {shown} of {total} sites
      </p>
    </div>
  );
}
