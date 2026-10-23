import { useCallback, useEffect, useRef, useState } from 'react'
import { bridge, isDemo } from '../platform/bridge'

type Flag = 'loginItem' | 'warmRuntime' | 'keepLoadedAlways'
type Props = { flag: Flag; onLabel: string; offLabel: string }

/** Show the desktop's answer, never an optimistic guess about a machine setting. */
export default function MachineFlagRow({ flag, onLabel, offLabel }: Props) {
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(true), [error, setError] = useState('')
  const pending = useRef(false), generation = useRef(0)
  const label = flag === 'loginItem' ? 'Run at startup' : flag === 'warmRuntime' ? 'Warm runtime' : 'Keep model loaded'
  const read = useCallback(async () => {
    const id = ++generation.current
    pending.current = true; setBusy(true); setOn(null); setError('')
    try {
      const result = await bridge.app.flags?.get()
      if (typeof result?.[flag] !== 'boolean') throw new Error('No setting returned')
      if (id === generation.current) setOn(result[flag])
    } catch {
      if (id === generation.current) setError('Could not read this setting. Its current value is unknown.')
    } finally {
      if (id === generation.current) { pending.current = false; setBusy(false) }
    }
  }, [flag])
  useEffect(() => {
    if (!isDemo) void read()
    return () => { generation.current++ }
  }, [read])
  const save = async (value: boolean) => {
    if (pending.current || on === null || value === on) return
    const id = ++generation.current
    pending.current = true; setBusy(true); setError('')
    try {
      const result = await bridge.app.flags?.set({ [flag]: value })
      if (typeof result?.[flag] !== 'boolean') throw new Error('No setting returned')
      if (id === generation.current) {
        setOn(result[flag])
        if (result[flag] !== value) setError('The app did not accept this change. The confirmed setting is shown.')
      }
    } catch {
      // A failed reply can follow a partial save. Neither the old nor requested
      // value is safe to claim until the desktop has been read again.
      if (id === generation.current) { setOn(null); setError('Could not confirm whether this was saved. Read the setting again before changing it.') }
    } finally {
      if (id === generation.current) { pending.current = false; setBusy(false) }
    }
  }
  if (isDemo) return <span className="text-[11.5px] text-muted">A desktop-app switch — this window is the interface only.</span>
  return <div aria-label={label} aria-busy={busy}>
    {on !== null && (flag === 'keepLoadedAlways' ? <div className="flex gap-1.5 sm:justify-end">
      {[{ label: 'Off', value: false }, { label: 'Always', value: true }].map(option => <button
        key={option.label} type="button" disabled={busy} aria-pressed={on === option.value}
        className={`rounded-full border px-3 py-1 text-[12px] ${on === option.value ? 'border-accent bg-accent/15 text-ink' : 'border-line text-muted hover:bg-white/[0.06]'}`}
        onClick={() => { void save(option.value) }}>{option.label}</button>)}
    </div> : <div className="flex items-center gap-3 sm:justify-end">
      <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={busy}
        onClick={() => { void save(!on) }}
        className={`relative h-[22px] w-[40px] shrink-0 rounded-full border transition-colors ${on ? 'border-accent bg-accent/30' : 'border-line bg-card'}`}>
        <span className={`absolute top-[2px] h-[16px] w-[16px] rounded-full transition-all ${on ? 'left-[20px] bg-accent' : 'left-[2px] bg-muted'}`} />
      </button>
      <span className="text-[11.5px] text-muted">{on ? onLabel : offLabel}</span>
    </div>)}
    {busy && <p className="ob-inline-note" role="status">{on === null ? 'Reading setting…' : 'Saving…'}</p>}
    {error && <p className="ob-inline-note" role="alert">{error}</p>}
    {!busy && error && <button type="button" className="ob-small-button" onClick={() => { void read() }}>Read setting again</button>}
  </div>
}
