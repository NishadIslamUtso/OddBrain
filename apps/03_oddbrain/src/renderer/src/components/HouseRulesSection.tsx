import NativeRuleReview from './NativeRuleReview'
import { useEffect, useState } from 'react'
import { bridge } from '@/platform/bridge'
import type { HouseRules } from '@shared/lib/houseRules'

/** App-owned instructions travel with requests. Changes to native global files
 * use their own exact, one-use file review instead of automatic deployment. */

const FIELDS: Array<{ key: keyof HouseRules; label: string; hint: string; rows: number }> = [
  { key: 'identity', label: 'Who you are', hint: 'What the engine is inside this app', rows: 3 },
  { key: 'artifacts', label: 'Artifacts', hint: 'The contract: build real files the app can show', rows: 3 },
  { key: 'permissions', label: 'Approvals', hint: 'How asking and approving works, your standing instructions live here', rows: 3 },
  { key: 'memory', label: 'Memory and searching', hint: 'What may be read, and when, the no-sweeping rule', rows: 3 },
  { key: 'style', label: 'How you write', hint: 'Plain words, real results, no mocking', rows: 3 },
]

export default function HouseRulesSection() {
  const [rules, setRules] = useState<HouseRules | null>(null)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void bridge.houseRules
      .read()
      .then((answer) => setRules(answer.rules))
      .catch(() => setStatus('The rulebook could not be read here.'))
  }, [])

  const save = async (): Promise<void> => {
    if (!rules || saving) return
    setSaving(true)
    setStatus('')
    try {
      const answer = await bridge.houseRules.write(rules)
      setStatus(
        answer.ok
          ? 'Saved for future app requests. Native global files were not changed.'
          : 'Saving needs the desktop app, this window is the interface only.',
      )
    } catch (error) { setStatus((error as Error).message || 'Instructions could not be saved; originals are unchanged.') } finally {
      setSaving(false)
    }
  }

  if (!rules) {
    return <p className="text-[12px] text-muted">{status || 'Reading the rulebook…'}</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {FIELDS.map((field) => (
        <label key={field.key} className="rounded-lg border border-line bg-card px-3 py-2">
          <span className="block text-[11.5px] text-muted">{field.label}</span>
          <span className="block text-[11px] text-muted/70">{field.hint}</span>
          <textarea
            className="mt-1 max-h-48 min-h-[64px] w-full resize-y rounded-md border border-line bg-bg px-2 py-1.5 text-[12.5px] leading-relaxed text-ink outline-none focus:border-accent/60"
            rows={field.rows}
            value={rules[field.key]}
            aria-label={field.label}
            onChange={(event) => setRules({ ...rules, [field.key]: event.target.value })}
          />
        </label>
      ))}
      <div className="flex items-center gap-2"><button type="button" className="ob-small-button" disabled={saving} onClick={() => { void bridge.houseRules.read().then(answer => { setRules(answer.defaults); setStatus('Defaults loaded. Save to use them in future app requests.') }).catch(() => setStatus('Defaults could not be read.')) }}>Restore defaults</button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-[var(--accent-ink)] hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save app instructions'}
        </button>
        {status ? (
          <p className="text-[11.5px] text-muted" role="status">
            {status}
          </p>
        ) : null}
      </div>
      <p className="text-[11px] text-muted">
        Blank fields fall back to the default rule. These instructions accompany app requests. Native global files remain unchanged until you review and allow a separate file change.
      </p>
      <NativeRuleReview />
    </div>
  )
}
