import ReviewHistory from './ReviewHistory'
import TranscriptHistory from './TranscriptHistory'
import { useEffect, useState } from 'react'
import { trapDialogFocus } from './focus'
import { X } from 'lucide-react'
import { getEngineApi } from '../platform/bridge'
import CopyText from './CopyText'
import { useEngine } from '../state/engine'
/** Actual engine records, never generated activity. */
export default function TurnJournal({ chatId = '' }: { chatId?: string } = {}) {
  const [focusedRecord, setFocusedRecord] = useState('')
  const engine = useEngine(), [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<typeof engine.journal | null>(null), [reviews, setReviews] = useState(false), [transcripts, setTranscripts] = useState(false), [notice, setNotice] = useState('')
  useEffect(() => { if (!open) return; let active = true; void getEngineApi().journal?.list?.().then(reply => { if (active && reply.ok) setEntries(reply.entries) }).catch(() => { if (active) setNotice('The latest journal could not be read.') }); return () => { active = false } }, [open])
  useEffect(() => { const show = (event: Event) => { const id = (event as CustomEvent).detail; if (typeof id !== 'string') return; setFocusedRecord(id); setTranscripts(true); setReviews(false); setOpen(true) }; window.addEventListener('app:show-transcript', show); return () => window.removeEventListener('app:show-transcript', show) }, [])
  useEffect(() => { const show = (): void => setOpen(true); window.addEventListener('app:show-journal', show); return () => window.removeEventListener('app:show-journal', show) }, [])
  useEffect(() => { if (!open) return; const close = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }; window.addEventListener('keydown', close, true); return () => window.removeEventListener('keydown', close, true) }, [open])
  if (!open) return null
  const shown = entries || engine.journal
  return <div className="ob-modal-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) setOpen(false) }}><section className="ob-journal" role="dialog" aria-modal="true" onKeyDown={trapDialogFocus} aria-label="Turn journal"><header><h2>Turn journal</h2><button type="button" className="ob-icon-button" aria-label="Close journal" onClick={() => setOpen(false)} autoFocus><X size={16} /></button></header><div className="ob-choices"><button type="button" className="ob-choice" aria-pressed={!reviews && !transcripts} onClick={() => { setReviews(false); setTranscripts(false) }}>Summaries</button><button type="button" className="ob-choice" aria-pressed={reviews && !transcripts} onClick={() => { setReviews(true); setTranscripts(false) }}>Review reports</button><button type="button" className="ob-choice" aria-pressed={transcripts} onClick={() => setTranscripts(true)}>Full transcripts</button></div>{transcripts ? <TranscriptHistory initialId={focusedRecord} chatId={chatId} /> : reviews ? <ReviewHistory /> : shown.length ? <ol>{shown.map((entry, index) => <li key={`${entry.at}-${index}`}><time>{new Date(entry.at).toLocaleString()}</time><h3>{entry.prompt}</h3><p>{entry.answer || 'No answer was recorded.'}</p>{entry.usage ? <small>{entry.usage}</small> : null}<CopyText text={JSON.stringify(entry, null, 2)} label="Copy journal entry" /></li>)}</ol> : <p>No turns recorded yet.</p>}{notice ? <p role="status">{notice}</p> : null}</section></div>
}
