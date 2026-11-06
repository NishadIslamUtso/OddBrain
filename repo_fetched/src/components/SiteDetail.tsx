'use client';

// Site detail panel.
//
// Shows the score, the confidence, the per-parameter breakdown, a similarity
// chart, and links to the NASA sources behind the numbers.
//
// Every number on screen comes from ScoredSite.breakdown, which is the same
// working that scripts/validate.mjs re-runs in the terminal. The panel and
// the validator read the same rows, so they cannot disagree.

import { fmt, parameters } from '@/lib/data';
import type { ScoredSite } from '@/lib/types';
import SimilarityChart from './SimilarityChart';

const SOURCE_STYLE: Record<string, string> = {
  measured: 'text-[#15803d]',
  derived: 'text-[#1d4ed8]',
  estimated: 'text-[#a16207]',
};

interface Props {
  row: ScoredSite;
  sourceLinks: Record<string, string>;
  onClose: () => void;
}

export default function SiteDetail({ row, sourceLinks, onClose }: Props) {
  const { site, score, confidence, breakdown, structural } = row;
  const blocked = new Set(structural.keys);
  const sourceOf = new Map(parameters.map((p) => [p.key, p.source]));

  return (
    <aside className="rounded-lg border border-border bg-surface">
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold">{site.name}</h2>
          <p className="text-sm text-muted">
            {site.country} | score {fmt(score)} / 100 | confidence {confidence}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-border px-2 py-1 text-sm text-muted hover:text-ink"
        >
          Close
        </button>
      </div>

      <div className="px-4 pt-4">
        <SimilarityChart rows={breakdown} />
      </div>

      {structural.keys.length > 0 ? (
        <p className="px-4 text-xs text-muted">
          Unreachable for every Earth site, so excluded from the score:{' '}
          {structural.labels.join(', ')}.
        </p>
      ) : null}

      {/* photos removed - placeholders showed wrong landscapes; real NASA/Wikimedia photos with attribution go back here */}
      {site.imageUrl ? (
        <figure className="px-4 pt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={site.imageUrl} alt={site.name} className="w-full rounded border border-border" />
          {site.imageCredit ? (
            <figcaption className="mt-1 text-xs text-muted">{site.imageCredit}</figcaption>
          ) : null}
        </figure>
      ) : null}

      <div className="px-4 py-4">
        <h3 className="text-sm font-semibold">Per-parameter breakdown</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-1 pr-3 font-medium">Parameter</th>
                <th className="py-1 pr-3 font-medium">Site</th>
                <th className="py-1 pr-3 font-medium">Target</th>
                <th className="py-1 pr-3 font-medium">Tolerance</th>
                <th className="py-1 pr-3 font-medium">Weight</th>
                <th className="py-1 pr-3 font-medium">Source</th>
                <th className="py-1 pr-3 font-medium">Similarity</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((b) => (
                <tr
                  key={b.key}
                  className={blocked.has(b.key) ? 'border-t border-border text-muted' : 'border-t border-border'}
                >
                  <td className="py-1 pr-3">
                    {b.label}
                    <span className="text-muted"> ({b.unit})</span>
                    {blocked.has(b.key) ? (
                      <span className="block text-xs">unreachable, not scored</span>
                    ) : null}
                  </td>
                  <td className="py-1 pr-3 tabular-nums">{fmt(b.value, 2)}</td>
                  <td className="py-1 pr-3 tabular-nums">{fmt(b.target, 2)}</td>
                  <td className="py-1 pr-3 tabular-nums">{fmt(b.tolerance, 2)}</td>
                  <td className="py-1 pr-3 tabular-nums">{fmt(b.weight, 2)}</td>
                  <td className={`py-1 pr-3 ${SOURCE_STYLE[sourceOf.get(b.key) ?? 'estimated']}`}>
                    {sourceOf.get(b.key) ?? 'estimated'}
                  </td>
                  <td className="py-1 pr-3 tabular-nums">
                    {fmt(b.similarity * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border-t border-border px-4 py-3">
        <h3 className="text-sm font-semibold">How much to trust this site</h3>
        <p className="mt-1 text-xs text-muted">
          Confidence is completeness ({fmt(site.completeness, 2)}) times resolution tier (
          {fmt(site.resolutionTier, 2)}) times 100, which gives {confidence}. It is separate from
          the score on purpose.
        </p>
      </div>

      <div className="border-t border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Datasets behind this site</h3>
        <p className="mt-1 text-xs text-muted">
          Rows marked estimated above are our judgement and are not from these datasets.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
          {site.sources.map((key) => {
            const url = sourceLinks[key];
            return (
              <li key={key}>
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    {key}
                  </a>
                ) : (
                  key
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
