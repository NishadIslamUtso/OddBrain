/**
 * Find in the conversation — Ctrl+F.
 *
 * Learned from Claude Desktop's dedicated find-in-page window, rebuilt as an
 * in-app overlay that never mutates the React tree: matches are marked with
 * the CSS Custom Highlight API (ranges, not nodes), so React never sees a
 * foreign `<mark>` and the transcript cannot be corrupted by a search.
 * Escape closes; Enter and Shift+Enter walk the matches.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

type FindRange = globalThis.Range

/** Collect the text ranges of `query` inside `root`, reading order. */
export function findRanges(root: Node, query: string): FindRange[] {
  if (!query.trim()) return []
  const needle = query.toLowerCase()
  const ranges: FindRange[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const texts: Text[] = []
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    // Script/style payloads inside the transcript would be found by nobody reading.
    const parent = node.parentElement
    if (parent && (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE')) continue
    texts.push(node)
  }
  for (const node of texts) {
    const hay = node.data.toLowerCase()
    let at = hay.indexOf(needle)
    while (at !== -1) {
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + needle.length)
      ranges.push(range)
      at = hay.indexOf(needle, at + needle.length)
    }
  }
  return ranges
}

/** Paint the ranges; the current match gets its own, brighter highlight. */
function paint(ranges: FindRange[], current: number): void {
  const highlights = CSS.highlights
  if (!highlights) return
  highlights.delete('ob-find')
  highlights.delete('ob-find-current')
  if (!ranges.length) return
  const all = new Highlight(...ranges)
  const one = new Highlight(ranges[current])
  highlights.set('ob-find', all)
  highlights.set('ob-find-current', one)
}

export default function FindBar(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [ranges, setRanges] = useState<FindRange[]>([])
  const [current, setCurrent] = useState(0)
  const input = useRef<HTMLInputElement | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    setRanges([])
    setQuery('')
    paint([], 0)
  }, [])

  // Ctrl/Cmd+F opens; Escape closes. The browser's own find is never better
  // than ours here — it cannot reach inside the custom scroller reliably.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setOpen(true)
        window.setTimeout(() => input.current?.select(), 0)
      } else if (event.key === 'Escape' && open) {
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  useEffect(() => {
    if (!open) return
    const root = document.querySelector('[data-find-root]')
    const found = root ? findRanges(root, query) : []
    setRanges(found)
    setCurrent(0)
    paint(found, 0)
    return () => paint([], 0)
  }, [open, query])

  const go = (step: number): void => {
    if (!ranges.length) return
    const next = (current + step + ranges.length) % ranges.length
    setCurrent(next)
    paint(ranges, next)
    const node = ranges[next].startContainer.parentElement
    node?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  if (!open) return <></>
  return (
    <div
      role="search"
      aria-label="Find in the conversation"
      className="fixed top-3 right-4 z-50 flex items-center gap-1.5 rounded-xl border border-line bg-card px-2 py-1.5 shadow-xl"
    >
      <input
        ref={input}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') go(event.shiftKey ? -1 : 1)
        }}
        placeholder="Find in the conversation"
        aria-label="Find in the conversation"
        className="w-56 rounded-lg border border-line bg-bg px-2.5 py-1 text-[12.5px] text-ink outline-none placeholder:text-muted"
      />
      <span className="min-w-[52px] text-center text-[11.5px] text-muted">
        {query.trim() ? `${ranges.length ? current + 1 : 0} / ${ranges.length}` : ''}
      </span>
      <button type="button" onClick={() => go(-1)} aria-label="Previous match" className="rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink">↑</button>
      <button type="button" onClick={() => go(1)} aria-label="Next match" className="rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink">↓</button>
      <button type="button" onClick={close} aria-label="Close find" className="rounded-lg border border-line px-2 py-0.5 text-[11px] text-muted hover:text-ink">×</button>
    </div>
  )
}
