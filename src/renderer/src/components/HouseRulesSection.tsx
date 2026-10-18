import { useEffect, useState } from 'react'
import { bridge } from '@/platform/bridge'
import type { HouseRules } from '@shared/lib/houseRules'

/**
 * The rulebook, editable.
 *
 * These five texts are the app's canonical instructions — the same rules that
 * ride Claude Code as CLAUDE.md and agy as AGENTS.md, in the marked block of
 * each engine's own global file. Saving writes once and deploys everywhere;
 * the owner's own words in those files are never touched. A blank field
 * simply falls back to the default rule — never an empty rule.
 */

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
          ? `Saved and delivered to ${answer.written.length} engine${answer.written.length === 1 ? '' : 's'}.`
          : 'Saving needs the desktop app, this window is the interface only.',
      )
    } finally {
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
      <div className="flex items-center gap-2"><button type="button" className="ob-small-button" disabled={saving} onClick={() => { void bridge.houseRules.read().then(answer => { setRules(answer.defaults); setStatus('Defaults loaded. Save and deliver to apply them.') }).catch(() => setStatus('Defaults could not be read.')) }}>Restore defaults</button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-medium text-[var(--accent-ink)] hover:bg-accent/90 disabled:opacity-50"
        >
          {saving ? 'Delivering…' : 'Save and deliver to every engine'}
        </button>
        {status ? (
          <p className="text-[11.5px] text-muted" role="status">
            {status}
          </p>
        ) : null}
      </div>
      <p className="text-[11px] text-muted">
        Blank fields fall back to the default rule. The rules land as a marked block inside each engine's own file, as
        Claude Code's CLAUDE.md and agy's GEMINI.md, and nothing you wrote around that block is ever touched.
      </p>
    </div>
  )
}
