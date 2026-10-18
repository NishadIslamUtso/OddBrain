import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import type { VaultReply } from '../../../shared/desktop'
import { buildGraph, newCamera } from '../lib/graphScene'
import { mountGraph } from '../lib/graphCanvas'
import { resolveNoteLinks } from '../lib/links'
import { DEFAULT_GRAPH, GRAPH_KEY, normalizeGraph, type GraphPreferences } from '../state/graph'

function readPreferences(): GraphPreferences {
  try {
    return normalizeGraph(JSON.parse(localStorage.getItem(GRAPH_KEY) || 'null'))
  } catch {
    return { ...DEFAULT_GRAPH }
  }
}
export function BrainScreen({
  vault,
  choose,
  desktop,
}: {
  vault: VaultReply
  choose: () => Promise<void>
  desktop: boolean
}) {
  const [prefs, setPrefs] = useState(readPreferences)
  const [selected, setSelected] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const controller = useRef<ReturnType<typeof mountGraph>>(null)
  const camera = useRef(newCamera())
  const files = vault.ok ? vault.files : []
  const links = useMemo(() => resolveNoteLinks(files), [files])
  const scene = useMemo(
    () =>
      buildGraph(
        links.edges,
        files.map((file) => file.path),
        prefs,
      ),
    [files, links, prefs],
  )
  const options = useRef({
    prefs,
    selected,
    allowMotion: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    onSelect: setSelected,
  })
  options.current = {
    prefs,
    selected,
    allowMotion: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    onSelect: setSelected,
  }
  useEffect(() => {
    if (!canvas.current || !scene.names.length) return
    controller.current = mountGraph(canvas.current, scene, camera.current, () => options.current)
    return () => {
      controller.current?.dispose()
      controller.current = null
    }
  }, [scene])
  useEffect(() => {
    controller.current?.refresh()
  }, [prefs, selected])
  const update = (patch: Partial<GraphPreferences>): void => {
    const next = normalizeGraph({ ...prefs, ...patch })
    setPrefs(next)
    try {
      localStorage.setItem(GRAPH_KEY, JSON.stringify(next))
    } catch {
      /* This preference is optional; canvas still works. */
    }
  }
  const selectedFile = files.find((file) => file.path === selected)
  return (
    <section className="scroll-screen" aria-label="Brain graph" data-find-scroll>
      <div className="brain-page">
        <div className="screen-heading">
          <div>
            <h1>
              Brain <small>{vault.ok ? vault.folder : ''}</small>
            </h1>
            <p>Only resolved links between notes are drawn. No inferred connections.</p>
          </div>
        </div>
        {vault.ok ? (
          <>
            <div className="graph-stats">
              <div>
                <strong>{files.length}</strong>
                <span>readable notes</span>
              </div>
              <div>
                <strong>{links.checked}</strong>
                <span>links checked</span>
              </div>
              <div>
                <strong>{links.edges.length}</strong>
                <span>edges drawn</span>
              </div>
              <div>
                <strong>
                  {links.dead} / {links.ambiguous}
                </strong>
                <span>dead / ambiguous</span>
              </div>
            </div>
            <div className="graph-toolbar">
              <label>
                View{' '}
                <select
                  aria-label="Graph mode"
                  value={prefs.mode}
                  onChange={(event) => update({ mode: event.target.value as '2d' | '3d' })}
                >
                  <option value="3d">3D</option>
                  <option value="2d">2D</option>
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={prefs.showOrphans}
                  onChange={(event) => update({ showOrphans: event.target.checked })}
                />{' '}
                Show notes without links
              </label>
              <button
                type="button"
                className="icon-button"
                aria-label="Reset graph"
                onClick={() => controller.current?.reset()}
              >
                <RotateCcw size={15} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Zoom out"
                onClick={() => controller.current?.zoom(1 / 1.2)}
              >
                <ZoomOut size={16} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Zoom in"
                onClick={() => controller.current?.zoom(1.2)}
              >
                <ZoomIn size={16} />
              </button>
            </div>
            <div className="graph-stage">
              {scene.names.length ? (
                <canvas
                  ref={canvas}
                  tabIndex={0}
                  role="img"
                  aria-label={`Graph of ${scene.names.length} notes and ${scene.edges.length} resolved links`}
                />
              ) : (
                <div className="inspector-empty">No notes to draw.</div>
              )}
            </div>
            {selectedFile ? (
              <div className="graph-selection">
                <strong>{selectedFile.path}</strong>
                <p>{selectedFile.content.slice(0, 600)}</p>
              </div>
            ) : null}
            <p className="quiet graph-hint">
              Drag to rotate, scroll to zoom, or use the keyboard. Dead and ambiguous links are counted, not
              drawn.
            </p>
          </>
        ) : (
          <div className="empty-card">
            <h2>Connect your notes first.</h2>
            <p>{vault.error}</p>
            <button
              className="outline-button"
              type="button"
              disabled={!desktop}
              onClick={() => void choose()}
            >
              Choose a folder
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
