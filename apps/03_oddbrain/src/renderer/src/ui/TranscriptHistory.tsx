import { useEffect, useRef, useState } from 'react'
import { bridge } from '../platform/bridge'
import { transcriptMarkdown, type Transcript, type TranscriptAttachment, type TranscriptHeader, type TranscriptImage } from '@shared/lib/transcripts'
import { downloadBase64, downloadText } from '../lib/downloadText'
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
  async function exportImage(id: string, image: TranscriptImage) {
    const own = ++generation.current; setBusy(true)
    try {
      const reply = await bridge.transcripts.image?.(id, image.id)
      if (!mounted.current || own !== generation.current) return
      if (!reply || !reply.ok) throw Error(reply && !reply.ok ? reply.error : 'Retained image download is unavailable here.')
      if (!reply.value.verified || reply.value.sha256 !== image.sha256 || reply.value.bytes !== image.bytes || reply.value.mime !== image.mime) throw Error('The verified image response did not match this transcript. Nothing was downloaded.')
      downloadBase64(reply.value.data, reply.value.mime, reply.value.name)
      setNotice(`${image.id} passed its recorded SHA-256 and size checks before download.`)
    } catch (error) { if (mounted.current && own === generation.current) setNotice((error as Error).message) }
    finally { if (mounted.current && own === generation.current) setBusy(false) }
  }
  async function exportAttachment(id: string, attachment: TranscriptAttachment) {
    const own = ++generation.current; setBusy(true)
    try {
      const reply = await bridge.transcripts.attachment?.(id, attachment.id)
      if (!mounted.current || own !== generation.current) return
      if (!reply || !reply.ok) throw Error(reply && !reply.ok ? reply.error : 'Retained original download is unavailable here.')
      if (!reply.value.verified || reply.value.sha256 !== attachment.sha256 || reply.value.bytes !== attachment.bytes || reply.value.mime !== attachment.mime || reply.value.name !== attachment.name) throw Error('The verified original-file response did not match this transcript. Nothing was downloaded.')
      downloadBase64(reply.value.data, reply.value.mime || 'application/octet-stream', reply.value.name)
      setNotice(`${attachment.name} passed its recorded SHA-256 and size checks before download.`)
    } catch (error) { if (mounted.current && own === generation.current) setNotice((error as Error).message) }
    finally { if (mounted.current && own === generation.current) setBusy(false) }
  }
  const markdown = selected ? transcriptMarkdown(selected) : ''
  return <section aria-label="Full engine transcripts">
    <p className="ob-control-scope">Text recorded by this app from now on, including tool activity and engine-supplied thinking. New image turns retain the exact dispatched bytes as separate private files; older count-only records say when those bytes are unavailable. Native tool summaries may be abbreviated. Records live in app storage, not the vault: export them for a separate backup. On startup, OddBrain reconciles bounded recent finished or interrupted records into their existing saved app chats; it never recreates deleted chats or resumes work. Opening or downloading a record does not resume or run anything.</p>
    <button type="button" disabled={busy} className="ob-small-button" onClick={() => void load()}>Refresh transcripts</button>
    <label>Find loaded transcript titles<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label><p>Search applies only to loaded titles, not all original text or native sessions. Load older transcripts for more titles.</p>
    {entries.length ? <ul>{entries.filter(entry => entry.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(e => <li key={e.id}><button type="button" disabled={busy} className="ob-text-button" onClick={() => void read(e.id)}>{e.title}</button><p className="ob-control-scope">{e.at} · {e.engine} · {e.model || 'Engine default'}</p></li>)}</ul> : <p>{busy ? 'Reading transcripts…' : 'No transcript titles loaded.'}</p>}
    {next ? <button type="button" disabled={busy} onClick={() => void load(next)}>Load older transcripts</button> : null}
    {selected ? <article><h3>{selected.header.title}</h3><button type="button" disabled={busy} onClick={() => void read(selected.header.id)}>Refresh this transcript</button><p className="ob-control-scope">{selected.state} · Private text and images: review before sharing. This copy does not include native history from before recording began.</p><div className="ob-inline-actions"><CopyText text={markdown} label="Copy full transcript" /><button type="button" onClick={() => downloadText(markdown, `turn-${selected.header.id}.md`)}>Export Markdown</button></div><button type="button" onClick={() => downloadText(JSON.stringify(selected, null, 2), `turn-${selected.header.id}.json`)}>Export recorded events JSON</button><button type="button" disabled={busy} onClick={() => void exportRaw(selected.header.id)}>Export original text record</button>{selected.header.pictures && selected.header.images === undefined ? <p role="status">This older transcript recorded {selected.header.pictures} image(s), but their bytes were never retained. They cannot be reconstructed from the count.</p> : null}{selected.header.images?.length ? <section aria-label="Retained transcript images"><h4>Retained images</h4><p>Each download is reread from private app storage and must match its dispatch-time MIME, byte count, and SHA-256. This confirms stored-byte consistency, not what the image depicts.</p><ul>{selected.header.images.map(image => <li key={image.id}><button type="button" disabled={busy} onClick={() => void exportImage(selected.header.id, image)}>Download verified {image.id}</button><p className="ob-control-scope">{image.mime} · {image.bytes.toLocaleString()} bytes · SHA-256 <code>{image.sha256}</code></p></li>)}</ul></section> : null}{selected.header.attachments?.length ? <section aria-label="Retained original attachments"><h4>Retained original files</h4><p>These are the exact source bytes retained before native dispatch, separate from extracted text or sampled frames. Each download must still match its recorded size and SHA-256.</p><ul>{selected.header.attachments.map(attachment => <li key={attachment.id}><button type="button" disabled={busy} onClick={() => void exportAttachment(selected.header.id, attachment)}>Download verified {attachment.name}</button><p className="ob-control-scope">{attachment.mime || 'MIME not reported'} · {attachment.bytes.toLocaleString()} bytes · SHA-256 <code>{attachment.sha256}</code></p></li>)}</ul></section> : null}<p>Tool output is an app-recorded event, not proof of successful execution. Native session IDs in events are observations only, not verified resume authorization.</p><pre className="whitespace-pre-wrap break-words">{markdown}</pre></article> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </section>
}
