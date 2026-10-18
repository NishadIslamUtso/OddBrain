import { useEffect, useState } from 'react'
import type { Marketplace, MarketplaceAction, MarketplacePlan } from '@shared/lib/marketplace'
import { displayCommandLine } from '@shared/lib/commandLine'
import type { Appearance } from '../state/appearance'
import { bridge, getEngineApi, isDemo } from '../platform/bridge'
import ModsSection from './ModsSection'
import { trapDialogFocus } from '../ui/focus'

function ClaudeMarket() {
  const [sources, setSources] = useState<string[]>([]), [repo, setRepo] = useState(''), [query, setQuery] = useState('')
  const [catalog, setCatalog] = useState<Marketplace | null>(null), [plan, setPlan] = useState<MarketplacePlan | null>(null)
  const [note, setNote] = useState(''), [installed, setInstalled] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { void bridge.marketplace.sources().then(setSources).catch(() => setNote('Saved sources could not be read.')); return () => { void bridge.marketplace.cancel() } }, [])
  const browse = async (): Promise<void> => {
    setBusy(true); setPlan(null); setNote('')
    try { const result = await bridge.marketplace.browse(repo.trim()); if (!result.ok) throw Error(result.error); setCatalog(result.value); setSources(await bridge.marketplace.sources()) }
    catch (error) { setNote((error as Error).message) } finally { setBusy(false) }
  }
  const prepare = async (action: MarketplaceAction, plugin?: string): Promise<void> => {
    if (!catalog) return
    setBusy(true)
    try { const result = await bridge.marketplace.plan(catalog.repo, action, plugin); if (!result.ok) throw Error(result.error); setPlan(result.value) }
    catch (error) { setNote((error as Error).message) } finally { setBusy(false) }
  }
  const confirm = async (): Promise<void> => {
    if (!plan) return
    const token = plan.token; setPlan(null); setBusy(true)
    try { const result = await bridge.marketplace.confirm(token); setNote(result.ok ? result.value : result.error) }
    catch (error) { setNote((error as Error).message) } finally { setBusy(false) }
  }
  return <section className="space-y-4" aria-label="Claude Code marketplaces">
    <h3>Claude Code marketplaces</h3><p className="ob-control-scope">Browse reads a public GitHub catalog. Installation and changes use your installed Claude Code CLI after you review the exact command. Sources are never refreshed at launch.</p>
    <div className="ob-form-line"><input aria-label="Marketplace repository" placeholder="owner/repository" list="marketplace-sources" value={repo} onChange={e => setRepo(e.target.value)} /><datalist id="marketplace-sources">{sources.map(s => <option key={s} value={s} />)}</datalist><button type="button" disabled={busy || isDemo || !repo.trim()} onClick={() => void browse()}>Browse / refresh</button></div>
    <div className="ob-inline-actions"><button type="button" disabled={busy || isDemo} onClick={async () => { setBusy(true); try { const r = await bridge.marketplace.probe(); setNote(r.ok ? r.value : r.error) } catch (e) { setNote(String(e)) } finally { setBusy(false) } }}>Check installed CLI</button><button type="button" disabled={busy || isDemo} onClick={async () => { setBusy(true); try { const r = await bridge.marketplace.installed(); if (r.ok) setInstalled(r.value); else setNote(r.error) } catch (e) { setNote(String(e)) } finally { setBusy(false) } }}>Read installed plugins</button>{busy ? <button type="button" onClick={() => void bridge.marketplace.cancel()}>Cancel operation</button> : null}</div>
    {installed ? <details><summary>Engine-reported installed plugins</summary><pre className="whitespace-pre-wrap break-all text-[12px]">{installed}</pre></details> : null}
    {catalog ? <><header><h3>{catalog.name}</h3><p className="ob-control-scope">Claude Code marketplace · {catalog.repo}</p><button type="button" disabled={busy} onClick={() => void prepare('add')}>Review adding source to Claude Code</button></header><input aria-label="Filter marketplace plugins" placeholder="Filter plugins" value={query} onChange={e => setQuery(e.target.value)} /><ul className="divide-y divide-line">{catalog.plugins.filter(p => `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase())).map(p => <li key={p.name} className="py-3"><h4>{p.name}</h4><p className="ob-control-scope">{p.description}</p><p className="ob-control-scope">Author: {p.author} · Source: {catalog.repo}</p><div className="ob-inline-actions">{(['install', 'update', 'enable', 'disable', 'uninstall'] as const).map(action => <button type="button" key={action} disabled={busy} onClick={() => void prepare(action, p.name)}>Review {action}</button>)}</div></li>)}</ul></> : null}
    {note ? <p role="status" className="whitespace-pre-wrap break-words text-[12px]">{note}</p> : null}
    {isDemo ? <p className="ob-control-scope">CLI operations and catalog requests require the desktop app.</p> : null}
    {plan ? <div className="ob-modal-backdrop"><section role="dialog" aria-modal="true" aria-label="Approve marketplace command" className="ob-appearance-dialog" onKeyDown={event => { trapDialogFocus(event); if (event.key === 'Escape') { setPlan(null); void bridge.marketplace.cancel() } }}><h3>Run this engine command?</h3><pre className="whitespace-pre-wrap break-all">{displayCommandLine(plan.command)}</pre><p className="ob-control-scope">{plan.explanation}</p><p className="ob-control-scope">This approval expires after one minute. Engine-declared helper commands are not auto-approved; if the CLI requests one, review it in its own terminal.</p><div className="ob-inline-actions"><button type="button" onClick={() => void confirm()}>Allow command</button><button type="button" autoFocus onClick={() => { setPlan(null); void bridge.marketplace.cancel() }}>Deny</button></div></section></div> : null}
  </section>
}
export default function ExtensionsSection(props: { appearance: Appearance; onAppearanceChange(value: Appearance): void }) {
  const [source, setSource] = useState('packs'), [agy, setAgy] = useState('')
  return <div className="space-y-4"><label className="ob-form-line">Source <select aria-label="Plugin source" value={source} onChange={e => setSource(e.target.value)}><option value="packs">OddBrain packs</option><option value="claude">Claude Code marketplaces</option><option value="agy">agy</option></select></label>
    {source === 'packs' ? <ModsSection {...props} /> : source === 'claude' ? <ClaudeMarket /> : <section><h3>agy catalog</h3><p className="ob-control-scope">No verified agy catalog/install adapter is configured. OddBrain will not guess an endpoint or execute invented install commands. Your agy engine and executable picker remain available in Connectors.</p><button type="button" disabled={isDemo} onClick={() => void getEngineApi().detect(true).then(list => { const found = list.find(v => v.id === 'agy'); setAgy(found?.found ? 'agy was found. Catalog installation is still unavailable through this adapter.' : 'agy was not detected. Choose its executable in Connectors.') }).catch(e => setAgy(String(e)))}>Check agy installation</button>{agy ? <p role="status">{agy}</p> : null}</section>}
  </div>
}
