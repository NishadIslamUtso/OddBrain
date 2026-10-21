import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { Attachment } from '@shared/types'
import { newId } from '@shared/lib/storage'
import { readAttachment } from '@shared/lib/attachments'
import { DEFAULT_MEDIA, LARGE_SOURCE_CHOICE_BYTES, MAX_EXTRACTED_TEXT, MAX_INLINE_MEDIA_BYTES, type MediaInput, type MediaPreferences, type MediaRange, type MediaResult, type MediaSourceHandle, type MediaTextSegment } from '@shared/lib/mediaBridge'
import { bridge, isDemo } from '../platform/bridge'
import { extractFrames } from '../lib/videoFrames'

type Source = { id: string; file: File; attachments: string[]; note: string; failed: boolean; fallback: boolean; awaitingChoice?: boolean; storage?: 'in-place' | 'private-copy'; rangeUnit?: 'pages' | 'seconds'; rangeStart?: string; rangeEnd?: string; videoOcr?: boolean; sourceHandle?: MediaSourceHandle; segments?: MediaTextSegment[]; selected?: string[] }
export function attachmentsFromMedia(result: MediaResult, size: number): Attachment[] {
  if (!result.ok) throw Error(result.error || 'The file could not be decoded.')
  const disclosure = result.disclosure || 'Extraction coverage was not supplied.'
  const text: Attachment[] = result.text ? [{ id: newId(), name: result.name, kind: 'text', mime: 'text/plain', size, text: result.text, extraction: disclosure }] : []
  return [...text, ...(result.images || []).map(image => ({ id: newId(), name: image.name, kind: 'image' as const, mime: image.mime, size, data: image.data, seenBy: 'direct', extraction: disclosure }))]
}
export default function useMediaAttachments(attachments: Attachment[], setAttachments: Dispatch<SetStateAction<Attachment[]>>, notice: (message: string) => void) {
  const [sources, setSources] = useState<Source[]>([]), [busy, setBusy] = useState(false)
  const [prefs, setPrefs] = useState<MediaPreferences>({ ...DEFAULT_MEDIA })
  const current = useRef(attachments), locked = useRef(false), generation = useRef(0), sourceHandles = useRef(new Set<string>())
  const releaseHandle = (handle: string): void => { sourceHandles.current.delete(handle); void bridge.media.releaseSource(handle) }
  current.current = attachments
  useEffect(() => {
    let alive = true
    const refresh = (): void => { void bridge.media.read().then(value => { if (alive) setPrefs(value) }).catch(() => {}) }
    refresh(); window.addEventListener('app:media-settings-changed', refresh); window.addEventListener('focus', refresh)
    return () => { alive = false; window.removeEventListener('app:media-settings-changed', refresh); window.removeEventListener('focus', refresh); generation.current++; for (const handle of sourceHandles.current) void bridge.media.releaseSource(handle); sourceHandles.current.clear(); void bridge.media.cancel() }
  }, [])
  const replace = (files: Attachment[]): void => { current.current = files; setAttachments(files) }
  const process = async (source: Source, route: MediaInput['route'], storage: 'in-place' | 'private-copy' = source.storage || 'in-place', range?: MediaRange): Promise<void> => {
    const ticket = generation.current
    try {
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
        let result: MediaResult
        if (isDemo) {
          if (source.file.size > MAX_INLINE_MEDIA_BYTES) throw Error('The browser preview cannot stream this selected file. Use the installed desktop app; no file was clipped or uploaded.')
          const bytes = new Uint8Array(await source.file.arrayBuffer()); if (ticket !== generation.current) return
          result = await bridge.media.decode({ name: source.file.name, mime: source.file.type, bytes, route, expected })
        } else result = await bridge.media.decodeFile(source.file, { name: source.file.name, mime: source.file.type, size: source.file.size, route, expected, storage, ...(range ? { range } : {}), ...(source.videoOcr ? { videoOcr: true } : {}) })
        if (ticket !== generation.current) { if (result.source) void bridge.media.releaseSource(result.source.handle); return }
        if (!result.ok) { setSources(old => old.map(s => s.id === source.id ? { ...s, failed: true, awaitingChoice: false, storage, note: (result.error || 'Could not decode the file.') + (s.attachments.length ? ' Previous extraction is still attached; remove it if you do not want to send it.' : ''), fallback: result.fallbackAllowed !== false } : s)); return }
        if (source.sourceHandle && source.sourceHandle.handle !== result.source?.handle) releaseHandle(source.sourceHandle.handle)
        if (result.source) sourceHandles.current.add(result.source.handle)
        if (result.segments?.length) {
          const remaining = current.current.filter(file => !source.attachments.includes(file.id))
          const evidence = attachmentsFromMedia(result, source.file.size).map(attachment => ({ ...attachment, originalSource: result.source, originalId: source.id, originalFile: source.file }))
          if (remaining.length + evidence.length > 4) throw Error(`This source produces ${evidence.length} visual evidence attachment(s), but only ${4 - remaining.length} slot(s) remain. Nothing from it was silently dropped. Remove attachments, then retry.`)
          replace([...remaining, ...evidence])
          setSources(old => old.map(s => s.id === source.id ? { ...s, failed: false, awaitingChoice: false, storage, sourceHandle: result.source, attachments: evidence.map(attachment => attachment.id), note: result.disclosure || 'Choose complete sections to attach.', segments: result.segments, selected: [] } : s))
          return
        }
        added = attachmentsFromMedia(result, source.file.size); description = result.disclosure || ''
        added = added.map(attachment => ({ ...attachment, originalSource: result.source }))
      }
      if (ticket !== generation.current) return
      added = added.map(attachment => ({ ...attachment, originalId: source.id, originalFile: source.file }))
      const remaining = current.current.filter(file => !source.attachments.includes(file.id))
      if (!added.length) throw Error('The decoder returned no usable content.')
      if (remaining.length + added.length > 4) throw Error(`This source produces ${added.length} attachment(s), but only ${4 - remaining.length} slot(s) remain. Nothing from it was silently dropped. Remove attachments, then retry.`)
      replace([...remaining, ...added])
      setSources(old => old.map(s => s.id === source.id ? { ...s, failed: false, awaitingChoice: false, storage, sourceHandle: added.find(a => a.originalSource)?.originalSource || s.sourceHandle, attachments: added.map(a => a.id), note: description, fallback: true } : s))
    } catch (error) { if (ticket === generation.current) setSources(old => old.map(s => s.id === source.id ? { ...s, failed: true, note: (error as Error).message + (s.attachments.length ? ' Previous extraction is still attached; remove it if you do not want to send it.' : '') } : s)) }
  }
  const run = async (source: Source, route: MediaInput['route'], storage: 'in-place' | 'private-copy' = source.storage || 'in-place', range?: MediaRange): Promise<void> => {
    if (locked.current) return
    locked.current = true; setBusy(true)
    try { await process(source, route, storage, range) } finally { locked.current = false; setBusy(false) }
  }
  const attachSelected = (source: Source): void => {
    const chosen = (source.segments || []).filter(segment => source.selected?.includes(segment.id))
    if (!chosen.length) { setSources(old => old.map(item => item.id === source.id ? { ...item, note: 'Choose at least one complete document section.' } : item)); return }
    const text = chosen.map(segment => `${segment.label}\n${segment.text}`).join('\n\n')
    if (text.length > MAX_EXTRACTED_TEXT) { setSources(old => old.map(item => item.id === source.id ? { ...item, note: `The selected complete sections total ${text.length.toLocaleString()} characters, above the ${MAX_EXTRACTED_TEXT.toLocaleString()}-character attachment limit. Choose fewer sections; nothing was shortened.` } : item)); return }
    const evidence = current.current.filter(file => source.attachments.includes(file.id) && file.kind === 'image')
    const remaining = current.current.filter(file => !source.attachments.includes(file.id))
    if (remaining.length + evidence.length + 1 > 4) { setSources(old => old.map(item => item.id === source.id ? { ...item, note: 'The selected text and visual evidence need more attachment slots. Remove another attachment; nothing was silently dropped.' } : item)); return }
    const attachment: Attachment = { id: newId(), name: source.file.name, kind: 'text', mime: 'text/plain', size: source.file.size, text, extraction: `Owner selected ${chosen.map(segment => segment.label).join(', ')} from the complete local extraction. Unselected sections were omitted whole.`, originalId: source.id, originalFile: source.file, originalSource: source.sourceHandle }
    replace([...remaining, attachment, ...evidence])
    setSources(old => old.map(item => item.id === source.id ? { ...item, attachments: [attachment.id, ...evidence.map(file => file.id)], note: `${chosen.length} complete section(s) and ${evidence.length} adaptive visual evidence frame(s) attached. Other text sections remain available and were not shortened.` } : item))
  }
  const addFiles = async (files: File[]): Promise<void> => {
    if (locked.current) { notice('Wait for the current import or cancel it before adding more files.'); return }
    if (sources.length + files.length > 8) { notice('At most eight original files can wait here. Discard a source before adding more.'); return }
    locked.current = true; setBusy(true)
    const queued: Source[] = files.map(file => {
      const video = /^video\//.test(file.type) || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(file.name)
      if (video || file.size > LARGE_SOURCE_CHOICE_BYTES) return { id: newId(), file, attachments: [], note: video ? 'Review adaptive video processing before it starts. Complete audio is processed locally; only selected scene evidence reaches the AI.' : `${(file.size / 1024 / 1024).toFixed(1)} MB. Choose how OddBrain may read this consequentially large source before processing starts.`, failed: false, fallback: true, awaitingChoice: true, rangeUnit: /\.pdf$/i.test(file.name) ? 'pages' : /^(audio|video)\//.test(file.type) || video ? 'seconds' : undefined }
      return { id: newId(), file, attachments: [], note: 'Decoding locally in bounded main-process work…', failed: false, fallback: true, storage: 'in-place' }
    })
    const ticket = generation.current
    setSources(old => [...old, ...queued])
    try { for (const source of queued) { if (ticket !== generation.current) break; if (!source.awaitingChoice) await process(source, 'local', 'in-place') } }
    finally { locked.current = false; setBusy(false) }
  }
  const clear = (): void => { generation.current++; for (const handle of sourceHandles.current) void bridge.media.releaseSource(handle); sourceHandles.current.clear(); setSources([]); void bridge.media.cancel() }
  const cancel = (): void => { generation.current++; void bridge.media.cancel(); setSources(old => old.map(s => !s.awaitingChoice ? { ...s, failed: true, note: 'Cancelled. Original file retained; retry or discard it.' } : s)) }
  const controls = sources.length ? <details className="ob-file-imports px-4 py-2 text-[12px]" open={busy || sources.some(s => s.failed)}><summary>File processing · {sources.length} source{sources.length === 1 ? '' : 's'}{busy ? ' · working' : ''}</summary><div className="max-h-[150px] overflow-y-auto space-y-3 py-2">
    {sources.map(source => <section key={source.id}><strong>{source.file.name}</strong><p className={source.failed ? 'text-warn' : 'text-muted'}>{source.note}</p>
      {source.awaitingChoice ? <fieldset className="ob-control-scope"><legend>How should OddBrain read it?</legend><p><strong>Use in place</strong> makes no extra processing copy; moving the file prevents later reprocessing. <strong>Keep private copy</strong> uses another {source.file.size.toLocaleString()} bytes and joins app-data backups. Sending either choice retains a verified turn copy.</p>{(/^video\//.test(source.file.type) || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(source.file.name)) ? <label className="block my-2"><input type="checkbox" checked={source.videoOcr === true} disabled={busy || !prefs.ocrAdapter} onChange={event => setSources(old => old.map(item => item.id === source.id ? { ...item, videoOcr: event.target.checked } : item))} /> Read on-screen text in selected adaptive frames with the configured DeepSeek-OCR-2 adapter{prefs.ocrAdapter ? '' : ' (configure OCR-2 first)'}</label> : null}<div className="ob-inline-actions"><button type="button" disabled={busy} onClick={() => void run(source, 'local', 'in-place')}>Use in place</button><button type="button" disabled={busy} onClick={() => void run(source, 'local', 'private-copy')}>Keep private copy</button></div>{source.rangeUnit ? <div className="mt-2"><p>Or process only a complete {source.rangeUnit === 'pages' ? 'page' : 'time'} range now:</p><label>From <input className="w-20" inputMode="numeric" value={source.rangeStart || ''} onChange={event => setSources(old => old.map(item => item.id === source.id ? { ...item, rangeStart: event.target.value } : item))}/></label> <label>through <input className="w-20" inputMode="numeric" value={source.rangeEnd || ''} onChange={event => setSources(old => old.map(item => item.id === source.id ? { ...item, rangeEnd: event.target.value } : item))}/></label> <button type="button" disabled={busy || !source.rangeStart || !source.rangeEnd} onClick={() => void run(source, 'local', 'in-place', { unit: source.rangeUnit!, start: Number(source.rangeStart), end: Number(source.rangeEnd) })}>Process range in place</button></div> : null}</fieldset> : null}
      {source.segments?.length ? <fieldset className="ob-control-scope"><legend>Choose complete sections</legend><div className="max-h-[120px] overflow-y-auto">{source.segments.map(segment => <label key={segment.id} className="block"><input type="checkbox" checked={source.selected?.includes(segment.id) === true} disabled={busy} onChange={event => setSources(old => old.map(item => item.id === source.id ? { ...item, selected: event.target.checked ? [...(item.selected || []), segment.id] : (item.selected || []).filter(id => id !== segment.id) } : item))} /> {segment.label} · {segment.text.length.toLocaleString()} characters</label>)}</div><button type="button" disabled={busy || !source.selected?.length} onClick={() => attachSelected(source)}>Attach selected sections</button></fieldset> : null}
      <div className="ob-inline-actions">{!source.awaitingChoice ? <button type="button" disabled={busy} onClick={() => void run(source, 'local')}>Retry locally</button> : null}
      {!source.awaitingChoice && source.fallback && prefs.provider && prefs.model ? <button type="button" disabled={busy || isDemo} onClick={() => void run(source, 'provider')}>Upload to {prefs.provider} / {prefs.model}</button> : null}
      {!source.awaitingChoice && source.fallback && prefs.transcriptionProvider && prefs.transcriptionModel && (/^(audio|video)\//.test(source.file.type) || /\.(mp3|wav|flac|m4a|mp4|webm|ogg|mov|mkv)$/i.test(source.file.name)) ? <button type="button" disabled={busy || isDemo} onClick={() => void run(source, 'transcribe')}>Transcribe with {prefs.transcriptionProvider} / {prefs.transcriptionModel}</button> : null}
      {!source.awaitingChoice && prefs.ocrAdapter && (/^image\//.test(source.file.type) || /\.pdf$/i.test(source.file.name)) ? <button type="button" disabled={busy || isDemo} onClick={() => void run(source, 'ocr')}>Run reviewed DeepSeek-OCR-2 adapter</button> : null}
      <button type="button" disabled={busy} onClick={() => { if (source.sourceHandle) releaseHandle(source.sourceHandle.handle); replace(current.current.filter(a => !source.attachments.includes(a.id))); setSources(old => old.filter(s => s.id !== source.id)) }}>Discard source</button></div>
      {source.failed && !prefs.provider ? <p className="ob-control-scope">Choose a file provider and model in Settings → Voice & files to offer an explicit upload. No file has been sent automatically.</p> : null}
    </section>)}{busy ? <button type="button" onClick={cancel}>Cancel file processing</button> : null}
  </div></details> : null
  return { addFiles, clear, busy, controls }
}
