import { useEffect, useRef, useState } from 'react'
import { effortTarget, selectedEffort, unverifiedCapabilities, type EngineCapabilityReport } from '@shared/lib/engineCapabilities'
import type { ThinkingMode } from '@shared/lib/engine'
import { getEngineApi } from '@/platform/bridge'
import { useEngine } from '@/state/engine'

/** Effort belongs to the selected engine/model/provider, never to Show thinking. */
export default function ReasoningEffort() {
  const engine = useEngine()
  const target = effortTarget(engine.settings)
  const [report, setReport] = useState<EngineCapabilityReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const refresh = async (): Promise<void> => {
    const own = ++generation.current
    setLoading(true); setNotice(''); setReport(null)
    try {
      const answer = await getEngineApi().capabilities()
      if (own === generation.current) setReport(answer.effort.target === target ? answer : unverifiedCapabilities(engine.settings, 'The selected model changed. Refresh its options.'))
    } catch {
      if (own === generation.current) setReport(unverifiedCapabilities(engine.settings, 'Model details could not be checked. Refresh to try again.'))
    } finally { if (own === generation.current) setLoading(false) }
  }
  useEffect(() => {
    setSaving(false)
    void refresh()
    return () => { generation.current += 1 }
  }, [target])
  const current = report?.effort.target === target ? report.effort : null
  const chosen = selectedEffort(engine.settings)
  const choose = async (mode: ThinkingMode): Promise<void> => {
    const own = generation.current
    setSaving(true); setNotice('')
    try {
      const answer = await engine.setThinking(mode, target)
      if (own === generation.current) setNotice(answer.answer)
    } catch { if (own === generation.current) setNotice('Effort could not be saved. Your previous choice is unchanged.') }
    finally { if (own === generation.current) setSaving(false) }
  }
  return <div className="mt-1 border-t border-line px-2.5 pb-1 pt-2" role="group" aria-label="Reasoning effort">
    <label className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
      <span>Reasoning effort</span>
      <select aria-label="Reasoning effort" value={chosen} disabled={saving} onChange={event => void choose(event.target.value as ThinkingMode)} className="rounded-md border border-line bg-card px-1 py-1 text-ink">
        <option value="default">Engine default</option>
        {current?.levels.map(level => <option key={level} value={level}>{level === 'xhigh' ? 'Extra high' : level[0].toUpperCase() + level.slice(1)}</option>)}
        {chosen !== 'default' && !current?.levels.includes(chosen) ? <option value={chosen} disabled>{chosen} (not checked)</option> : null}
      </select>
    </label>
    <p className="pt-1 text-[10.5px] leading-relaxed text-muted" role="status">
      {saving ? 'Checking and saving…' : loading ? 'Checking this engine and model…' : notice || current?.note}
    </p>
    <button type="button" className="mt-1 text-[11px] text-muted hover:text-ink" disabled={loading || saving} onClick={() => void refresh()}>Refresh effort options</button>
  </div>
}
