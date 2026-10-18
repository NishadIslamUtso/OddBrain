import { useEffect, useState } from 'react'
import { Copy, ExternalLink, RefreshCw } from 'lucide-react'
import { useEngine } from '@/state/engine'
import { getEngineApi, isDemo } from '@/platform/bridge'

/**
 * The Connectors pane: the three brains, each wired to this machine through
 * its own door. Words, not coloured dots — a light that reads "works" while
 * turns fail was the fake this pane must never repeat. Every card states the
 * machine's actual answer and the one action that improves it.
 */

type CardTone = 'idle' | 'ok' | 'missing'

const toneRing = (tone: CardTone): string =>
  tone === 'ok' ? 'border-ok/40' : tone === 'missing' ? 'border-line' : 'border-line'

function CopyChip({ line, label }: { line: string; label: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => {
        void navigator.clipboard?.writeText(line).catch(() => undefined)
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-muted transition-colors hover:text-ink"
    >
      <Copy size={9} aria-hidden />
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export default function ConnectorsSection(): React.JSX.Element {
  const engine = useEngine()
  const [door, setDoor] = useState<{ checking: boolean; ok: boolean; count: number; error: string }>({
    checking: false,
    ok: false,
    count: 0,
    error: '',
  })
  const [overrides, setOverrides] = useState<{ 'claude-code': string; agy: string }>({ 'claude-code': '', agy: '' })
  const [serving, setServing] = useState(false)
  const [say, setSay] = useState('')

  const readOverrides = (): void => {
    for (const id of ['claude-code', 'agy'] as const) {
      void getEngineApi()
        .binaryOverride(id)
        .then((reply) => setOverrides((current) => ({ ...current, [id]: reply.path })))
        .catch(() => {})
    }
  }

  const checkAll = (): void => {
    void engine.checkEngines(true)
    readOverrides()
    if (isDemo) return
    setDoor({ checking: true, ok: false, count: 0, error: '' })
    void getEngineApi()
      .models()
      .then((answer) => {
        setDoor({
          checking: false,
          ok: answer.ok,
          count: answer.models.length,
          error: answer.ok ? '' : answer.error || 'the door did not answer',
        })
      })
      .catch(() => setDoor({ checking: false, ok: false, count: 0, error: 'the door did not answer' }))
  }

  /** Start the brain door with the binary the app found (his installed copy first). */
  const startDoor = (): void => {
    setServing(true)
    setSay('Starting the brain door…')
    void getEngineApi()
      .downloads.serveStart()
      .then((answer) => {
        setSay(answer.answer)
        setServing(false)
        checkAll()
      })
      .catch(() => {
        setServing(false)
        setSay('The brain door could not be started.')
      })
  }

  const pointTo = (id: 'claude-code' | 'agy'): void => {
    void getEngineApi()
      .pickBinary(id)
      .then((answer) => {
        setSay(answer.answer)
        checkAll()
      })
  }

  const clearPoint = (id: 'claude-code' | 'agy'): void => {
    void getEngineApi()
      .clearBinary(id)
      .then((answer) => {
        setSay(answer.answer)
        checkAll()
      })
  }

  useEffect(() => {
    checkAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const known = (id: 'claude-code' | 'agy') => engine.detection.engines.find((entry) => entry.id === id)
  const engineTone = (id: 'claude-code' | 'agy'): CardTone => {
    if (engine.detection.loading) return 'idle'
    const found = known(id)?.found
    return found ? 'ok' : 'missing'
  }
  const doorUrl = (engine.settings.baseUrl || 'http://localhost:11434').replace(/^https?:\/\//, '')
  const ollamaTone: CardTone = door.checking ? 'idle' : door.ok ? 'ok' : 'missing'
  const activeId = engine.settings.id

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11.5px] text-muted">The three brains, and what this machine said the last time it was asked.</p>
        <button
          type="button"
          onClick={checkAll}
          disabled={engine.detection.loading || door.checking}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] text-muted transition-colors hover:text-ink disabled:opacity-50"
        >
          <RefreshCw size={10} aria-hidden /> {engine.detection.loading || door.checking ? 'Checking…' : 'Check all'}
        </button>
      </div>

      {say ? (
        <p role="status" className="rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[11.5px] leading-relaxed text-ink">
          {say}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {/* ── Claude Code ── */}
        <section className={`rounded-xl border ${toneRing(engineTone('claude-code'))} bg-card p-3`} aria-label="Claude Code connector">
          <header className="flex items-center gap-2">
            <h3 className="text-[12.5px] font-medium text-ink">Claude Code</h3>
            <span className="text-[11px] text-muted">
              {engine.detection.loading
                ? 'asking the machine…'
                : engineTone('claude-code') === 'ok'
                  ? `installed · ${known('claude-code')?.version || 'version unknown'}`
                  : 'not installed'}
            </span>
            {activeId === 'claude-code' ? (
              <span className="ml-auto rounded-md border border-line px-1.5 py-0.5 text-[10px] text-muted">active engine</span>
            ) : null}
          </header>
          <p className="mt-1 break-all text-[11px] text-muted" title={known('claude-code')?.path || ''}>
            {engineTone('claude-code') === 'ok' && known('claude-code')?.path
              ? `found at ${known('claude-code')?.path}`
              : 'connect it and this app can act on your PC: files, commands, everything, through permission cards.'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {engineTone('claude-code') === 'ok' && activeId !== 'claude-code' ? (
              <button
                type="button"
                onClick={() => void engine.pick('claude-code')}
                className="rounded-lg border border-line px-2 py-1 text-[11.5px] text-ink transition-colors hover:border-accent"
              >
                Use this engine
              </button>
            ) : null}
            {engineTone('claude-code') !== 'ok' ? (
              <>
                <span className="font-mono text-[11px] text-muted">npm install -g @anthropic-ai/claude-code</span>
                <CopyChip line="npm install -g @anthropic-ai/claude-code" label="Copy the install command" />
                <span className="text-[11px] text-muted">or press Download beside claude-code in the Engine bay.</span>
              </>
            ) : null}
            {engineTone('claude-code') !== 'ok' ? null : (
              <span className="text-[11px] text-muted">Sign in once: run <span className="font-mono">claude</span> in any terminal and follow its login. The app never borrows your account.</span>
            )}
            <button
              type="button"
              onClick={() => pointTo('claude-code')}
              className="rounded-lg border border-line px-2 py-1 text-[11.5px] text-muted transition-colors hover:text-ink"
              title="If the automatic probe cannot see your install, point at the exe yourself — it beats every probe."
            >
              {overrides['claude-code'] ? 'Change the pointed exe' : 'Point to the exe…'}
            </button>
            {overrides['claude-code'] ? (
              <>
                <span className="min-w-0 truncate font-mono text-[10.5px] text-muted" title={overrides['claude-code']}>
                  {overrides['claude-code']}
                </span>
                <button
                  type="button"
                  onClick={() => clearPoint('claude-code')}
                  className="rounded-lg border border-line px-2 py-1 text-[11px] text-muted transition-colors hover:text-warn"
                >
                  Use automatic detection
                </button>
              </>
            ) : null}
          </div>
        </section>

        {/* ── agy ── */}
        <section className={`rounded-xl border ${toneRing(engineTone('agy'))} bg-card p-3`} aria-label="agy connector">
          <header className="flex items-center gap-2">
            <h3 className="text-[12.5px] font-medium text-ink">agy</h3>
            <span className="text-[11px] text-muted">
              {engine.detection.loading
                ? 'asking the machine…'
                : engineTone('agy') === 'ok'
                  ? `installed · ${known('agy')?.version || 'version unknown'}`
                  : 'not installed'}
            </span>
            {activeId === 'agy' ? (
              <span className="ml-auto rounded-md border border-line px-1.5 py-0.5 text-[10px] text-muted">active engine</span>
            ) : null}
          </header>
          <p className="mt-1 break-all text-[11px] text-muted" title={known('agy')?.path || ''}>
            {engineTone('agy') === 'ok' && known('agy')?.path
              ? `found at ${known('agy')?.path}`
              : 'Google\u2019s CLI from antigravity.google — beware fake \u201cgemini-antigravity\u201d repos that hand out exe files.'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {engineTone('agy') === 'ok' && activeId !== 'agy' ? (
              <button
                type="button"
                onClick={() => void engine.pick('agy')}
                className="rounded-lg border border-line px-2 py-1 text-[11.5px] text-ink transition-colors hover:border-accent"
              >
                Use this engine
              </button>
            ) : null}
            <a
              href="https://antigravity.google"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11.5px] text-muted transition-colors hover:text-ink"
            >
              Official page <ExternalLink size={10} aria-hidden />
            </a>
            <button
              type="button"
              onClick={() => pointTo('agy')}
              className="rounded-lg border border-line px-2 py-1 text-[11.5px] text-muted transition-colors hover:text-ink"
              title="If the automatic probe cannot see your install, point at agy.exe yourself — it beats every probe."
            >
              {overrides.agy ? 'Change the pointed exe' : 'Point to the exe…'}
            </button>
            {overrides.agy ? (
              <>
                <span className="min-w-0 truncate font-mono text-[10.5px] text-muted" title={overrides.agy}>
                  {overrides.agy}
                </span>
                <button
                  type="button"
                  onClick={() => clearPoint('agy')}
                  className="rounded-lg border border-line px-2 py-1 text-[11px] text-muted transition-colors hover:text-warn"
                >
                  Use automatic detection
                </button>
              </>
            ) : null}
            {engineTone('agy') === 'ok' ? (
              <span className="text-[11px] text-muted">Sign in once: run <span className="font-mono">agy</span> in a terminal.</span>
            ) : null}
          </div>
        </section>

        {/* ── Ollama ── */}
        <section className={`rounded-xl border ${toneRing(ollamaTone)} bg-card p-3`} aria-label="Ollama connector">
          <header className="flex items-center gap-2">
            <h3 className="text-[12.5px] font-medium text-ink">Ollama</h3>
            <span className="text-[11px] text-muted">
              {door.checking
                ? `knocking on ${doorUrl}…`
                : door.ok
                  ? `answering at ${doorUrl} · ${door.count} brain${door.count === 1 ? '' : 's'}`
                  : `nothing answering at ${doorUrl}`}
            </span>
          </header>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            {door.ok
              ? 'Free local brains for Claude Code: pick one in the composer\u2019s model menu (the door is used when a brain is named). Start and stop the staged copy in the Engine bay.'
              : 'The free local brains come from here. You do NOT need this app to carry them \u2014 install Ollama yourself, once, and it is found automatically. The ollama.com download is a CLI-only build and the desktop app quits fully, so the app starts the server (the "brain door") for you:'}
          </p>
          {!door.ok ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={startDoor}
                disabled={serving}
                title="The Ollama app quits fully — it does not keep its server running. The app starts the door itself: your installed copy first, its staged copy second."
                className="rounded-lg border border-accent/60 px-2.5 py-1 text-[11.5px] text-ink transition-colors hover:border-accent disabled:opacity-50"
              >
                {serving ? 'Starting…' : 'Start the brain door'}
              </button>
              <span className="text-[11px] text-muted">or install it yourself:</span>
              <span className="font-mono text-[11px] text-muted">winget install Ollama.Ollama</span>
              <CopyChip line="winget install Ollama.Ollama" label="Copy the winget install command" />
              <a
                href="https://ollama.com/download"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11.5px] text-muted transition-colors hover:text-ink"
              >
                ollama.com/download <ExternalLink size={10} aria-hidden />
              </a>
              <span className="text-[10.5px] text-muted">
                (the desktop app quits fully and does not keep its server running — this button starts it for you; winget's build is the same brain without the tray)
              </span>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
