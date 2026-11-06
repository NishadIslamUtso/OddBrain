'use client';

import { fmt } from '@/lib/data';
import type { ScoredSite } from '@/lib/types';

interface Props {
  rows: ScoredSite[];
  maxScore: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onExport: () => void;
  profileName: string;
}

export default function RankedTable({
  rows,
  maxScore,
  selectedId,
  onSelect,
  onExport,
  profileName,
}: Props) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">
          Ranked sites <span className="font-normal text-muted">({profileName})</span>
        </h2>
        <button
          type="button"
          onClick={onExport}
          className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-ink"
        >
          Export CSV
        </button>
      </div>

      <div className="max-h-[520px] overflow-y-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Site</th>
              <th className="px-2 py-2 font-medium">Score</th>
              <th className="px-2 py-2 font-medium">Conf.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isSelected = row.site.id === selectedId;
              return (
                <tr
                  key={row.site.id}
                  onClick={() => onSelect(row.site.id)}
                  className={
                    isSelected
                      ? 'cursor-pointer border-t border-border bg-canvas'
                      : 'cursor-pointer border-t border-border hover:bg-canvas'
                  }
                >
                  <td className="px-4 py-2 text-muted">{i + 1}</td>
                  <td className="px-2 py-2">
                    <div className="font-medium">{row.site.name}</div>
                    <div className="text-xs text-muted">{row.site.country}</div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-10 tabular-nums">{fmt(row.score)}</span>
                      <span className="h-2 w-24 rounded-sm bg-border">
                        <span
                          className="block h-2 rounded-sm bg-accent"
                          style={{
                            width: `${maxScore > 0 ? Math.max(2, (row.score / maxScore) * 100) : 0}%`,
                          }}
                        />
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={
                        row.confidence < 75
                          ? 'tabular-nums text-muted underline decoration-dotted'
                          : 'tabular-nums'
                      }
                      title={row.confidence < 75 ? 'Sparse data: dashed marker on the map' : undefined}
                    >
                      {row.confidence}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  No site matches these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
