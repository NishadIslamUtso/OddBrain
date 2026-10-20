import { useEffect, useRef, useState } from 'react'
import type { MemoryAction, MemoryProposal } from '@shared/lib/memoryWorkspace'
import { DiffBlock } from './EnginePanel'

/** Individual editing remains in each record; bulk changes always get a preview. */
export default function MemoryReviewGroup({ records, busy, act, children }: { records: MemoryProposal[]; busy: boolean; act: (action: Omit<MemoryAction, 'expectedRevision'>) => Promise<boolean>; children: (item: MemoryProposal) => React.ReactNode }) {
  const [ids, setIds] = useState<string[]>([])
  const [preview, setPreview] = useState<{ decision: 'approve' | 'reject'; ids: string[]; records: MemoryProposal[] } | null>(null)
  const previewPanel = useRef<HTMLElement>(null)
  useEffect(() => { if (preview) { previewPanel.current?.focus({ preventScroll: true }); previewPanel.current?.scrollIntoView?.({ block: 'start' }) } }, [preview])
  const selected = records.filter(p => ids.includes(p.id) && p.state === 'pending')
  const changed = preview && preview.records.some(old => { const current = records.find(p => p.id === old.id); return !current || JSON.stringify(current) !== JSON.stringify(old) })
  return <section className="ob-review-group" aria-label={`Review group: ${records[0].source.title}`}>
    <h3>{records[0].source.title}</h3><p className="ob-memory-caption">{records[0].source.provider} · {records.length} suggestions · Review the wording and evidence before confirming.</p>
    {records.map(item => <div key={item.id}><label className="ob-memory-check"><input type="checkbox" aria-label={`Select interpretation: ${item.title}`} checked={ids.includes(item.id)} disabled={busy || (!ids.includes(item.id) && selected.length >= 32)} onChange={e => setIds(previous => e.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} /> Include in group review</label>{children(item)}</div>)}
    <div className="ob-memory-actions"><button type="button" className="ob-small-button" disabled={busy || !selected.length} onClick={() => setPreview({ decision: 'approve', ids: selected.map(p => p.id), records: structuredClone(selected) })}>Review selected ({selected.length})</button><button type="button" className="ob-small-button" disabled={busy || !selected.length} onClick={() => setPreview({ decision: 'reject', ids: selected.map(p => p.id), records: structuredClone(selected) })}>Reject selected</button></div>
    {preview && <section ref={previewPanel} tabIndex={-1} className="ob-memory-batch-preview" aria-label="Review selected interpretations">
      <h3>{preview.decision === 'approve' ? 'Confirm these exact interpretations?' : 'Reject these interpretations?'}</h3>
      <p>Only the selected records change. Original conversations stay untouched. To change wording, cancel and use “Edit before approving” on that record.</p>
      {preview.records.map(p => <article key={p.id}><h4>{p.title}</h4><DiffBlock detail={['--- not-approved', '+++ would-be-confirmed', `@@ ${p.kind} interpretation @@`, `+ Title: ${p.title}`, ...p.text.split('\n').map(line => `+ ${line}`), `+ Event date: ${p.date || 'not established'}`, ...(p.uncertainty ? [`+ Qualification: ${p.uncertainty}`] : []), `+ Evidence: ${p.quote}`, `+ Source: ${p.source.path}`].join('\n')} />{p.source.warnings && (p.source.warnings.invisibleText || p.source.warnings.instructionLike) ? <p role="alert">Untrusted extension source: {p.source.warnings.invisibleText} invisible-text warning(s), {p.source.warnings.instructionLike} instruction-like phrase(s). It has no prompt or permission authority.</p> : null}</article>)}
      {changed && <p role="alert">These records changed. Cancel and review the current versions.</p>}
      <div className="ob-memory-actions"><button type="button" className="ob-small-button" disabled={busy || !!changed} onClick={() => void act({ type: 'review-batch', ids: preview.ids, decision: preview.decision }).then(ok => { if (ok) { setPreview(null); setIds([]) } })}>{preview.decision === 'approve' ? 'Confirm selected interpretations' : 'Confirm rejection'}</button><button type="button" className="ob-small-button" disabled={busy} onClick={() => setPreview(null)}>Cancel group review</button></div>
    </section>}
  </section>
}
