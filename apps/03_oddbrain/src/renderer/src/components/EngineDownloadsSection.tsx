import { useEffect, useState } from 'react'
import { Download, ExternalLink, Play, Trash2 } from 'lucide-react'
import { ENGINE_DOWNLOADS } from '@shared/lib/engineDownloads'
import { displayCommandLine } from '@shared/lib/commandLine'
import { getEngineApi } from '@/platform/bridge'

type Staged = { engine: string; endpoint: string; sha256: string; at: string }
type Tick = { engine: string; got: number; total: number | null; phase: string; answer?: string }

/**
 * Bringing a brain home.
 *
 * His decision: the trio is downloadable INSIDE the app, into folders the app
 * owns. Every card says the exact endpoint and destination before any byte
 * moves; the download itself is the permission. agy has no verified endpoint
 * yet, so its card opens Google's own page instead of pretending. What the
 * app brings home is labeled app-managed and is removed as cleanly.
 */
export default function EngineDownloadsSection() {
  const [staged, setStaged] = useState<Record<string, Staged | undefined>>({})
  const [busy, setBusy] = useState('')
  const [tick, setTick] = useState<Tick | null>(null)
  const [lines, setLines] = useState<string[]>([])
  const [confirming, setConfirming] = useState<{ engine: string; command: string[] } | null>(null)

  useEffect(() => {
    void getEngineApi().downloads.status().then(setStaged)
    const off = getEngineApi().downloads.onEvent((incoming) => {
      setTick(incoming)
      if (incoming.phase === 'staged' || incoming.phase === 'error') {
        setLines(current => [...current.slice(-2), incoming.answer ?? incoming.phase])
        if (incoming.phase === 'staged') void getEngineApi().downloads.status().then(setStaged)
      }
    })
    return off
  }, [])

  const say = (line: string): void => setLines(current => [...current.slice(-2), line])

  const engines = Object.keys(ENGINE_DOWNLOADS)

  return (
    <section aria-label="Bring a brain home" className="mt-2 rounded-xl border border-line bg-card p-2.5">
      <h3 className="text-[12px] font-medium text-ink">Bring a brain home</h3>
      <p className="mt-0.5 text-[11px] text-muted">
        Downloaded into this app's own folder, from the official endpoint only. Nothing machine-wide.
      </p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {engines.map(engine => {
          const info = ENGINE_DOWNLOADS[engine]
          if (!info) return null
          const record = staged[engine]
          return (
            <li key={engine} className="flex items-center gap-2 rounded-lg border border-line bg-bg px-2 py-1.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] text-ink">{engine}</span>
                <span className="block truncate text-[10.5px] text-muted" title={info.note}>
                  {info.kind === 'page' ? info.page : info.host}
                  {record ? ' · app-managed' : ''}
                </span>
              </span>
              {info.kind === 'page' ? (
                <a
                  href={info.page}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink"
                >
                  Official page <ExternalLink size={10} />
                </a>
              ) : record && engine === 'ollama' ? (
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Start the staged runtime on 127.0.0.1:11434 — the app owns this process"
                    onClick={() => {
                      say('Starting the local runtime...')
                      void getEngineApi().downloads.serveStart().then(answer => say(answer.answer))
                    }}
                    className="rounded-lg border border-line px-2 py-0.5 text-[11px] text-ink hover:border-accent"
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    title="Stop the runtime the app started (a runtime you started yourself stays yours)"
                    onClick={() => {
                      void getEngineApi().downloads.serveStop().then(answer => say(answer.answer))
                    }}
                    className="rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink"
                  >
                    Stop
                  </button>
                </span>
              ) : record ? (
                <span className="flex items-center gap-1">
                  {info.kind === 'installer-script' ? (
                    <button
                      type="button"
                      title={`Show the full installer command for ${engine}, then run it only if you say so`}
                      onClick={() => {
                        void getEngineApi().downloads.run(engine).then(answer => {
                          if (!answer.ok || !answer.command) {
                            say(answer.answer)
                            return
                          }
                          setConfirming({ engine, command: answer.command })
                        })
                      }}
                      className="flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-[11px] text-ink hover:border-accent"
                    >
                      <Play size={10} /> Run installer
                    </button>
                  ) : null}
                  <button
                    type="button"
                    title={`Remove the app-managed ${engine} and its files`}
                    onClick={() => {
                      void getEngineApi().downloads.remove(engine).then(answer => {
                        say(answer.answer)
                        if (answer.ok) {
                          setStaged(current => ({ ...current, [engine]: undefined }))
                        }
                      })
                    }}
                    className="flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink"
                  >
                    <Trash2 size={10} /> Remove
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy !== ''}
                  title={`From ${info.host} into this app's own engines folder. ${info.note}`}
                  onClick={() => {
                    setBusy(engine)
                    say(`Downloading from ${info.host}...`)
                    void getEngineApi().downloads.start(engine).then(answer => {
                      setBusy('')
                      if (!answer.ok) say(answer.answer)
                    })
                  }}
                  className="flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-[11px] text-ink hover:border-accent disabled:opacity-60"
                >
                  <Download size={10} /> {busy === engine ? 'Downloading...' : 'Download'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
        {confirming ? (
          <div className="mt-1.5 rounded-lg border border-line bg-bg p-2">
            <p className="text-[11px] text-ink">
              Run the {confirming.engine} installer on this machine? This is the whole command, nothing hidden:
            </p>
            <code className="mt-1 block break-all rounded border border-line px-1.5 py-1 text-[10.5px] text-muted">
              {displayCommandLine(confirming.command)}
            </code>
            <div className="mt-1.5 flex items-center gap-1">
              <button
                type="button"
                disabled={busy !== ''}
                onClick={() => {
                  setBusy(confirming.engine)
                  void getEngineApi().downloads.execute(confirming.engine).then(answer => {
                    setBusy('')
                    say(answer.answer)
                    setConfirming(null)
                  })
                }}
                className="rounded-lg border border-accent px-2 py-0.5 text-[11px] text-ink hover:bg-accent/10"
              >
                Run it
              </button>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(displayCommandLine(confirming.command))
                  say('The command is on the clipboard — run it in PowerShell yourself if you prefer.')
                  setConfirming(null)
                }}
                className="rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink"
              >
                Copy instead
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      {busy && tick ? (
        <p className="mt-1 text-[11px] text-muted" role="status">
          {tick.engine}: {tick.phase === 'unpacking' ? 'unpacking…' : tick.total ? `${Math.round((tick.got / tick.total) * 100)}%` : `${Math.round(tick.got / 1024)} KB`}
        </p>
      ) : null}
      {lines.length ? (
        <ul className="mt-1 flex flex-col gap-0.5">
          {lines.map((line, index) => (
            <li key={index} className="text-[10.5px] text-muted">{line}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
