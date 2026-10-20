import { useEffect, useRef, useState } from 'react'
import { bridge } from '../platform/bridge'
import { transcriptMarkdown, type Transcript, type TranscriptHeader } from '@shared/lib/transcripts'
import { downloadText } from '../lib/downloadText'
import CopyText from './CopyText'

export default function TranscriptHistory({ initialId = '', chatId = '' }: { initialId?: string; chatId?: string } = {}) {
  const [entries, setEntries] = useState<TranscriptHeader[]>([]), [next, setNext] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [selected, setSelected] = useState<Transcript | null>(null)
  const [query, setQuery] = useState('')
  // When opened from a conversation, start with that conversation's own turns.
  const [thisChatOnly, setThisChatOnly] = useState(Boolean(chatId))
  const scope = thisChatOnly && chatId ? chatId : '', previousChat = useRef(chatId)
  const generation = useRef(0), mounted = useRef(true)
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; generation.current++ } }, [])
  useEffect(() => { if (initialId) void read(initialId) }, [initialId])
  useEffect(() => {
    if (previousChat.current === chatId) return
    previousChat.current = chatId; setThisChatOnly(Boolean(chatId)); void load('', chatId)
  }, [chatId])
  async function load(before = '', only = scope) {
    const own = ++generation.current; setBusy(true)
    try {
      const reply = await bridge.transcripts.list(before, only)
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
  async function exportRaw(id: string) {
    const own = ++generation.current; setBusy(true)
    try {
      const reply = await bridge.transcripts.raw?.(id)
      if (!mounted.current || own !== generation.current) return
      if (!reply || !reply.ok) throw Error(reply && !reply.ok ? reply.error : 'Original transcript export is unavailable here.')
      downloadText(reply.value.content, `turn-${id}.ndjson`)
    } catch (error) { if (mounted.current && own === generation.current) setNotice((error as Error).message) }
    finally { if (mounted.current && own === generation.current) setBusy(false) }
  }
  const markdown = selected ? transcriptMarkdown(selected) : ''
  return <section aria-label="Full engine transcripts">
    <p className="ob-control-scope">Text recorded by this app from now on, including tool activity and engine-supplied thinking. Older journal summaries cannot be expanded. Pictures sent with a turn are saved beside its record when the record lists their fingerprints; an older record that kept only a count says so and its image bytes were never stored. Native tool summaries may be abbreviated. Records live in app storage, not the vault: export them for a separate backup. Opening a record does not resume or run anything.</p>
    {chatId && <p className="ob-control-scope">{scope ? 'Showing only this conversation’s recorded turns.' : 'Showing every recorded turn, not only this conversation’s.'} <button type="button" className="ob-small-button" disabled={busy} onClick={() => { const next = !thisChatOnly; setThisChatOnly(next); void load('', next && chatId ? chatId : '') }}>{scope ? 'Show every transcript' : 'Show only this conversation'}</button></p>}
    <button type="button" disabled={busy} className="ob-small-button" onClick={() => void load()}>Refresh transcripts</button>
    <label>Find loaded transcript titles<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label><p>Search applies only to loaded titles, not all original text or native sessions. Load older transcripts for more titles.</p>
    {entries.length ? <ul>{entries.filter(entry => entry.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(e => <li key={e.id}><button type="button" disabled={busy} className="ob-text-button" onClick={() => void read(e.id)}>{e.title}</button><p className="ob-control-scope">{e.at} · {e.engine} · {e.model || 'Engine default'}</p></li>)}</ul> : <p>{busy ? 'Reading transcripts…' : 'No transcript titles loaded.'}</p>}
    {next ? <button type="button" disabled={busy} onClick={() => void load(next)}>Load older transcripts</button> : null}
    {selected ? <article><h3>{selected.header.title}</h3><button type="button" disabled={busy} onClick={() => void read(selected.header.id)}>Refresh this transcript</button><p className="ob-control-scope">{selected.state} · Private text: review before sharing. This copy does not include native history from before recording began.</p><div className="ob-inline-actions"><CopyText text={markdown} label="Copy full transcript" /><button type="button" onClick={() => downloadText(markdown, `turn-${selected.header.id}.md`)}>Export Markdown</button></div><button type="button" onClick={() => downloadText(JSON.stringify(selected, null, 2), `turn-${selected.header.id}.json`)}>Export recorded events JSON</button><button type="button" disabled={busy} onClick={() => void exportRaw(selected.header.id)}>Export original record</button><p>Tool output is an app-recorded event, not proof of successful execution. Native session IDs in events are observations only, not verified resume authorization.</p><pre className="whitespace-pre-wrap break-words">{markdown}</pre></article> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </section>
}
