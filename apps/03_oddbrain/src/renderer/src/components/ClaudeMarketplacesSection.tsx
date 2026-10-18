import { useState } from 'react'
import { bridge } from '@/platform/bridge'
import type {
  ClaudeMarketplaceListing, ClaudeMarketplacePreview, ClaudePluginAction,
} from '@shared/lib/engineMarketplace'

/** The engine's catalogue, on the Store page next to OddBrain packs. Neither
 * opening Settings nor launching the app contacts a marketplace. A person
 * explicitly browses, adds a source and approves each command separately. */
export default function ClaudeMarketplacesSection() {
  const [state, setState] = useState<ClaudeMarketplaceListing | null>(null)
  const [source, setSource] = useState('')
  const [card, setCard] = useState<ClaudeMarketplacePreview | null>(null)
  const [declared, setDeclared] = useState<{ command: string; sha256: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState('')

  const browse = async (): Promise<void> => {
    setBusy(true)
    try {
      const next = await bridge.mods.claudeList()
      setState(next)
      if (!next.ok) setAnswer(next.reason)
    } catch (error) { setAnswer((error as Error).message) }
    finally { setBusy(false) }
  }

  const review = async (action: ClaudePluginAction, value: string): Promise<void> => {
    setAnswer('')
    setBusy(true)
    try {
      const next = await bridge.mods.claudePreview(action, value)
      if (!next.ok) setAnswer(next.reason)
      else { setDeclared(null); setCard(next) }
    } catch (error) { setAnswer((error as Error).message) }
    finally { setBusy(false) }
  }

  const run = async (): Promise<void> => {
    if (!card?.action || !card.value || !card.command || busy) return
    setBusy(true)
    try {
      const result = await bridge.mods.claudeExecute(card.action, card.value, card.command, declared?.sha256)
      if (result.needsCommand) {
        setDeclared({ command: result.needsCommand.command, sha256: result.needsCommand.sha256 })
        setCard({ ...card, command: result.needsCommand.confirmationLine })
        setAnswer('')
      } else {
        setAnswer(result.answer)
        setCard(null)
        setDeclared(null)
        if (result.ok) {
          if (card.action === 'add') setSource('')
          const listing = await bridge.mods.claudeList()
          setState(listing)
          if (!listing.ok) setAnswer(`${result.answer} Catalogue refresh failed: ${listing.reason}`)
        }
      }
    } catch (error) {
      setAnswer(`The CLI request failed: ${(error as Error).message}. Nothing was retried through another installer.`)
      setCard(null)
      setDeclared(null)
    } finally { setBusy(false) }
  }

  return (
    <section aria-label="Claude Code marketplaces" className="mt-5 border-t border-line pt-4">
      <h3 className="text-[14px] font-semibold text-ink">Claude Code marketplaces</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        Separate from OddBrain packs. Claude Code lists and installs its own plugins through its CLI.
        Only sources you add appear here. Browsing and refresh are manual; no plugins update on their own.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy} onClick={() => void browse()} aria-label="Browse Claude Code marketplaces"
          className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-ink hover:border-accent disabled:opacity-60">
          {state ? 'Refresh Claude Code catalogues' : 'Browse Claude Code catalogues'}
        </button>
        <span className="text-[11px] text-muted">Runs only if Claude Code 2.1.300 or newer is installed.</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input value={source} onChange={event => setSource(event.target.value)} maxLength={180}
          placeholder="GitHub owner/repo" aria-label="Claude Code marketplace repository"
          className="min-w-[210px] flex-1 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-[12px] text-ink" />
        <button type="button" disabled={busy || !source.trim()} onClick={() => void review('add', source.trim())}
          className="rounded-lg border border-line px-3 py-1.5 text-[12px] text-ink hover:border-accent disabled:opacity-60">
          Review source…
        </button>
      </div>
      <p className="mt-1 text-[11px] text-muted">Add a GitHub repository deliberately. The exact CLI command is shown before it runs; a repository is not an OddBrain-verified pack.</p>
      {answer ? <p role="status" className="mt-3 text-[12px] text-ink">{answer}</p> : null}
      {state?.ok ? (
        state.marketplaces.length ? <div className="mt-4 space-y-4">
          {state.marketplaces.map(marketplace => {
            const plugins = state.plugins.filter(plugin => plugin.marketplace === marketplace.name)
            return <section key={marketplace.name} aria-label={`Claude Code marketplace: ${marketplace.name}`} className="border-t border-line pt-3">
              <h4 className="text-[12.5px] font-medium text-ink">Claude Code marketplace · {marketplace.name}</h4>
              <p className="break-all text-[11px] text-muted">{marketplace.location || marketplace.source} · managed by Claude Code</p>
              {!plugins.length ? <p className="mt-2 text-[11.5px] text-muted">Claude Code lists no plugins from this source.</p> : (
                <ul className="mt-2 divide-y divide-line border-y border-line">
                  {plugins.map(plugin => <li key={plugin.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                    <div className="min-w-[190px] flex-1">
                      <p className="text-[12px] font-medium text-ink">{plugin.name} <span className="font-normal text-muted">{plugin.version ? `v${plugin.version} · ` : ''}{plugin.author || 'author not supplied'}</span></p>
                      {plugin.description ? <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{plugin.description}</p> : null}
                      <p className="mt-0.5 text-[10.5px] text-muted">{plugin.id} · {plugin.installed ? `${plugin.enabled ? 'installed' : 'installed, disabled'} (${plugin.scope})` : 'available'}</p>
                    </div>
                    <button type="button" disabled={busy || plugin.installed && plugin.scope !== 'user'} onClick={() => void review(plugin.installed ? 'update' : 'install', plugin.id)}
                      title={plugin.installed && plugin.scope !== 'user' ? 'Update this project-scoped plugin in its own project through the Claude Code CLI' : undefined}
                      aria-label={`${plugin.installed ? 'Review update for' : 'Review install of'} ${plugin.id}`}
                      className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[11.5px] text-ink hover:border-accent disabled:opacity-60">
                      {plugin.installed ? 'Review update…' : 'Review install…'}
                    </button>
                  </li>)}
                </ul>
              )}
            </section>
          })}
        </div> : <p className="mt-3 text-[12px] text-muted">Claude Code reports no marketplaces. Add a repository above when you choose one.</p>
      ) : null}
      {state?.ok && state.plugins.some(plugin => !state.marketplaces.some(marketplace => marketplace.name === plugin.marketplace)) ? (
        <p className="mt-2 text-[11.5px] text-muted">Claude Code also reports installed plugins whose original marketplace is no longer listed. Manage those through the CLI; their source cannot be verified here.</p>
      ) : null}
      <p className="mt-4 text-[11.5px] text-muted">agy: no verified marketplace command exists for its CLI. OddBrain does not invent one or install files on its behalf.</p>

      {card ? <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/55 px-4" onMouseDown={event => { if (event.target === event.currentTarget && !busy) { setCard(null); setDeclared(null) } }}>
        <div role="dialog" aria-modal="true" aria-label="Review Claude Code marketplace command" onKeyDown={event => { if (event.key === 'Escape' && !busy) { setCard(null); setDeclared(null) } }}
          className="w-full max-w-[540px] rounded-xl border border-line bg-card p-5 text-ink shadow-xl">
          <h4 className="text-[16px] font-semibold">{declared ? 'Approve the plugin’s install command?' : `Approve ${card.action === 'add' ? 'marketplace source' : card.action === 'update' ? 'plugin update' : 'plugin install'}?`}</h4>
          <p className="mt-2 break-all text-[12px]">Source: {card.source}</p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">{declared
            ? 'This marketplace declared a command that may run as your Windows user. Claude Code refused to proceed without a second approval; inspect the command and its source first. A changed catalogue or command will be refused by the CLI.'
            : card.warning}</p>
          {declared ? <>
            <p className="mt-3 text-[11px] text-muted">Command declared by the marketplace (not written by OddBrain):</p>
            <pre className="mt-1 max-h-36 overflow-auto whitespace-pre-wrap break-all rounded-md border border-line bg-panel p-2 text-[11px]">{declared.command}</pre>
            <p className="mt-2 break-all font-mono text-[10px] text-muted">sha256 {declared.sha256}</p>
          </> : null}
          <p className="mt-3 text-[11px] text-muted">The exact CLI call OddBrain will make:</p>
          <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-md border border-line bg-panel p-2 text-[11px]">{card.command}</pre>
          <p className="mt-2 text-[11px] text-muted">{declared ? 'The marketplace-declared command has not been approved. Cancel to keep it from running.' : 'Nothing has been run for this card yet. You can cancel.'}</p>
          <div className="mt-4 flex flex-wrap justify-end gap-3 text-[12px]">
            <button type="button" autoFocus disabled={busy} onClick={() => { setCard(null); setDeclared(null) }} className="text-muted hover:text-ink disabled:opacity-60">Cancel</button>
            <button type="button" disabled={busy} onClick={() => void run()} className="rounded-lg border border-line px-3 py-1.5 text-ink hover:border-accent disabled:opacity-60">
              {busy ? 'Claude Code is working…' : declared ? 'Approve this command' : 'Run this CLI command'}
            </button>
          </div>
        </div>
      </div> : null}
    </section>
  )
}
