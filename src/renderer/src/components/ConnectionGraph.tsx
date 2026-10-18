import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { bridge } from '../platform/bridge'
import { vaultGet } from '@shared/lib/vault'
import usePersistentState from '../hooks/usePersistentState'
import { DEFAULT_GRAPH, GRAPH_KEY, normalizeGraph } from '../state/graph'
import { buildGraph, newCamera } from '../lib/graphScene'
import { mountGraph, type GraphRenderOptions } from '../lib/graphCanvas'
import { getMotionMode, subscribeMotionMode } from '../motion/motionMode'
import { useLook } from '../ui/LookContext'
import { Mascot } from '../motion/Mascot'
import GraphAppearance from './GraphAppearance'

export default function ConnectionGraph({ path, isDemo, variant = 'card' }: { path: string; isDemo: boolean; variant?: 'card' | 'full' }) {
  const [warning, setWarning] = useState('')
  const [prefs, setPrefs] = usePersistentState(GRAPH_KEY, DEFAULT_GRAPH, normalizeGraph, setWarning)
  const [data, setData] = useState<Awaited<ReturnType<typeof bridge.structure.linkCheck>> | null>(null)
  const [files, setFiles] = useState<string[]>([]), [sourceNote, setSourceNote] = useState(''), [error, setError] = useState('')
  const [revision, setRevision] = useState(0), [loading, setLoading] = useState(false), [appearance, setAppearance] = useState(false)
  const [selected, setSelected] = useState(''), [query, setQuery] = useState(''), [preview, setPreview] = useState<{ path: string; text: string; loading?: boolean } | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null), camera = useRef(newCamera()), controller = useRef<ReturnType<typeof mountGraph>>(null), readTicket = useRef(0)
  const helpId = useId(), panelId = useId()
  const motion = useSyncExternalStore(subscribeMotionMode, getMotionMode), look = useLook()
  const allowMotion = !motion.osReduced && motion.mode !== 'still' && !motion.paused && !look.paused
  useEffect(() => {
    let live = true
    setData(null); setFiles([]); setError(''); setSourceNote(''); setSelected(''); setPreview(null); readTicket.current++
    if (isDemo || !path) { setLoading(false); return }
    setLoading(true)
    Promise.all([bridge.structure.linkCheck(), vaultGet('/files').catch(() => null)]).then(([links, tree]) => {
      if (!live) return
      if (links.error) { setError(links.error); return }
      setData(links)
      if (tree?.ok && Array.isArray(tree.files)) { setFiles(tree.files.filter((file: unknown): file is string => typeof file === 'string')); if (tree.capped) setSourceNote('The vault file listing is capped; some unlinked notes may be missing.') }
      else setSourceNote('Unlinked notes could not be loaded. Showing resolved link endpoints only.')
    }).catch(reason => { if (live) setError(reason instanceof Error ? reason.message : 'Connections could not be read.') }).finally(() => { if (live) setLoading(false) })
    return () => { live = false; readTicket.current++ }
  }, [path, isDemo, revision])
  const scene = useMemo(() => buildGraph(data?.edges ?? [], files, prefs), [data, files, prefs.mode, prefs.spacing, prefs.repulsion, prefs.maxNodes, prefs.showOrphans])
  const select = (name: string): void => { readTicket.current++; setSelected(name); setPreview(null) }
  const options = useRef<GraphRenderOptions>({ prefs, selected, allowMotion, onSelect: select })
  options.current = { prefs, selected, allowMotion, onSelect: select }
  useEffect(() => {
    if (!canvas.current || !scene.names.length) return
    const view = mountGraph(canvas.current, scene, camera.current, () => options.current)
    controller.current = view
    if (!view) setError('Canvas drawing is unavailable in this window.')
    return () => { view?.dispose(); controller.current = null }
  }, [scene])
  useEffect(() => { controller.current?.refresh() }, [prefs, selected, allowMotion])
  useEffect(() => { if (selected && !scene.names.includes(selected)) select('') }, [scene, selected])
  const readNote = async (): Promise<void> => {
    const name = selected, ticket = ++readTicket.current
    setPreview({ path: name, text: '', loading: true })
    try {
      const reply = await vaultGet(`/file?path=${encodeURIComponent(name)}`)
      if (ticket !== readTicket.current) return
      if (!reply?.ok) throw Error(String(reply?.error || 'This note could not be read.'))
      setPreview({ path: name, text: `${String(reply.content || '').slice(0, 40000)}${reply.truncated || String(reply.content || '').length > 40000 ? '\n\n[Preview truncated]' : ''}` })
    } catch (reason) { if (ticket === readTicket.current) setPreview({ path: name, text: reason instanceof Error ? reason.message : 'This note could not be read.' }) }
  }
  const matches = scene.names.filter(name => name.toLowerCase().includes(query.trim().toLowerCase()))
  return <section className={`ob-graph ob-graph--${variant}`} aria-label="Vault connections">
    <div className="ob-graph-toolbar">
      <div className="ob-graph-modes" aria-label="Graph dimensions">{(['3d', '2d'] as const).map(mode => <button key={mode} type="button" aria-pressed={prefs.mode === mode} onClick={() => { setPrefs({ ...prefs, mode }); controller.current?.reset() }}>{mode.toUpperCase()}</button>)}</div>
      <button type="button" aria-label="Zoom in" disabled={!scene.names.length} onClick={() => controller.current?.zoom(1.2)}>+</button><button type="button" aria-label="Zoom out" disabled={!scene.names.length} onClick={() => controller.current?.zoom(1 / 1.2)}>−</button><button type="button" disabled={!scene.names.length} onClick={() => controller.current?.reset()}>Fit view</button>
      <button type="button" disabled={loading || isDemo || !path} onClick={() => setRevision(n => n + 1)}>Refresh</button>
      <button type="button" aria-expanded={appearance} aria-controls={panelId} onClick={() => setAppearance(!appearance)}>Appearance</button>
      <details className="ob-graph-help"><summary>Controls</summary><p id={helpId}>Drag to orbit in 3D or pan in 2D. Shift-drag pans. Scroll or +/− to zoom. Arrow keys move the view; Home fits it. Select a node or choose a note below.</p></details>
    </div>
    <div className="ob-graph-body"><div className="ob-graph-stage">
      {scene.names.length ? <canvas ref={canvas} tabIndex={0} aria-label={`${prefs.mode.toUpperCase()} graph of vault connections`} aria-describedby={helpId} /> : <div className="ob-screen-empty"><Mascot motion={loading ? 'flashlight-search' : 'branch-merge'} size={80} static={!loading} /><p role="status">{isDemo ? 'Vault connections are available in the desktop app.' : !path ? 'Choose a vault folder to see its connections.' : loading ? 'Reading vault connections…' : error || 'No notes to show with these filters.'}</p></div>}
    </div>{appearance && <div id={panelId}><GraphAppearance value={prefs} onChange={setPrefs} /></div>}</div>
    <footer className="ob-graph-footer">
      {error && scene.names.length > 0 && <p role="status">{error}</p>}
      {data && <p>{scene.names.length} of {scene.total} notes · {scene.edges.length} connections{scene.total > scene.names.length ? ' · Most-connected notes shown first' : ''}{data.dead.length || data.ambiguous.length ? ` · ${data.dead.length} unresolved, ${data.ambiguous.length} ambiguous links (not drawn)` : ''}</p>}
      {data && <details><summary>Link details</summary><p>{data.files} files scanned · {data.checked} links checked. Repeated and reciprocal links share one connection. Self-links are not drawn.</p></details>}
      {sourceNote && <p>{sourceNote}</p>}{warning && <p role="status">{warning}</p>}
      {scene.names.length > 0 && <div className="ob-graph-picker"><input type="search" aria-label="Find graph note" placeholder="Find a note…" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Select graph note" value={selected} onChange={e => select(e.target.value)}><option value="">{matches.length ? 'Select a note' : 'No matching notes'}</option>{selected && !matches.includes(selected) && <option value={selected}>{selected}</option>}{matches.map(name => <option key={name} value={name}>{name}</option>)}</select>{selected && <><button type="button" onClick={() => void readNote()}>Read note</button><button type="button" onClick={() => select('')}>Clear</button></>}</div>}
      {selected && <p className="ob-graph-selection">{selected} · {scene.degrees[scene.names.indexOf(selected)] ?? 0} connected notes</p>}
      {preview?.path === selected && <pre className="ob-graph-note" aria-live="polite">{preview.loading ? 'Reading note…' : preview.text || '(Empty note)'}</pre>}
    </footer>
  </section>
}
