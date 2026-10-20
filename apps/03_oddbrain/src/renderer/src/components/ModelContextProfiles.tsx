import { useEffect, useMemo, useState } from 'react'
import {
  resolveModelContext,
  type ModelContextOverride,
  type ModelContextOverrides,
} from '@shared/lib/modelContext'

export type ContextModelChoice = { key: string; label: string; reportedTokens?: number | null }

export default function ModelContextProfiles({ choices, value, save }: {
  choices: ContextModelChoice[]
  value: ModelContextOverrides
  save: (next: ModelContextOverrides) => void
}) {
  const unique = useMemo(() => choices.filter((choice, index, all) => all.findIndex(other => other.key === choice.key) === index), [choices])
  const [selected, setSelected] = useState('')
  const choice = unique.find(item => item.key === selected) || unique[0]
  useEffect(() => { if (!choice && selected) setSelected('') }, [choice, selected])
  if (!choice) return <p className="text-[12px] text-muted">No model has been discovered yet. Refresh Models or the Engine model list first.</p>
  const override = value[choice.key]
  const resolved = resolveModelContext({ key: choice.key, label: choice.label, reportedTokens: choice.reportedTokens, override })
  const update = (patch: Partial<ModelContextOverride>) => {
    const current = override || { mode: 'auto' as const }
    save({ ...value, [choice.key]: { ...current, ...patch } })
  }
  const status = resolved.source === 'unknown'
    ? 'Unknown model capacity · Auto gives it no guessed OddBrain cap.'
    : `${resolved.source === 'owner' ? 'Owner configured' : resolved.source === 'observed' ? 'Observed after a provider rejection' : 'Reported/configured by the runtime'} · ${resolved.capacityTokens?.toLocaleString()} tokens.`
  return <div className="flex flex-col gap-2">
    <label className="flex flex-col gap-1"><span className="text-[11.5px] text-muted">Model profile</span><select className="w-full max-w-[440px] rounded-lg border border-line bg-card px-3 py-2 text-[12.5px]" value={choice.key} onChange={event => setSelected(event.target.value)}>{unique.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
    <p className={resolved.source === 'unknown' ? 'text-[12px] text-warn' : 'text-[12px] text-muted'}>{status}</p>
    <div className="ob-choices" role="group" aria-label="Context capacity mode">
      <button type="button" className="ob-choice" aria-pressed={resolved.mode === 'auto'} onClick={() => update({ mode: 'auto', limitTokens: undefined })}>Auto</button>
      <button type="button" className="ob-choice" aria-pressed={resolved.mode === 'manual'} onClick={() => update({ mode: 'manual', limitTokens: resolved.capacityTokens || 8192 })}>Manual</button>
    </div>
    {resolved.mode === 'manual' ? <label className="flex items-center gap-2"><span className="w-[130px] text-[11.5px] text-muted">Context capacity</span><input type="number" min={256} max={10_000_000} step={256} className="w-[180px] rounded-lg border border-line bg-card px-3 py-2 text-[12.5px]" value={override?.limitTokens || resolved.capacityTokens || 8192} onChange={event => { const next = Number(event.target.value); if (Number.isSafeInteger(next) && next >= 256 && next <= 10_000_000) update({ mode: 'manual', limitTokens: next }) }} /><span className="text-[11.5px] text-muted">tokens</span></label> : null}
    <label className="flex items-center gap-2"><span className="w-[130px] text-[11.5px] text-muted">Answer reserve</span><input type="number" min={64} max={10_000_000} step={64} className="w-[180px] rounded-lg border border-line bg-card px-3 py-2 text-[12.5px]" value={override?.outputReserveTokens || resolved.outputReserveTokens} onChange={event => { const next = Number(event.target.value); if (Number.isSafeInteger(next) && next >= 64 && next <= 10_000_000) update({ outputReserveTokens: next }) }} /><span className="text-[11.5px] text-muted">tokens</span></label>
    {override ? <button type="button" className="w-fit rounded-lg border border-line px-3 py-1.5 text-[12px] hover:bg-white/[0.06]" onClick={() => { const next = { ...value }; delete next[choice.key]; save(next) }}>Reset this model</button> : null}
    <p className="text-[11.5px] text-muted">On a definite context-too-large rejection in Auto mode, OddBrain reports it, removes lower-priority history, retries, and records a provider-stated limit when available. Stored messages are never shortened.</p>
  </div>
}
