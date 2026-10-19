import { useEffect, useRef, useState } from 'react'
import {
  AGY_MARKETPLACE,
  KNOWN_MARKETPLACES,
  installedPluginSummaries,
  type StoreEngine,
  type Marketplace,
  type MarketplaceAction,
  type MarketplacePlan,
} from '@shared/lib/marketplace'
import { displayCommandLine } from '@shared/lib/commandLine'
import { bridge, isDemo } from '../platform/bridge'
import { trapDialogFocus } from '../ui/focus'

export default function EngineMarketplace({
  engine,
  focus = 'plugins',
}: {
  engine: StoreEngine
  focus?: 'plugins' | 'skills' | 'connectors'
}) {
  const [sources, setSources] = useState<string[]>([]),
    [repo, setRepo] = useState(engine === 'agy' ? AGY_MARKETPLACE : ''),
    [query, setQuery] = useState('')
  const [catalog, setCatalog] = useState<Marketplace | null>(null),
    [plan, setPlan] = useState<MarketplacePlan | null>(null)
  const [note, setNote] = useState(''),
    [installed, setInstalled] = useState(''),
    [busy, setBusy] = useState(false)
  const mounted = useRef(true)
  const cancel = () => {
    void bridge.marketplace.cancel(engine).catch(() => {
      if (mounted.current) setNote('Cancellation could not be confirmed. Read installed plugins before retrying.')
    })
  }
  useEffect(() => {
    mounted.current = true
    void bridge.marketplace
      .sources(engine)
      .then(setSources)
      .catch(() => setNote('Saved sources could not be read.'))
    return () => {
      mounted.current = false
      cancel()
    }
  }, [engine])
  const browse = async (): Promise<void> => {
    setBusy(true)
    setPlan(null)
    setCatalog(null)
    setNote('')
    try {
      const result = await bridge.marketplace.browse(repo.trim(), engine)
      if (!result.ok) throw Error(result.error)
      setCatalog(result.value)
      setSources(await bridge.marketplace.sources(engine))
    } catch (error) {
      setNote((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const prepare = async (action: MarketplaceAction, plugin?: string): Promise<void> => {
    if (!catalog && engine !== 'agy') return
    setBusy(true)
    setPlan(null)
    setNote('')
    try {
      const result = await bridge.marketplace.plan(catalog?.repo || AGY_MARKETPLACE, action, plugin, engine)
      if (!result.ok) throw Error(result.error)
      setPlan(result.value)
    } catch (error) {
      setNote((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const confirm = async (): Promise<void> => {
    if (!plan) return
    const token = plan.token
    setPlan(null)
    setBusy(true)
    try {
      const result = await bridge.marketplace.confirm(token, engine)
      setNote(result.ok ? result.value : result.error)
    } catch (error) {
      setNote((error as Error).message)
    } finally {
      if (!mounted.current) return
      try {
        const r = await bridge.marketplace.installed(engine)
        if (r.ok) setInstalled(r.value)
        else setInstalled('Installed state could not be refreshed. Read it again before retrying.')
      } catch {
        setInstalled('Installed state could not be refreshed. Read it again before retrying.')
      }
      setBusy(false)
    }
  }
  const agy = engine === 'agy'
  const label = agy ? 'agy' : 'Claude Code'
  const installedRows = installedPluginSummaries(installed)
  const actions: MarketplaceAction[] = agy
    ? ['install', 'enable', 'disable', 'uninstall']
    : ['install', 'update', 'enable', 'disable', 'uninstall']
  return (
    <section className="space-y-4" aria-label={`${label} marketplaces`}>
      <h3>{label} marketplaces</h3>
      <p className="ob-control-scope">
        {agy
          ? 'Browse reads the official Antigravity catalog, or a labelled copy from agy’s cache when offline.'
          : 'Browse reads a public GitHub catalog.'}{' '}
        Installation and changes use your installed {label} CLI after you review the exact command. Sources are never
        refreshed at launch.
      </p>
      {focus !== 'plugins' ? (
        <p className="ob-control-scope">
          {focus === 'skills' ? 'Skills' : 'Connectors'} can be included in these engine packages. Browse the engine’s
          packages here; installing adds the whole package, which may also contain hooks, agents and rules. Catalog
          descriptions are supplied by publishers; installed details come from the engine.
        </p>
      ) : null}
      {!agy ? (
        <p className="ob-control-scope">
          Known public catalogs:{' '}
          {KNOWN_MARKETPLACES.map((source) => (
            <button
              type="button"
              key={source.repo}
              className="ob-small-button mr-1.5"
              disabled={busy}
              onClick={() => setRepo(source.repo)}
            >
              {source.label}
            </button>
          ))}
        </p>
      ) : (
        <p className="ob-control-scope">Official source: {AGY_MARKETPLACE}</p>
      )}
      <div className="ob-form-line">
        {!agy ? (
          <input
            aria-label="Marketplace repository"
            placeholder="owner/repository"
            list="marketplace-sources"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
          />
        ) : null}
        <datalist id="marketplace-sources">
          {sources.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button type="button" disabled={busy || isDemo || !repo.trim()} onClick={() => void browse()}>
          Browse / refresh
        </button>
      </div>
      <div className="ob-inline-actions">
        <button
          type="button"
          disabled={busy || isDemo}
          onClick={async () => {
            setBusy(true)
            try {
              const r = await bridge.marketplace.probe(engine)
              setNote(r.ok ? r.value : r.error)
            } catch (e) {
              setNote(String(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          Check installed CLI
        </button>
        <button
          type="button"
          disabled={busy || isDemo}
          onClick={async () => {
            setBusy(true)
            setInstalled('')
            setNote('')
            try {
              const r = await bridge.marketplace.installed(engine)
              if (r.ok) setInstalled(r.value)
              else setNote(r.error)
            } catch (e) {
              setNote(String(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          Read installed plugins
        </button>
        {busy ? (
          <button type="button" onClick={cancel}>
            Cancel operation
          </button>
        ) : null}
      </div>
      {installedRows.length ? (
        <section aria-label="Installed packages">
          <h4>Installed in {label}</h4>
          <ul className="divide-y divide-line">
            {installedRows.map((p, index) => (
              <li className="py-3" key={`${p.name}-${p.source}-${index}`}>
                <strong>{p.name}</strong>
                <p className="ob-control-scope">
                  {p.enabled === undefined ? 'Enablement not reported' : p.enabled ? 'Enabled' : 'Disabled'}
                  {p.version ? ` · ${p.version}` : ''} · {p.source || 'Source not reported'}
                </p>
                {p.skills.length ? <p className="ob-control-scope">Skills: {p.skills.join(', ')}</p> : null}
                {p.connectors.length ? <p className="ob-control-scope">Connectors: {p.connectors.join(', ')}</p> : null}
                {agy && p.source === AGY_MARKETPLACE ? (
                  <div className="ob-inline-actions">
                    {(['enable', 'disable', 'uninstall'] as const).map((action) => (
                      <button type="button" key={action} disabled={busy} onClick={() => void prepare(action, p.name)}>
                        Review {action}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="ob-control-scope">
            Installed or enabled does not confirm connector sign-in or connection health.
          </p>
        </section>
      ) : null}
      {installed ? (
        <details>
          <summary>Engine-reported installed plugins</summary>
          <pre className="whitespace-pre-wrap break-all text-[12px]">{installed}</pre>
        </details>
      ) : null}
      {catalog ? (
        <>
          <header>
            <h3>{catalog.name}</h3>
            <p className="ob-control-scope">
              {label} marketplace · {catalog.repo}
            </p>
            {catalog.notice ? <p className="ob-control-scope">{catalog.notice}</p> : null}
            {!agy ? (
              <button type="button" disabled={busy} onClick={() => void prepare('add')}>
                Review adding source to Claude Code
              </button>
            ) : null}
          </header>
          <input
            aria-label="Filter marketplace plugins"
            placeholder="Filter plugins"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="divide-y divide-line">
            {catalog.plugins
              .filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase()))
              .map((p) => (
                <li key={p.name} className="py-3">
                  <h4>{p.name}</h4>
                  <p className="ob-control-scope">{p.description}</p>
                  <p className="ob-control-scope">
                    Author: {p.author} · Source: {catalog.repo}
                  </p>
                  <div className="ob-inline-actions">
                    {actions.map((action) => (
                      <button type="button" key={action} disabled={busy} onClick={() => void prepare(action, p.name)}>
                        Review {action}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
          </ul>
          {!catalog.plugins.some((p) => `${p.name} ${p.description}`.toLowerCase().includes(query.toLowerCase())) ? (
            <p className="ob-control-scope">No packages match this search.</p>
          ) : null}
        </>
      ) : null}
      {note ? (
        <p role="status" className="whitespace-pre-wrap break-words text-[12px]">
          {note}
        </p>
      ) : null}
      {isDemo ? <p className="ob-control-scope">CLI operations and catalog requests require the desktop app.</p> : null}
      {plan ? (
        <div className="ob-modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Approve marketplace command"
            className="ob-appearance-dialog"
            onKeyDown={(event) => {
              trapDialogFocus(event)
              if (event.key === 'Escape') {
                setPlan(null)
                cancel()
              }
            }}
          >
            <h3>Run this engine command?</h3>
            <pre className="whitespace-pre-wrap break-all">{displayCommandLine(plan.command)}</pre>
            <p className="ob-control-scope">{plan.explanation}</p>
            <p className="ob-control-scope">
              This approval expires after one minute. Engine-declared helper commands are not auto-approved; if the CLI
              requests one, review it in its own terminal.
            </p>
            <div className="ob-inline-actions">
              <button type="button" onClick={() => void confirm()}>
                Allow command
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setPlan(null)
                  cancel()
                }}
              >
                Deny
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  )
}
