import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { Attachment } from '@shared/types'
import { newId } from '@shared/lib/storage'
import { readAttachment } from '@shared/lib/attachments'
import { DEFAULT_MEDIA, MAX_EXTRACTED_TEXT, MAX_MEDIA_BYTES, type MediaInput, type MediaPreferences, type MediaResult, type MediaTextSegment } from '@shared/lib/mediaBridge'
import { bridge, isDemo } from '../platform/bridge'
import { extractFrames } from '../lib/videoFrames'

type Source = { id: string; file: File; attachments: string[]; note: string; failed: boolean; fallback: boolean; segments?: MediaTextSegment[]; selected?: string[] }
export function attachmentsFromMedia(result: MediaResult, size: number): Attachment[] {
  if (!result.ok) throw Error(result.error || 'The file could not be decoded.')
  const disclosure = result.disclosure || 'Extraction coverage was not supplied.'
  const text: Attachment[] = result.text ? [{ id: newId(), name: result.name, kind: 'text', mime: 'text/plain', size, text: result.text, extraction: disclosure }] : []
  return [...text, ...(result.images || []).map(image => ({ id: newId(), name: image.name, kind: 'image' as const, mime: image.mime, size, data: image.data, seenBy: 'direct', extraction: disclosure }))]
}
export default function useMediaAttachments(attachments: Attachment[], setAttachments: Dispatch<SetStateAction<Attachment[]>>, notice: (message: string) => void) {
  const [sources, setSources] = useState<Source[]>([]), [busy, setBusy] = useState(false)
  const [prefs, setPrefs] = useState<MediaPreferences>({ ...DEFAULT_MEDIA })
  const current = useRef(attachments), locked = useRef(false), generation = useRef(0)
  current.current = attachments
  useEffect(() => {
    let alive = true
    const refresh = (): void => { void bridge.media.read().then(value => { if (alive) setPrefs(value) }).catch(() => {}) }
    refresh(); window.addEventListener('app:media-settings-changed', refresh); window.addEventListener('focus', refresh)
    return () => { alive = false; window.removeEventListener('app:media-settings-changed', refresh); window.removeEventListener('focus', refresh); generation.current++; void bridge.media.cancel() }
  }, [])
  const replace = (files: Attachment[]): void => { current.current = files; setAttachments(files) }
  const process = async (source: Source, route: MediaInput['route']): Promise<void> => {
    const ticket = generation.current
    try {
      if (source.file.size > MAX_MEDIA_BYTES) throw Error('This file exceeds the 50 MB ingestion limit. Split or export it first.')
      // Bind an explicit upload to the provider/model printed on the button
      // that was clicked. The refreshed preferences are for the next review;
      // silently rerouting this already-approved file would be incorrect.
      const reviewed = prefs
      const currentPreferences = await bridge.media.read(); if (ticket !== generation.current) return; setPrefs(currentPreferences)
      const expected = route === 'transcribe' ? { provider: reviewed.transcriptionProvider, model: reviewed.transcriptionModel } : { provider: reviewed.provider, model: reviewed.model }
      let added: Attachment[], description: string
      if (isDemo && route === 'local' && !/\.(pdf|docx|xlsx|pptx|odt|ods|odp)$/i.test(source.file.name)) {
        if (/^video\//.test(source.file.type)) {
          const frames = await extractFrames(source.file, 3)
          added = await Promise.all(frames.map(file => readAttachment(file, { verified: true, vision: true, thinking: false, contextWindowTokens: null })))
          description = 'Three or fewer evenly spaced still frames. Audio was not transcribed; this is not full video analysis.'
        } else { added = [await readAttachment(source.file, { verified: true, vision: true, thinking: false, contextWindowTokens: null })]; description = 'Browser-local text/image reading. No provider upload.' }
        added = added.map(file => ({ ...file, extraction: description }))
      } else {
        const bytes = new Uint8Array(await source.file.arrayBuffer()); if (ticket !== generation.current) return
        const result = await bridge.media.decode({ name: source.file.name, mime: source.file.type, bytes, route, expected })
        if (!result.ok) { if (ticket === generation.current) setSources(old => old.map(s => s.id === source.id ? { ...s, failed: true, note: (result.error || 'Could not decode the file.') + (s.attachments.length ? ' Previous extraction is still attached; remove it if you do not want to send it.' : ''), fallback: result.fallbackAllowed !== false } : s)); return }
        if (result.segments?.length) {
          setSources(old => old.map(s => s.id === source.id ? { ...s, failed: false, note: result.disclosure || 'Choose document sections to attach.', segments: result.segments, selected: [] } : s))
          return
        }
        added = attachmentsFromMedia(result, source.file.size); description = result.disclosure || ''
      }
      if (ticket !== generation.current) return
      added = added.map(attachment => ({ ...attachment, originalId: source.id, originalFile: source.file }))
      const remaining = current.current.filter(file => !source.attachments.includes(file.id))
      if (!added.length) throw Error('The decoder returned no usable content.')
      if (remaining.length + added.length > 4) throw Error(`This source produces ${added.length} attachment(s), but only ${4 - remaining.length} slot(s) remain. Nothing from it was silently dropped. Remove attachments, then retry.`)
      replace([...remaining, ...added])
      setSources(old => old.map(s => s.id === source.id ? { ...s, failed: false, attachments: added.map(a => a.id), note: description, fallback: true } : s))
    } catch (error) { if (ticket === generation.current) setSources(old => old.map(s => s.id === source.id ? { ...s, failed: true, note: (error as Error).message + (s.attachments.length ? ' Previous extraction is still attached; remove it if you do not want to send it.' : '') } : s)) }
  }
  const run = async (source: Source, route: MediaInput['route']): Promise<void> => {
    if (locked.current) return
    locked.current = true; setBusy(true)
    try { await process(source, route) } finally { locked.current = false; setBusy(false) }
  }
  const attachSelected = (source: Source): void => {
    const chosen = (source.segments || []).filter(segment => source.selected?.includes(segment.id))
    if (!chosen.length) { setSources(old => old.map(item => item.id === source.id ? { ...item, note: 'Choose at least one complete document section.' } : item)); return }
    const text = chosen.map(segment => `${segment.label}\n${segment.text}`).join('\n\n')
    if (text.length > MAX_EXTRACTED_TEXT) { setSources(old => old.map(item => item.id === source.id ? { ...item, note: `The selected complete sections total ${text.length.toLocaleString()} characters, above the ${MAX_EXTRACTED_TEXT.toLocaleString()}-character attachment limit. Choose fewer sections; nothing was shortened.` } : item)); return }
    const remaining = current.current.filter(file => !source.attachments.includes(file.id))
    if (remaining.length >= 4) { setSources(old => old.map(item => item.id === source.id ? { ...item, note: 'Four attachment slots are already used. Remove one before attaching this selection.' } : item)); return }
    const attachment: Attachment = { id: newId(), name: source.file.name, kind: 'text', mime: 'text/plain', size: source.file.size, text, extraction: `Owner selected ${chosen.map(segment => segment.label).join(', ')} from the complete local extraction. Unselected sections were omitted whole.`, originalId: source.id, originalFile: source.file }
    replace([...remaining, attachment])
    setSources(old => old.map(item => item.id === source.id ? { ...item, attachments: [attachment.id], note: `${chosen.length} complete section(s) attached. Other sections remain available and were not shortened.` } : item))
  }
  const addFiles = async (files: File[]): Promise<void> => {
    if (locked.current) { notice('Wait for the current import or cancel it before adding more files.'); return }
    if (sources.length + files.length > 8) { notice('At most eight original files can wait here. Discard a source before adding more.'); return }
    locked.current = true; setBusy(true)
    const queued = files.map(file => ({ id: newId(), file, attachments: [], note: 'Decoding locally…', failed: false, fallback: true }))
    const ticket = generation.current
    setSources(old => [...old, ...queued])
    try { for (const source of queued) { if (ticket !== generation.current) break; await process(source, 'local') } }
    finally { locked.current = false; setBusy(false) }
  }
  const clear = (): void => { generation.current++; setSources([]); void bridge.media.cancel() }
  const cancel = (): void => { generation.current++; void bridge.media.cancel(); setSources(old => old.map(s => s.note === 'Decoding locally…' ? { ...s, failed: true, note: 'Cancelled. Original file retained; retry or discard it.' } : s)) }
  const controls = sources.length ? <details className="ob-file-imports px-4 py-2 text-[12px]" open={busy || sources.some(s => s.failed)}><summary>File processing · {sources.length} source{sources.length === 1 ? '' : 's'}{busy ? ' · working' : ''}</summary><div className="max-h-[150px] overflow-y-auto space-y-3 py-2">
    {sources.map(source => <section key={source.id}><strong>{source.file.name}</strong><p className={source.failed ? 'text-warn' : 'text-muted'}>{source.note}</p>
      {source.segments?.length ? <fieldset className="ob-control-scope"><legend>Choose complete sections</legend><div className="max-h-[120px] overflow-y-auto">{source.segments.map(segment => <label key={segment.id} className="block"><input type="checkbox" checked={source.selected?.includes(segment.id) === true} disabled={busy} onChange={event => setSources(old => old.map(item => item.id === source.id ? { ...item, selected: event.target.checked ? [...(item.selected || []), segment.id] : (item.selected || []).filter(id => id !== segment.id) } : item))} /> {segment.label} · {segment.text.length.toLocaleString()} characters</label>)}</div><button type="button" disabled={busy || !source.selected?.length} onClick={() => attachSelected(source)}>Attach selected sections</button></fieldset> : null}
      <div className="ob-inline-actions"><button type="button" disabled={busy} onClick={() => void run(source, 'local')}>Retry locally</button>
      {source.fallback && prefs.provider && prefs.model ? <button type="button" disabled={busy || isDemo} onClick={() => void run(source, 'provider')}>Upload to {prefs.provider} / {prefs.model}</button> : null}
      {source.fallback && prefs.transcriptionProvider && prefs.transcriptionModel && (/^(audio|video)\//.test(source.file.type) || /\.(mp3|wav|flac|m4a|mp4|webm|ogg|mov|mkv)$/i.test(source.file.name)) ? <button type="button" disabled={busy || isDemo} onClick={() => void run(source, 'transcribe')}>Transcribe with {prefs.transcriptionProvider} / {prefs.transcriptionModel}</button> : null}
      <button type="button" disabled={busy} onClick={() => { replace(current.current.filter(a => !source.attachments.includes(a.id))); setSources(old => old.filter(s => s.id !== source.id)) }}>Discard source</button></div>
      {source.failed && !prefs.provider ? <p className="ob-control-scope">Choose a file provider and model in Settings → Voice & files to offer an explicit upload. No file has been sent automatically.</p> : null}
    </section>)}{busy ? <button type="button" onClick={cancel}>Cancel file processing</button> : null}
  </div></details> : null
  return { addFiles, clear, busy, controls }
}
