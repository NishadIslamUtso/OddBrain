import { useEffect, useRef, useState } from 'react'
import { bridge } from '@/platform/bridge'
import type { ArtifactKind } from '../../../main/artifacts/store'

/**
 * A card-sized picture of an artifact.
 *
 * Two decisions worth stating, because both are about the 4 GB machine this app
 * is first built for:
 *
 *   1. **Nothing runs.** The document is rendered in an iframe with no script
 *      permission at all, so a grid of twenty cards is twenty still pictures,
 *      not twenty live pages competing for memory. It also means a thumbnail
 *      cannot reach the network, whatever the document says. The full, working
 *      document is one click away in the preview pane.
 *   2. **Nothing loads until it is nearly on screen.** A card that has never
 *      been looked at has read nothing from disk. The document files themselves
 *      live outside the app bundle, so the grid could otherwise pull megabytes
 *      of HTML the person will never scroll to.
 *
 * The page is drawn at 640px wide — a normal laptop width, not a huge canvas —
 * and scaled down, which is why a thumbnail looks like the real page rather than
 * a squeezed version of it, and why a small centered widget does not float in a
 * field of white.
 */

const VIRTUAL_WIDTH = 640
const VIRTUAL_HEIGHT = 440

/** An SVG on its own is a drawing, not a page; centre it on a plain sheet. */
function documentFor(content: string, type: ArtifactKind): string {
  if (type !== 'svg') return content
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;background:#ffffff}body{display:grid;place-items:center}svg{display:block;width:92%;height:92%;max-width:100%;max-height:100%}</style></head><body>${content}</body></html>`
}

export default function ArtifactThumb({ id, type }: { id: string; type: ArtifactKind }) {
  const box = useRef<HTMLDivElement | null>(null)
  const [near, setNear] = useState(false)
  const [content, setContent] = useState('')
  const [problem, setProblem] = useState('')
  const [width, setWidth] = useState(0)

  // Read the document only when the card is nearly on screen.
  useEffect(() => {
    const element = box.current
    if (!element || near) return
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setNear(true)
          observer.disconnect()
        }
      },
      { rootMargin: '240px' }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [near])

  useEffect(() => {
    if (!near) return
    let alive = true
    void bridge.artifacts.read(id).then(answer => {
      if (!alive) return
      if (answer.ok) setContent(answer.content)
      else setProblem(answer.error)
    })
    return () => {
      alive = false
    }
  }, [near, id])

  // The scale is the card's real width against the page's own width, so the
  // whole design fits instead of having its right-hand third cropped away.
  useEffect(() => {
    const element = box.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const measure = (): void => setWidth(element.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const scale = width ? width / VIRTUAL_WIDTH : 0
  const height = scale ? Math.round(VIRTUAL_HEIGHT * scale) : 160

  return (
    <div
      ref={box}
      className="relative overflow-hidden rounded-lg border border-line bg-white"
      style={{ height }}
      aria-hidden="true"
    >
      {problem ? (
        <p className="absolute inset-0 flex items-center justify-center bg-card p-3 text-center text-[11px] leading-relaxed text-muted">
          {problem}
        </p>
      ) : !content || !scale ? (
        <span className="absolute inset-0 flex items-center justify-center bg-card text-[11px] text-muted">
          Reading…
        </span>
      ) : (
        <iframe
          title=""
          tabIndex={-1}
          // No `allow-scripts`: a thumbnail is a picture of the document, and a
          // picture cannot run anything.
          sandbox=""
          srcDoc={documentFor(content, type)}
          scrolling="no"
          className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
          style={{ width: VIRTUAL_WIDTH, height: VIRTUAL_HEIGHT, transform: `scale(${scale})` }}
        />
      )}
    </div>
  )
}
