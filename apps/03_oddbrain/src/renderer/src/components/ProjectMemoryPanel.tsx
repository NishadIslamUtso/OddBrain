import { useEffect, useState } from 'react'
import { bridge } from '@/platform/bridge'
import type { MemoryProjectView, MemorySearchHit } from '@shared/lib/memoryOb'

/** Functional Project-memory surface. Final visual design intentionally waits for
 * the completed module; this proves the shared source scope and exact evidence. */
export default function ProjectMemoryPanel({ projectId }: { projectId: string }) {
  const [view, setView] = useState<MemoryProjectView | null>(null), [query, setQuery] = useState(''), [hits, setHits] = useState<MemorySearchHit[]>([]), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    let live = true
    void bridge.memoryOb.project(projectId).then(answer => { if (live) { if (answer.ok && answer.view) setView(answer.view); else setNotice(answer.error || 'Project memory is unavailable.') } })
    return () => { live = false }
  }, [projectId])
  const search = async (): Promise<void> => {
    if (!query.trim()) return
    setBusy(true); setNotice('')
    try {
      const answer = await bridge.memoryOb.search({ projectId, query: query.trim(), limit: 12 })
      if (!answer.ok) throw Error(answer.error || 'Project memory search failed.')
      setHits(answer.hits || [])
      setNotice(answer.hits?.length ? `${answer.hits.length} exact source match${answer.hits.length === 1 ? '' : 'es'}. These are raw evidence, not confirmed facts.` : 'No matching Project source was found. Nothing was invented.')
    } catch (error) { setNotice((error as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="mt-3 rounded-lg border border-line bg-bg/40 p-3" aria-label="Shared Project memory">
    <div className="flex flex-wrap items-center gap-2"><h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Shared Project memory</h3>{view ? <span className="text-[10.5px] text-muted">revision {view.revision} · {view.chats} source chat{view.chats === 1 ? '' : 's'} · {view.messages} messages · {view.confirmed} confirmed · {view.pending} pending · {view.trash} in Trash</span> : null}</div>
    <p className="mt-1 text-[11px] leading-relaxed text-muted">{view?.notice || 'Reading the Memory_OB Project scope…'}</p>
    <form className="mt-2 flex gap-2" onSubmit={event => { event.preventDefault(); void search() }}><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find evidence from this Project’s sessions" aria-label="Search shared Project memory" className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2.5 text-[12px] text-ink"/><button type="submit" disabled={busy || !query.trim()} className="rounded-lg border border-line px-2.5 text-[11.5px] text-muted disabled:opacity-40">{busy ? 'Finding…' : 'Find'}</button></form>
    {notice ? <p className="mt-2 text-[11px] text-muted" role="status">{notice}</p> : null}
    {hits.length ? <ul className="mt-2 space-y-2">{hits.map(hit => <li key={`${hit.recordId}:${hit.messageId}:${hit.start}`} className="rounded-md border border-line p-2"><p className="text-[11px] font-medium text-ink">{hit.title} · {hit.role || 'source'}</p><p className="mt-1 whitespace-pre-wrap text-[11px] text-muted">{hit.text}</p><p className="mt-1 text-[10px] text-muted">{hit.coverage} · SHA-256 {hit.sha256.slice(0, 16)}…</p></li>)}</ul> : null}
  </section>
}
