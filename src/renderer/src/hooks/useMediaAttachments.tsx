import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { Attachment } from '@shared/types'
import { newId } from '@shared/lib/storage'
import { readAttachment } from '@shared/lib/attachments'
import { DEFAULT_MEDIA, MAX_MEDIA_BYTES, type MediaInput, type MediaPreferences, type MediaResult } from '@shared/lib/mediaBridge'
import { bridge, isDemo } from '../platform/bridge'
import { extractFrames } from '../lib/videoFrames'

type Source = { id: string; file: File; attachments: string[]; note: string; failed: boolean; fallback: boolean }
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
      const selected = await bridge.media.read(); if (ticket !== generation.current) return; setPrefs(selected)
      const expected = route === 'transcribe' ? { provider: prefs.transcriptionProvider, model: prefs.transcriptionModel } : { provider: prefs.provider, model: prefs.model }
      let added: Attachment[], description: string
      if (isDemo && route === 'local' && !/\.(pdf|docx|xlsx|pptx|odt|ods|odp)$/i.test(source.file.name)) {
        if (/^video\//.test(source.file.type)) {
          const frames = await extractFrames(source.file, 3)
          added = await Promise.all(frames.map(file => readAttachment(file, { verified: true, vision: true, thinking: false })))
          description = 'Three or fewer evenly spaced still frames. Audio was not transcribed; this is not full video analysis.'
        } else { added = [await readAttachment(source.file, { verified: true, vision: true, thinking: false })]; description = 'Browser-local text/image reading. No provider upload.' }
        added = added.map(file => ({ ...file, extraction: description }))
      } else {
        const bytes = new Uint8Array(await source.file.arrayBuffer()); if (ticket !== generation.current) return
        const result = await bridge.media.decode({ name: source.file.name, mime: source.file.type, bytes, route, expected })
        if (!result.ok) { if (ticket === generation.current) setSources(old => old.map(s => s.id === source.id ? { ...s, failed: true, note: (result.error || 'Could not decode the file.') + (s.attachments.length ? ' Previous extraction is still attached; remove it if you do not want to send it.' : ''), fallback: result.fallbackAllowed !== false } : s)); return }
        added = attachmentsFromMedia(result, source.file.size); description = result.disclosure || ''
      }
      if (ticket !== generation.current) return
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
    {sources.map(source => <section key={source.id}><strong>{source.file.name}</strong><p className={source.failed ? 'text-warn' : 'text-muted'}>{source.note}</p><div className="ob-inline-actions"><button type="button" disabled={busy} onClick={() => void run(source, 'local')}>Retry locally</button>
      {source.fallback && prefs.provider && prefs.model ? <button type="button" disabled={busy || isDemo} onClick={() => void run(source, 'provider')}>Upload to {prefs.provider} / {prefs.model}</button> : null}
      {source.fallback && prefs.transcriptionProvider && prefs.transcriptionModel && (/^(audio|video)\//.test(source.file.type) || /\.(mp3|wav|flac|m4a|mp4|webm|ogg|mov|mkv)$/i.test(source.file.name)) ? <button type="button" disabled={busy || isDemo} onClick={() => void run(source, 'transcribe')}>Transcribe with {prefs.transcriptionProvider} / {prefs.transcriptionModel}</button> : null}
      <button type="button" disabled={busy} onClick={() => { replace(current.current.filter(a => !source.attachments.includes(a.id))); setSources(old => old.filter(s => s.id !== source.id)) }}>Discard source</button></div>
      {source.failed && !prefs.provider ? <p className="ob-control-scope">Choose a file provider and model in Settings → Voice & files to offer an explicit upload. No file has been sent automatically.</p> : null}
    </section>)}{busy ? <button type="button" onClick={cancel}>Cancel file processing</button> : null}
  </div></details> : null
  return { addFiles, clear, busy, controls }
}
