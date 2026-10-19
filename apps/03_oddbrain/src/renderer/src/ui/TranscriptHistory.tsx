import { useEffect, useRef, useState } from 'react'
import { bridge } from '../platform/bridge'
import { transcriptMarkdown, type Transcript, type TranscriptHeader } from '@shared/lib/transcripts'
import { downloadText } from '../lib/downloadText'
import CopyText from './CopyText'

export default function TranscriptHistory() {
  const [entries, setEntries] = useState<TranscriptHeader[]>([]), [next, setNext] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [selected, setSelected] = useState<Transcript | null>(null)
  const generation = useRef(0), mounted = useRef(true)
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; generation.current++ } }, [])
  async function load(before = '') {
    const own = ++generation.current; setBusy(true)
    try {
      const reply = await bridge.transcripts.list(before)
      if (!mounted.current || own !== generation.current) return
      if (!reply.ok) throw Error(reply.error)
      setEntries(old => before ? [...old, ...reply.value.entries] : reply.value.entries); setNext(reply.value.next); setNotice(reply.value.notice)
    } catch (e) { if (mounted.current && own === generation.current) setNotice((e as Error).message) }
    finally { if (mounted.current && own === generation.current) setBusy(false) }
  }
  async function read(id: string) {
    const own = ++generation.current; setBusy(true); setSelected(null)
    try {
      const reply = await bridge.transcripts.read(id)
      if (!mounted.current || own !== generation.current) return
      if (!reply.ok) throw Error(reply.error)
      setSelected(reply.value); setNotice('')
    } catch (e) { if (mounted.current && own === generation.current) setNotice((e as Error).message) }
    finally { if (mounted.current && own === generation.current) setBusy(false) }
  }
  const markdown = selected ? transcriptMarkdown(selected) : ''
  return <section aria-label="Full engine transcripts">
    <p className="ob-control-scope">Text recorded by this app from now on, including tool activity and engine-supplied thinking. Older journal summaries cannot be expanded. Image bytes are not included; native tool summaries may be abbreviated. Records live in app storage, not the vault: export them for a separate backup. Opening a record does not resume or run anything.</p>
    <button type="button" disabled={busy} className="ob-small-button" onClick={() => void load()}>Refresh transcripts</button>
    {entries.length ? <ul>{entries.map(e => <li key={e.id}><button type="button" disabled={busy} className="ob-text-button" onClick={() => void read(e.id)}>{e.title}</button><p className="ob-control-scope">{e.at} · {e.engine} · {e.model || 'Engine default'}</p></li>)}</ul> : <p>{busy ? 'Reading transcripts…' : 'No full transcripts loaded.'}</p>}
    {next ? <button type="button" disabled={busy} onClick={() => void load(next)}>Load older transcripts</button> : null}
    {selected ? <article><h3>{selected.header.title}</h3><p className="ob-control-scope">{selected.state} · Private text: review before sharing. This copy does not include native history from before recording began.</p><div className="ob-inline-actions"><CopyText text={markdown} label="Copy full transcript" /><button type="button" onClick={() => downloadText(markdown, `turn-${selected.header.id}.md`)}>Export Markdown</button></div><pre className="whitespace-pre-wrap break-words">{markdown}</pre></article> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </section>
}
