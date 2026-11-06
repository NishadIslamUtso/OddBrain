'use client';

import { parameters } from '@/lib/data';
import type { ParameterKey, Preset } from '@/lib/types';

export interface Mover {
  id: string;
  name: string;
  delta: number;
}

interface Props {
  presets: Preset[];
  activePresetId: string | null;
  onApplyPreset: (preset: Preset) => void;
  weights: Record<ParameterKey, number>;
  onWeightChange: (key: ParameterKey, value: number) => void;
  onReset: () => void;
  movers: Mover[];
  disabled: boolean;
}

export default function ProfileBuilder({
  presets,
  activePresetId,
  onApplyPreset,
  weights,
  onWeightChange,
  onReset,
  movers,
  disabled,
}: Props) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Custom profile</h2>
        <p className="mt-1 text-xs text-muted">
          Move any weight and the ranking recomputes. Presets can move a target too, and the panel
          always shows which numbers changed.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 px-4 py-3">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => onApplyPreset(p)}
            title={p.description}
            className={
              p.id === activePresetId
                ? 'rounded border border-accent bg-accent px-2 py-1 text-xs text-white disabled:opacity-50'
                : 'rounded border border-border px-2 py-1 text-xs text-muted hover:text-ink disabled:opacity-50'
            }
          >
            {p.name}
          </button>
        ))}
        <button
          type="button"
          onClick={onReset}
          disabled={disabled}
          className="rounded border border-border px-2 py-1 text-xs text-muted hover:text-ink disabled:opacity-50"
        >
          Reset weights
        </button>
      </div>

      {movers.length > 0 ? (
        <div className="border-t border-border px-4 py-3">
          <h3 className="text-xs font-semibold text-muted">Biggest movers</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {movers.map((m) => (
              <span
                key={m.id}
                className={
                  m.delta > 0
                    ? 'rounded border border-border px-2 py-1 text-xs text-[#15803d]'
                    : 'rounded border border-border px-2 py-1 text-xs text-[#b91c1c]'
                }
              >
                {m.name} {m.delta > 0 ? `+${m.delta}` : m.delta}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <details className="border-t border-border px-4 py-3">
        <summary className="cursor-pointer text-xs font-semibold text-muted">
          Edit all 13 weights
        </summary>
        <div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-2">
          {parameters.map((p) => (
            <label key={p.key} className="block text-xs text-muted">
              <span className="flex items-center justify-between">
                <span>
                  {p.label} <span className="text-muted">({p.unit})</span>
                </span>
                <span className="tabular-nums">{weights[p.key]?.toFixed(2) ?? '0.00'}</span>
              </span>
              <input
                type="range"
                min={0}
                max={3}
                step={0.05}
                value={weights[p.key] ?? 1}
                disabled={disabled}
                onChange={(e) => onWeightChange(p.key, Number(e.target.value))}
                className="mt-1 w-full"
              />
            </label>
          ))}
        </div>
      </details>
    </section>
  );
}
