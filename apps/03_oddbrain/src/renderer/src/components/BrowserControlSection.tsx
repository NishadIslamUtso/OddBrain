import { useEffect, useState } from 'react'
import { Chrome, Check } from 'lucide-react'
import { bridge, isDemo } from '@/platform/bridge'

/**
 * Settings > Skills > Browser control.
 *
 * The engine may drive a browser — click, type, read pages — through its own
 * MCP tooling (Chrome's official DevTools MCP, or Playwright's). The app does
 * not drive anything: it writes one honest entry into the engine's tool list
 * and the permission cards keep doing their job. Every click the engine wants
 * still asks, exactly like every file edit already does.
 *
 * What this switch is NOT: a new permission for the app, a second engine, or
 * an always-on watcher. Off is the default, and off means off.
 */

type Server = { name: string; command?: string; args?: string[]; url?: string }

/** The tool entries this section manages. Nothing else in the list is touched. */
const CHOICES: Array<{ id: string; label: string; note: string; server: Server }> = [
  {
    id: 'chrome-devtools',
    label: 'Chrome, official DevTools tools',
    note: 'Drives your installed Chrome. The first run fetches the tool with npx; after that it is local.',
    server: { name: 'chrome-devtools', command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest'] },
  },
  {
    id: 'playwright',
    label: 'Playwright, its own browser',
    note: 'Downloads and drives a separate browser, so your Chrome is never touched.',
    server: { name: 'playwright', command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
  },
]

const MANAGED = new Set(CHOICES.map(choice => choice.id))

export default function BrowserControlSection() {
  const [active, setActive] = useState<string[]>([])
  const [written, setWritten] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (isDemo) return
    void bridge.mcp
      .read()
      .then(reply => setActive(reply.servers.map(server => server.name).filter(name => MANAGED.has(name))))
      .catch(() => setError('Could not read the engine tool list.'))
  }, [])

  const save = (servers: Server[]): void => {
    setBusy(true)
    setError('')
    void bridge.mcp
      .write(servers)
      .then(reply => {
        if (!reply.ok) {
          setError('The engine tool list refused the change. Nothing is assumed saved.')
          return
        }
        setWritten(reply.written)
        return bridge.mcp.read().then(next => setActive(next.servers.map(s => s.name).filter(n => MANAGED.has(n))))
      })
      .catch(() => setError('Writing the engine tool list failed. Nothing is assumed saved.'))
      .finally(() => setBusy(false))
  }

  const toggle = (id: string): void => {
    if (busy || isDemo) return
    const choice = CHOICES.find(c => c.id === id)
    if (!choice) return
    const on = active.includes(id)
    void bridge.mcp.read().then(reply => {
      const rest = reply.servers.filter(server => !MANAGED.has(server.name))
      const next = on ? rest : [...rest, choice.server]
      save(next)
    })
  }

  if (isDemo) {
    return (
      <p className="text-[12px] leading-relaxed text-muted">
        Browser control belongs to the desktop app, this preview has no engine to grant it to.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[12px] leading-relaxed text-muted">
        Let the engine drive a browser, open sites, click, fill forms, through its own official tool
        plugins. Every click still comes to you as a permission card first, the same as file edits.
        Passwords and payments are never touched, same rules as the capture extension.
      </p>
      <ul className="flex flex-col gap-1.5">
        {CHOICES.map(choice => {
          const on = active.includes(choice.id)
          return (
            <li key={choice.id} className="flex items-start gap-2.5 rounded-xl border border-line bg-card p-2.5">
              <Chrome size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] text-ink">{choice.label}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{choice.note}</p>
              </div>
              <button
                type="button"
                onClick={() => toggle(choice.id)}
                disabled={busy}
                aria-pressed={on}
                className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11.5px] ${
                  on ? 'border-ok/60 bg-ok/10 text-ink' : 'border-line text-muted hover:text-ink'
                } disabled:opacity-60`}
              >
                {on ? (
                  <span className="flex items-center gap-1">
                    <Check size={11} aria-hidden /> On
                  </span>
                ) : (
                  'Off'
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {error ? <p className="text-[12px] text-warn">{error}</p> : null}
      {written.length > 0 && !error ? (
        <p className="text-[11px] leading-relaxed text-muted">
          Written into the engines' own configs: {written.map(path => path.split(/[\\/]/).slice(-2).join('/')).join(' · ')}.
          Take effect on the engine's next task.
        </p>
      ) : null}
    </div>
  )
}
