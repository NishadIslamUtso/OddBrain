import { useEffect, useState } from 'react'
import { PackagePlus, RefreshCw, Trash2, Terminal } from 'lucide-react'
import { bridge } from '@/platform/bridge'
import type { CommandLine, MarketplaceSource } from '../../../main/store/marketplaces'

/**
 * Store screen, the labelled sources: Claude Code's own plugin marketplaces
 * (phase 2) and agy's catalog slot (phase 3) beside the pack index above.
 *
 * Adding a source is one capped read of the repository's marketplace index —
 * done only by this press, never at boot, never in the background. Installing
 * is a card carrying the engine's EXACT CLI line; the app runs the engine's
 * own command and never assembles plugin folders itself.
 */
export default function MarketplaceSources() {
  const [sources, setSources] = useState<MarketplaceSource[]>([])
  const [input, setInput] = useState('')
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [openCard, setOpenCard] = useState<string | null>(null)
  const [lines, setLines] = useState<CommandLine[]>([])
  const [agyAnswer, setAgyAnswer] = useState('')

  const reload = (): void => {
    void bridge.marketplaces.list().then(setSources)
  }
  useEffect(reload, [])

  const act = (work: Promise<{ ok: boolean; answer: string }>): void => {
    if (busy) return
    setBusy(true)
    setAnswer('')
    void work
      .then(reply => {
        setAnswer(reply.answer)
        reload()
      })
      .finally(() => setBusy(false))
  }

  const card = async (id: string, plugin?: string): Promise<void> => {
    setAnswer('')
    const reply = await bridge.marketplaces.commands(id, plugin)
    setAnswer(reply.answer ?? '')
    setOpenCard(reply.ok ? `${id}::${plugin ?? 'register'}` : null)
    setLines(reply.lines)
  }

  const runLine = (id: string, plugin: string | undefined, line: number): void => {
    act(bridge.marketplaces.run({ id, ...(plugin ? { plugin } : {}), line }))
  }

  return (
    <section className="mt-2 border-t border-line pt-3" aria-label="Engine marketplaces">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Engine marketplaces</h3>
      <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
        The engines' own catalogs, read from their own repositories when you add them — never synced, never updated
        behind your back. Installing is always the engine's own command on a card: the exact line first, the press
        second. <span className="text-[10.5px] uppercase tracking-wide">Source</span> badges on every card keep the
        provenance straight.
      </p>

      <div className="mt-2 flex items-center gap-1.5">
        <input
          type="text"
          value={input}
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && input.trim() && !busy) act(bridge.marketplaces.add(input.trim()))
          }}
          placeholder="owner/repo  (a GitHub repository with .claude-plugin/marketplace.json)"
          aria-label="Claude Code marketplace repository"
          className="min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] text-ink placeholder:text-muted"
        />
        <button
          type="button"
          disabled={busy || !input.trim()}
          onClick={() => act(bridge.marketplaces.add(input.trim()))}
          className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] text-ink hover:border-accent disabled:opacity-60"
        >
          <PackagePlus size={12} aria-hidden /> Add source
        </button>
      </div>

      {sources.map(source => (
        <div key={source.id} className="mt-2 rounded-xl border border-line bg-bg px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-line bg-card px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide text-muted">
              Claude Code marketplace
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink" title={source.url}>
              {source.marketplace} <span className="text-muted">· {source.id}</span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => act(bridge.marketplaces.refresh(source.id))}
              className="flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink disabled:opacity-60"
              title="Re-read this index from its repository — nothing reads it otherwise"
            >
              <RefreshCw size={11} aria-hidden /> Refresh
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => act(bridge.marketplaces.remove(source.id))}
              className="flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-warn disabled:opacity-60"
              title="Remove from the store's sources (installs inside Claude Code stay untouched)"
            >
              <Trash2 size={11} aria-hidden /> Remove
            </button>
          </div>

          {source.problem ? (
            <p className="mt-1 text-[11px] text-warn">{source.problem}</p>
          ) : (
            <p className="mt-0.5 text-[10.5px] text-muted">
              {source.plugins.length} plugin{source.plugins.length === 1 ? '' : 's'}
              {source.fetchedAt ? ` · index read ${source.fetchedAt.slice(0, 10)}` : ''}
            </p>
          )}

          <ul className="mt-1.5 flex flex-col gap-1">
            {source.plugins.map(plugin => (
              <li key={plugin.name} className="rounded-lg border border-line bg-card px-2.5 py-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 text-[12px] text-ink">
                    {plugin.name}
                    {plugin.author ? <span className="text-muted"> · {plugin.author}</span> : null}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { void card(source.id, plugin.name) }}
                    className="flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-[11px] text-ink hover:border-accent disabled:opacity-60"
                  >
                    <Terminal size={11} aria-hidden /> Install card
                  </button>
                </div>
                {plugin.description ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-muted">{plugin.description}</p>
                ) : null}
                {openCard === `${source.id}::${plugin.name}` ? (
                  <div className="mt-1.5 rounded-lg border border-line bg-bg p-2">
                    {lines.map((command, at) => (
                      <div key={command.line} className="flex flex-wrap items-center gap-2 py-0.5">
                        <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-ink">{command.line}</code>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => runLine(source.id, plugin.name, at)}
                          className="rounded-lg border border-accent/50 px-2 py-0.5 text-[11px] text-ink hover:bg-accent/10 disabled:opacity-60"
                          title={command.label}
                        >
                          Run this line
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="mt-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => { void card(source.id) }}
              className="flex items-center gap-1 rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink disabled:opacity-60"
            >
              <Terminal size={11} aria-hidden /> Show the register command
            </button>
            {openCard === `${source.id}::register` ? (
              <div className="mt-1 rounded-lg border border-line bg-bg p-2">
                {lines.map((command, at) => (
                  <div key={command.line} className="flex flex-wrap items-center gap-2 py-0.5">
                    <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-ink">{command.line}</code>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => runLine(source.id, undefined, at)}
                      className="rounded-lg border border-accent/50 px-2 py-0.5 text-[11px] text-ink hover:bg-accent/10 disabled:opacity-60"
                    >
                      Run this line
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ))}

      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card px-3 py-2">
        <span className="rounded-md border border-line bg-bg px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-wide text-muted">
          agy
        </span>
        <span className="min-w-0 flex-1 text-[11.5px] text-muted">
          Phase 3 waits on a catalog the agy CLI itself offers. Ask the installed one — its own help decides what
          this store will show.
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (busy) return
            setBusy(true)
            setAgyAnswer('')
            void bridge.marketplaces.agy()
              .then(reply => setAgyAnswer(reply.answer))
              .finally(() => setBusy(false))
          }}
          className="rounded-lg border border-line px-2.5 py-1 text-[11.5px] text-ink hover:border-accent disabled:opacity-60"
        >
          Ask the installed agy
        </button>
      </div>
      {agyAnswer ? <p className="mt-1 text-[11px] leading-relaxed text-muted">{agyAnswer}</p> : null}

      {answer ? (
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink" role="status">{answer}</p>
      ) : null}
    </section>
  )
}
