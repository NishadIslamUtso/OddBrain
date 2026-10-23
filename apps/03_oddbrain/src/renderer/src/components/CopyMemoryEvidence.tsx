import { useEffect, useRef, useState } from 'react'
import type { MemoryProposal } from '@shared/lib/memoryWorkspace'
import { formatMemoryEvidence } from '@shared/lib/memoryEvidence'

export default function CopyMemoryEvidence({ item, sample, disabled = false }: { item: MemoryProposal; sample: boolean; disabled?: boolean }) {
  const [status, setStatus] = useState(''), [fallback, setFallback] = useState(''), [busy, setBusy] = useState(false)
  const pending = useRef(false), generation = useRef(0)
  useEffect(() => { generation.current++; setStatus(''); setFallback(''); return () => { generation.current++ } }, [item.id, item.revision, item.state, disabled])
  const copy = async () => {
    if (pending.current || disabled) return
    pending.current = true; setBusy(true); setStatus(''); setFallback('')
    const ticket = generation.current
    const text = formatMemoryEvidence(item, sample)
    try {
      await navigator.clipboard.writeText(text)
      if (ticket !== generation.current) return
      setStatus('Copied with source and review status. Nothing was sent to a model.')
    } catch {
      if (ticket !== generation.current) return
      setStatus('Automatic copying was blocked. Select and copy the text below.')
      setFallback(text)
    } finally { pending.current = false; setBusy(false) }
  }
  return <div>
    <p className="ob-memory-caption">Copies personal text and local source details. Check where you paste it.{disabled ? ' Finish editing and wait for any save before copying.' : ''}</p>
    <button type="button" className="ob-small-button" disabled={disabled || busy} onClick={() => { void copy() }}>{busy ? 'Copying…' : 'Copy with sources'}</button>
    {status && <p className="ob-memory-caption" role="status">{status}</p>}
    {fallback && <label>Reference to copy<textarea aria-label="Memory reference to copy" readOnly rows={8} value={fallback} onFocus={event => event.currentTarget.select()} /></label>}
  </div>
}
