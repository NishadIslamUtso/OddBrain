'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import Filters from '@/components/Filters';
import ProfileBuilder, { type Mover } from '@/components/ProfileBuilder';
import RankedTable from '@/components/RankedTable';
import type { TileId } from '@/components/MapView';
import {
  applyFilters,
  downloadCsv,
  parameters,
  presets,
  profiles,
  sites,
  sourceLinks,
  toCsv,
  type FilterState,
} from '@/lib/data';
import { applyOverrides, scoreAll, weightsOf } from '@/lib/scoring';
import { structuralNotes } from '@/lib/structural';
import type { ParameterKey, Preset, TargetOverride } from '@/lib/types';

// Leaflet touches window on import, so the map is loaded in the browser only.
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <div className="h-[480px] w-full rounded-lg border border-border bg-canvas" />,
});

// The detail panel pulls in the charting library, and it is only needed once
// somebody picks a site, so it loads on demand too.
const SiteDetail = dynamic(() => import('@/components/SiteDetail'), {
  ssr: false,
  loading: () => <div className="h-40 rounded-lg border border-border bg-canvas" />,
});

type BuiltIn = 'moon' | 'mars';

// How each parameter was obtained, counted from the config so this text can
// never disagree with docs/PROVENANCE.md or the per-parameter labels.
const measuredCount = parameters.filter((p) => p.source === 'measured').length;
const derivedCount = parameters.filter((p) => p.source === 'derived').length;
const estimated = parameters.filter((p) => p.source === 'estimated');

export default function Home() {
  const [profileId, setProfileId] = useState<BuiltIn | 'custom'>('moon');
  const [baseProfileId, setBaseProfileId] = useState<BuiltIn>('moon');
  const [customWeights, setCustomWeights] = useState<Record<ParameterKey, number>>(() =>
    weightsOf(profiles.moon)
  );
  const [targetOverrides, setTargetOverrides] = useState<
    Partial<Record<ParameterKey, TargetOverride>>
  >({});
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterState>({
    query: '',
    minScore: 0,
    sortKey: 'score',
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tile, setTile] = useState<TileId>('street');

  const baseProfile = profiles[baseProfileId];
  const activeProfile =
    profileId === 'custom'
      ? applyOverrides(baseProfile, customWeights, targetOverrides)
      : profiles[profileId];

  const ranked = useMemo(() => scoreAll(sites, activeProfile, parameters), [activeProfile]);
  const baseline = useMemo(() => scoreAll(sites, baseProfile, parameters), [baseProfile]);
  const filtered = useMemo(() => applyFilters(ranked, filter), [ranked, filter]);
  const maxScore = ranked.length > 0 ? ranked[0].score : 0;
  const selected = ranked.find((r) => r.site.id === selectedId) ?? null;

  const movers = useMemo<Mover[]>(() => {
    if (profileId !== 'custom') return [];
    const basePos = new Map(baseline.map((r, i) => [r.site.id, i]));
    const deltas = ranked.map((r, i) => ({
      id: r.site.id,
      name: r.site.name,
      delta: (basePos.get(r.site.id) ?? i) - i,
    }));
    return deltas
      .filter((d) => d.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name))
      .slice(0, 6);
  }, [profileId, ranked, baseline]);

  function selectBuiltIn(id: BuiltIn) {
    setProfileId(id);
    setBaseProfileId(id);
    setCustomWeights(weightsOf(profiles[id]));
    setTargetOverrides({});
    setActivePresetId(null);
  }

  function applyPreset(preset: Preset) {
    const base: BuiltIn = preset.id.startsWith('mars') ? 'mars' : 'moon';
    setBaseProfileId(base);
    setCustomWeights({ ...weightsOf(profiles[base]), ...preset.weights });
    setTargetOverrides(preset.targets ?? {});
    setProfileId('custom');
    setActivePresetId(preset.id);
  }

  function changeWeight(key: ParameterKey, value: number) {
    setCustomWeights((w) => ({ ...w, [key]: value }));
    setProfileId('custom');
    setActivePresetId(null);
  }

  function resetWeights() {
    setCustomWeights(weightsOf(baseProfile));
    setTargetOverrides({});
    setProfileId('custom');
    setActivePresetId(null);
  }

  function exportCsv() {
    downloadCsv(
      `cosmocode-${profileId}-${baseProfileId}.csv`,
      toCsv(filtered, activeProfile.name)
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <section className="bg-canvas">
        <h1 className="text-3xl font-bold">Earth Analog Finder</h1>
        <p className="mt-3 max-w-3xl text-sm text-muted">
          This is a frontend prototype running on a curated dataset bundled with the app. Of the{' '}
          {parameters.length} parameters, {measuredCount} are measured, {derivedCount} are
          calculated, and {estimated.length} {estimated.length === 1 ? 'is' : 'are'} our own
          estimate
          {estimated.length > 0 ? ` (${estimated.map((p) => p.label.toLowerCase()).join(', ')})` : ''}.
          A live NASA data pipeline is planned.
        </p>
        <p className="mt-3 max-w-3xl text-sm text-muted">
          We rank {sites.length} real Earth sites against the conditions of a permanent Moon base or
          Mars base, across {parameters.length} parameters. Every score is shown with the working
          behind it, so you can check it or change it.
        </p>
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Profile:</span>
        {(['moon', 'mars'] as BuiltIn[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => selectBuiltIn(id)}
            className={
              profileId === id
                ? 'rounded border border-accent bg-accent px-3 py-1 text-sm text-white'
                : 'rounded border border-border px-3 py-1 text-sm text-muted hover:text-ink'
            }
          >
            {profiles[id].name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setProfileId('custom')}
          className={
            profileId === 'custom'
              ? 'rounded border border-accent bg-accent px-3 py-1 text-sm text-white'
              : 'rounded border border-border px-3 py-1 text-sm text-muted hover:text-ink'
          }
        >
          Custom
        </button>
        <span className="text-xs text-muted">{activeProfile.description}</span>
      </section>

      {ranked.length > 0 && ranked[0].structural.keys.length > 0 ? (
        <section className="rounded-lg border border-border bg-surface px-4 py-3">
          <h2 className="text-sm font-semibold">No Earth site can match these</h2>
          <p className="mt-1 text-xs text-muted">
            {ranked[0].structural.labels.join(', ')} score zero for all {ranked.length} sites, not
            because the data is missing but because Earth cannot reach them:{' '}
            {structuralNotes(activeProfile, ranked[0].structural.keys).join('; ')}. That is{' '}
            {(
              (100 * ranked[0].structural.weight) /
              (ranked[0].structural.weight + ranked[0].structural.scorableWeight)
            ).toFixed(0)}%{' '}
            of the total weight, so it is left out of the weighted mean and reported here
            instead. Averaging it in would only scale every score by the same constant and hide
            the finding.
          </p>
        </section>
      ) : null}

      <MapView
        rows={filtered}
        maxScore={maxScore}
        selectedId={selectedId}
        onSelect={setSelectedId}
        tile={tile}
        onTileChange={setTile}
      />

      <Filters value={filter} onChange={setFilter} shown={filtered.length} total={ranked.length} />

      <div className="grid gap-6 lg:grid-cols-2">
        <RankedTable
          rows={filtered}
          maxScore={maxScore}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onExport={exportCsv}
          profileName={activeProfile.name}
        />

        <div className="space-y-6">
          <ProfileBuilder
            presets={presets}
            activePresetId={activePresetId}
            onApplyPreset={applyPreset}
            weights={profileId === 'custom' ? customWeights : weightsOf(activeProfile)}
            onWeightChange={changeWeight}
            onReset={resetWeights}
            movers={movers}
            disabled={false}
          />

          {selected ? (
            <SiteDetail
              row={selected}
              sourceLinks={sourceLinks}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <section className="rounded-lg border border-border bg-surface px-4 py-6">
              <h2 className="text-sm font-semibold">Site detail</h2>
              <p className="mt-1 text-xs text-muted">
                Pick a marker on the map or a row in the table to see the full breakdown.
              </p>
            </section>
          )}
        </div>
      </div>

      <section className="rounded-lg border border-border bg-surface px-4 py-4">
        <h2 className="text-sm font-semibold">Methodology at a glance</h2>
        <p className="mt-2 text-xs text-muted">
          For each parameter, similarity is 1 minus the distance to the target divided by the
          tolerance, clamped between 0 and 1. The score is 100 times the weighted sum of those
          similarities divided by the sum of the weights, taken over the axes a site can actually
          score on. Confidence is completeness times resolution tier times 100, and it is reported
          separately. Targets, tolerances and weights all sit in src/data/config.json, and
          scripts/validate.mjs re-runs the whole thing in the terminal. The full write-up is in the{' '}
          <a href="/docs/METHODOLOGY.md" className="text-accent hover:underline">
            methodology
          </a>
          ,{' '}
          <a href="/docs/PROVENANCE.md" className="text-accent hover:underline">
            provenance
          </a>{' '}
          and{' '}
          <a href="/docs/VALIDATION.md" className="text-accent hover:underline">
            validation
          </a>{' '}
          documents.
        </p>
      </section>

      <section className="rounded-lg border border-border bg-surface px-4 py-4">
        <h2 className="text-sm font-semibold">What you can do next</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted">
          <li>Read where every number comes from in the provenance document.</li>
          <li>Re-run the scoring yourself with npm run validate.</li>
          <li>Edit a weight in src/data/config.json and watch the ranking move.</li>
          <li>Export the current ranking as CSV and check it in a spreadsheet.</li>
        </ul>
      </section>
    </main>
  );
}
