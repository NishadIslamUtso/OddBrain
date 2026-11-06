'use client';

import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from 'react-leaflet';
import { fmt } from '@/lib/data';
import type { ScoredSite } from '@/lib/types';

export type TileId = 'street' | 'satellite' | 'hillshade';

/** Three free tile layers. No API key, no account, no paid tier. */
export const TILES: { id: TileId; name: string; url: string; attribution: string }[] = [
  {
    id: 'street',
    name: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
  },
  {
    id: 'satellite',
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles © Esri',
  },
  {
    id: 'hillshade',
    name: 'Hillshade',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenTopoMap contributors',
  },
];

/** Light to dark blue ramp. Scores are relative, so the ramp follows the data. */
const RAMP = ['#e8eef5', '#cfe0fb', '#a9c9f7', '#7fb0f2', '#4f90ec', '#2f74dd', '#205fc0'];

export function colorFor(score: number, max: number): string {
  if (max <= 0) return RAMP[0];
  const t = Math.max(0, Math.min(1, score / max));
  return RAMP[Math.min(RAMP.length - 1, Math.round(t * (RAMP.length - 1)))];
}

interface Props {
  rows: ScoredSite[];
  maxScore: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  tile: TileId;
  onTileChange: (id: TileId) => void;
}

export default function MapView({
  rows,
  maxScore,
  selectedId,
  onSelect,
  tile,
  onTileChange,
}: Props) {
  const active = TILES.find((t) => t.id === tile) ?? TILES[0];
  const lowConfidence = rows.filter((r) => r.confidence < 75).length;

  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Layer</span>
          {TILES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTileChange(t.id)}
              className={
                t.id === tile
                  ? 'rounded border border-accent bg-accent px-2 py-1 text-xs text-white'
                  : 'rounded border border-border px-2 py-1 text-xs text-muted hover:text-ink'
              }
            >
              {t.name}
            </button>
          ))}
        </div>

      </div>

      <div className="h-[420px] w-full overflow-hidden">
        <div className="h-full w-full">
          <MapContainer center={[10, 0]} zoom={2} scrollWheelZoom className="h-full w-full">
            <TileLayer key={active.id} url={active.url} attribution={active.attribution} />
            {rows.map((row) => {
              const isSelected = row.site.id === selectedId;
              return (
                <CircleMarker
                  key={row.site.id}
                  center={[row.site.lat, row.site.lon]}
                  radius={isSelected ? 11 : 5 + row.score / 9}
                  pathOptions={{
                    color: isSelected ? '#0f172a' : '#334155',
                    weight: isSelected ? 3 : 1,
                    fillColor: colorFor(row.score, maxScore),
                    fillOpacity: 0.9,
                    // Dashed marker means the data behind this site is sparse.
                    dashArray: row.confidence < 75 ? '4 3' : undefined,
                  }}
                  eventHandlers={{ click: () => onSelect(row.site.id) }}
                >
                  <Tooltip direction="top" offset={[0, -2]}>
                    {row.site.name}: {fmt(row.score)} (confidence {row.confidence})
                  </Tooltip>
                  <Popup>
                    <strong>{row.site.name}</strong>
                    <br />
                    {row.site.country}
                    <br />
                    Score {fmt(row.score)} / 100
                    <br />
                    Confidence {row.confidence}
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted">
        <span className="flex items-center gap-1">
          {RAMP.map((c) => (
            <span key={c} className="inline-block h-3 w-4" style={{ background: c }} />
          ))}
          <span className="ml-1">low to high score</span>
        </span>
        <span>{rows.length} sites shown</span>
        <span>{lowConfidence} with sparse data (dashed marker)</span>
      </div>
    </section>
  );
}
