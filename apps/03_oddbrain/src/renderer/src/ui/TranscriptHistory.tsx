import { useEffect, useRef, useState } from 'react'
import { bridge } from '../platform/bridge'
import { transcriptMarkdown, type Transcript, type TranscriptHeader } from '@shared/lib/transcripts'
import { downloadText } from '../lib/downloadText'
import { downloadBytes } from '@shared/lib/zip'
import CopyText from './CopyText'

export default function TranscriptHistory({ initialId = '' }: { initialId?: string } = {}) {
  const [entries, setEntries] = useState<TranscriptHeader[]>([]), [next, setNext] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [selected, setSelected] = useState<Transcript | null>(null)
  const [query, setQuery] = useState('')
  const generation = useRef(0), mounted = useRef(true)
  useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; generation.current++ } }, [])
  useEffect(() => { if (initialId) void read(initialId) }, [initialId])
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
  /** Save one preserved picture only after main and this view agree on its digest. */
  async function savePicture(index: number) {
    const record = selected
    if (!record || !bridge.transcripts.media) { setNotice('Preserved pictures are available in the desktop app.'); return }
    const own = ++generation.current; setBusy(true)
    try {
      const reply = await bridge.transcripts.media(record.header.id, index)
      if (!mounted.current || own !== generation.current) return
      if (!reply.ok) throw Error(reply.error)
      const expected = record.header.media?.files.find(file => file.index === index)
      if (!expected || reply.value.sha256 !== expected.sha256 || reply.value.bytes !== expected.bytes || reply.value.mime !== expected.mime) throw Error('The returned picture does not match this record. Nothing was downloaded.')
      const bytes = Uint8Array.from(atob(reply.value.base64), c => c.charCodeAt(0))
      if (bytes.length !== expected.bytes) throw Error('The returned picture changed length in transit. Nothing was downloaded.')
      if (downloadBytes(bytes, reply.value.name, reply.value.mime, setNotice)) setNotice(`Saved picture ${index + 1} after checking ${expected.bytes} bytes and its recorded digest. This is the exact copy the app kept, not proof the engine used it.`)
    } catch (error) { if (mounted.current && own === generation.current) setNotice((error as Error).message) }
    finally { if (mounted.current && own === generation.current) setBusy(false) }
  }
  const markdown = selected ? transcriptMarkdown(selected) : ''
  return <section aria-label="Full engine transcripts">
    <p className="ob-control-scope">Text recorded by this app from now on, including tool activity and engine-supplied thinking. Older journal summaries cannot be expanded. Picture bytes are shown only when this record actually preserved them; older records keep just the count. Native tool summaries may be abbreviated. Records live in app storage, not the vault: export them for a separate backup. Opening a record does not resume or run anything.</p>
    <button type="button" disabled={busy} className="ob-small-button" onClick={() => void load()}>Refresh transcripts</button>
    <label>Find loaded transcript titles<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label><p>Search applies only to loaded titles, not all original text or native sessions. Load older transcripts for more titles.</p>
    {entries.length ? <ul>{entries.filter(entry => entry.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(e => <li key={e.id}><button type="button" disabled={busy} className="ob-text-button" onClick={() => void read(e.id)}>{e.title}</button><p className="ob-control-scope">{e.at} · {e.engine} · {e.model || 'Engine default'}</p></li>)}</ul> : <p>{busy ? 'Reading transcripts…' : 'No transcript titles loaded.'}</p>}
    {next ? <button type="button" disabled={busy} onClick={() => void load(next)}>Load older transcripts</button> : null}
    {selected ? <article><h3>{selected.header.title}</h3><button type="button" disabled={busy} onClick={() => void read(selected.header.id)}>Refresh this transcript</button><p className="ob-control-scope">{selected.state} · Private text: review before sharing. This copy does not include native history from before recording began.</p>{selected.header.media?.files.length ? <section aria-label="Preserved pictures"><h4>Preserved pictures</h4><p className="ob-control-scope">The exact image bytes this app wrote before dispatch, in app storage outside the vault. Each save is checked against the size and SHA-256 digest recorded with the turn. Keeping a copy is not proof that a model accepted or understood it.</p><ul>{selected.header.media.files.map(file => <li key={file.index}><p>Picture {file.index + 1} · {file.mime} · {file.bytes} bytes · sha256 {file.sha256.slice(0, 16)}…</p><button type="button" disabled={busy} onClick={() => void savePicture(file.index)}>Save picture {file.index + 1}</button></li>)}</ul></section> : selected.header.pictures ? <p className="ob-control-scope">{selected.header.pictures} image(s) accompanied this request, but their bytes were not preserved with this record. No picture is offered for download.</p> : null}
<div className="ob-inline-actions"><CopyText text={markdown} label="Copy full transcript" /><button type="button" onClick={() => downloadText(markdown, `turn-${selected.header.id}.md`)}>Export Markdown</button></div><button type="button" onClick={() => downloadText(JSON.stringify(selected, null, 2), `turn-${selected.header.id}.json`)}>Export recorded events JSON</button><button type="button" disabled={busy} onClick={() => void exportRaw(selected.header.id)}>Export original record</button><p>Tool output is an app-recorded event, not proof of successful execution. Native session IDs in events are observations only, not verified resume authorization.</p><pre className="whitespace-pre-wrap break-words">{markdown}</pre></article> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </section>
}
