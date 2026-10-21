import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { lstat, mkdir, open, readFile, rename, rm, stat, statfs } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { freemem, tmpdir } from 'node:os'
import { readRecoverableJson, writeRecoverableJson } from '../recoverableJson'
import { DEFAULT_MEDIA, MAX_INLINE_MEDIA_BYTES, normalizeMedia, type MediaFileInput, type MediaInput, type MediaPreferences, type MediaRange, type MediaResult, type MediaSourceHandle } from '../../shared/lib/mediaBridge'
import { decodeInWorker } from './workerClient'
import { providerDecode, type MediaAccess } from './provider'
import { extracted } from './documents'
import { windowsRecognize } from './windowsSpeech'
import { mediaKind } from './formats'
import { runMediaCommand } from './process'
import { framePoints } from '../../shared/lib/media'
import type { ProcessingLedgerStore } from '../processing/ledger'

const safeName = (value: string): string => basename(value).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || 'source.bin'
const same = (a: Awaited<ReturnType<typeof stat>>, b: Awaited<ReturnType<typeof stat>>): boolean => a.isFile() && b.isFile() && a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs
const clock = (seconds: number): string => `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

async function copyOrHashStable(path: string, destination: string | null, signal: AbortSignal): Promise<{ bytes: number; sha256: string }> {
  const namedBefore = await lstat(path)
  if (!namedBefore.isFile() || namedBefore.isSymbolicLink() || namedBefore.size < 1) throw Error('The selected source is empty, linked, or not a regular file.')
  const input = await open(path, 'r'), output = destination ? await open(destination, 'wx', 0o600) : null
  try {
    const before = await input.stat()
    if (!same(namedBefore, before)) throw Error('The selected source changed before it could be read.')
    const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024)
    let position = 0
    while (true) {
      if (signal.aborted) throw Error('Cancelled.')
      const { bytesRead } = await input.read(buffer, 0, buffer.length, position)
      if (!bytesRead) break
      hash.update(buffer.subarray(0, bytesRead))
      if (output) { let written = 0; while (written < bytesRead) written += (await output.write(buffer, written, bytesRead - written)).bytesWritten }
      position += bytesRead
    }
    const after = await input.stat(), namedAfter = await lstat(path)
    if (position !== before.size || !same(before, after) || !same(after, namedAfter)) throw Error('The selected source changed while it was being read.')
    if (output) await output.sync()
    return { bytes: position, sha256: hash.digest('hex') }
  } catch (error) {
    if (output) { try { await output.close() } catch {}; try { await rm(destination!, { force: true }) } catch {} }
    throw error
  } finally { await input.close(); if (output) try { await output.close() } catch {} }
}

function ffprobeFor(ffmpeg: string): string {
  if (!ffmpeg) return 'ffprobe'
  return join(dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe')
}
function demuxer(mime: string): string | undefined {
  return ({ 'video/mp4': 'mov', 'video/webm': 'matroska', 'video/x-msvideo': 'avi', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/mpeg': 'mp3', 'audio/aac': 'aac' } as Record<string, string>)[mime]
}
async function probe(path: string, ffmpeg: string, mime: string, signal: AbortSignal, run: typeof runMediaCommand): Promise<{ duration: number; audio: boolean }> {
  const raw = await run(ffprobeFor(ffmpeg), ['-v', 'error', '-protocol_whitelist', 'file,pipe', ...(mime === 'video/mp4' ? ['-enable_drefs', '0', '-use_absolute_path', '0'] : []), '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', path], signal, 60_000, 200_000)
  const value = JSON.parse(raw.toString('utf8'))
  const duration = Number(value?.format?.duration)
  if (!Number.isFinite(duration) || duration <= 0) throw Error('Media duration could not be established, so complete coverage cannot be claimed.')
  return { duration, audio: Array.isArray(value.streams) && value.streams.some((stream: any) => stream.codec_type === 'audio') }
}

export function createMediaService(options: { file: string; sourceRoot?: string; processing?: ProcessingLedgerStore; onCancelled?(owner: number): void; onSource?(input: { sha256: string; name: string; mime: string; bytes: number; storage: 'in-place' | 'private-copy'; locator: string }): void; onProcessed?(sha256: string, processor: string, coverage: string, ok: boolean): void; access(): MediaAccess; decode?: typeof decodeInWorker; recognize?: typeof windowsRecognize; runCommand?: typeof runMediaCommand; fetchImpl?: typeof fetch }) {
  let preferences = { ...DEFAULT_MEDIA }
  try { preferences = readRecoverableJson(options.file, normalizeMedia, { ...DEFAULT_MEDIA }).value } catch { /* first use or unrecoverable owner file */ }
  const jobs = new Map<number, AbortController>(), recording = new Map<number, number>()
  const handles = new Map<string, { owner: number; path: string; name: string; mime: string; bytes: number; sha256: string; storage: 'in-place' | 'private-copy' }>()
  const runCommand = options.runCommand || runMediaCommand, recognize = options.recognize || windowsRecognize
  const sourceRoot = options.sourceRoot || join(dirname(options.file), 'attachment-center', 'originals')
  const cancel = (owner: number): void => { const notify = recording.delete(owner) || (jobs.has(owner) && !jobs.get(owner)!.signal.aborted); jobs.get(owner)?.abort(); if (notify) options.onCancelled?.(owner) }
  const cancelAll = (): void => { for (const owner of new Set([...jobs.keys(), ...recording.keys()])) cancel(owner) }
  const update = (patch: Partial<MediaPreferences>, native = false): MediaPreferences => {
    cancelAll()
    const proposed = { ...preferences, ...patch, ffmpeg: native || patch?.ffmpeg === '' ? patch.ffmpeg : preferences.ffmpeg, ocrAdapter: native || patch?.ocrAdapter === '' ? patch.ocrAdapter : preferences.ocrAdapter, ocrAdapterSha256: native || patch?.ocrAdapter === '' ? patch.ocrAdapterSha256 : preferences.ocrAdapterSha256, ocrAdapterLabel: native || patch?.ocrAdapter === '' ? patch.ocrAdapterLabel : preferences.ocrAdapterLabel }
    for (const [key, value] of Object.entries(proposed)) if (typeof value === 'string' && value.length > (['ffmpeg','ocrAdapter'].includes(key) ? 4096 : key === 'ocrAdapterLabel' ? 500 : 200)) throw Error('Media setting exceeds its saved limit. Nothing was shortened or changed.')
    const clean = normalizeMedia(proposed); writeRecoverableJson(options.file, clean); preferences = clean; return { ...clean }
  }
  const job = async (owner: number, name: string, run: (signal: AbortSignal) => Promise<MediaResult>): Promise<MediaResult> => {
    if (jobs.has(owner) || jobs.size >= 2) return { ok: false, name, error: 'Another media operation is running. Stop it or wait.' }
    const controller = new AbortController(); jobs.set(owner, controller)
    try { const result = await run(controller.signal); if (controller.signal.aborted) throw Error('Cancelled.'); return result }
    catch (error) { const message = controller.signal.aborted ? 'Cancelled.' : (error as Error).message; return { ok: false, name, error: message, fallbackAllowed: !/encrypted|password|DRM|cancelled/i.test(message) } }
    finally { jobs.delete(owner) }
  }
  const stage = async (owner: number, path: string, input: MediaFileInput, signal: AbortSignal): Promise<{ path: string; source: MediaSourceHandle; jobId?: string }> => {
    if (handles.size >= 256) throw Error('256 selected-file handles are still active. Send or restart before selecting more; none was evicted.')
    const metadata = await lstat(path)
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size !== input.size || metadata.size < 1) throw Error('The selected file no longer matches the picker result.')
    let usePath = path, identity: { bytes: number; sha256: string }
    if (input.storage === 'private-copy') {
      await mkdir(sourceRoot, { recursive: true, mode: 0o700 })
      const space = await statfs(sourceRoot), available = Number(space.bavail) * Number(space.bsize)
      if (available < metadata.size + 64 * 1024 * 1024) throw Error(`A private copy needs ${metadata.size.toLocaleString()} bytes plus working space, but that storage is not available. Use in place or free space; nothing was copied.`)
      const temporary = join(sourceRoot, `.incoming-${randomUUID()}`)
      identity = await copyOrHashStable(path, temporary, signal)
      try {
        const folder = join(sourceRoot, identity.sha256), destination = join(folder, safeName(input.name)); await mkdir(folder, { recursive: true, mode: 0o700 })
        if (existsSync(destination)) {
          const existing = await copyOrHashStable(destination, null, signal)
          if (existing.bytes !== identity.bytes || existing.sha256 !== identity.sha256) throw Error('A conflicting private source copy already exists. It was preserved for review.')
          await rm(temporary, { force: true })
        } else await rename(temporary, destination)
        usePath = destination
      } catch (error) { try { await rm(temporary, { force: true }) } catch {}; throw error }
    } else identity = await copyOrHashStable(path, null, signal)
    const handle = randomUUID(), consequence = input.storage === 'private-copy' ? 'Verified private copy kept in app data and included in app-data backup; sending also retains a turn copy.' : 'Processed from its current location. Move/delete makes later reprocessing unavailable; sending retains a verified turn copy.'
    options.onSource?.({ sha256: identity.sha256, name: input.name, mime: input.mime, bytes: identity.bytes, storage: input.storage, locator: usePath })
    let jobId: string | undefined
    if (options.processing) {
      const rangeLabel = input.range ? ` ${input.range.unit}:${input.range.start}-${input.range.end}` : ' complete-source'
      const processor = (input.route === 'ocr' ? 'DeepSeek-OCR-2 adapter' : input.route === 'local' ? 'local media/document' : `${input.route} ${input.expected?.provider || ''}/${input.expected?.model || ''}`.trim()) + rangeLabel
      // Current decoders commit one selected source/range as one recoverable operation.
      // The ledger supports finer sections, but claiming byte/page checkpoints here
      // would be false because these adapters cannot restart inside a decoder call.
      const job = options.processing.enqueue({ source: { id: identity.sha256, sha256: identity.sha256, name: input.name, kind: 'file', bytes: identity.bytes, locator: input.storage === 'private-copy' ? 'Attachment Center private copy' : 'Owner-selected file used in place' }, processor, total: 1, sectionSize: 1, unit: 'records', outputRoot: `attachment-center/derived/${identity.sha256}` })
      jobId = job.id
    }
    handles.set(handle, { owner, path: usePath, name: input.name, mime: input.mime, bytes: identity.bytes, sha256: identity.sha256, storage: input.storage })
    return { path: usePath, source: { handle, sha256: identity.sha256, bytes: identity.bytes, storage: input.storage, consequence }, ...(jobId ? { jobId } : {}) }
  }
  const decodeLocalPath = async (name: string, path: string, source: MediaSourceHandle, range: MediaRange | undefined, signal: AbortSignal): Promise<MediaResult> => {
    const headHandle = await open(path, 'r'); const head = Buffer.alloc(1024 * 1024)
    let read = 0
    try { read = (await headHandle.read(head, 0, head.length, 0)).bytesRead } finally { await headHandle.close() }
    const format = mediaKind(head.subarray(0, read))
    if (format.mime === 'video/mp4' && head.subarray(0, read).includes(Buffer.from('pssh'))) throw Error('This media appears DRM-protected. Decryption is not supported.')
    if (format.kind === 'document' || format.kind === 'image') {
      const memoryBudget = Math.max(16 * 1024 * 1024, Math.floor(freemem() / 4))
      if (source.bytes > memoryBudget) throw Error(`This document decoder needs one private memory buffer, but the current safe memory budget is ${memoryBudget.toLocaleString()} bytes. Choose a page-range export or retry with more free memory; nothing was clipped.`)
      const bytes = await readFile(path)
      const result = await (options.decode || decodeInWorker)(name, bytes, signal, range)
      if (!result.ok) throw Error(result.error || 'Decoding failed.')
      return { ...result, source }
    }
    if (range && range.unit !== 'seconds') throw Error('Audio/video ranges use seconds.')
    if (!options.access().permissions.local) throw Error('Local inference is disabled.')
    const prefs = { ...preferences }, details = await probe(path, prefs.ffmpeg, format.mime, signal, runCommand)
    const start = range ? Math.max(0, range.start) : 0, end = range ? Math.min(details.duration, range.end) : details.duration
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw Error(`Choose a time range within 0–${Math.ceil(details.duration)} seconds.`)
    const selectedDuration = end - start, temp = await (await import('node:fs/promises')).mkdtemp(join(tmpdir(), 'oddbrain-media-'))
    try {
      const common = ['-hide_banner', '-loglevel', 'error', '-nostdin'], inputArgs = ['-max_alloc', '134217728', '-threads', '2', '-protocol_whitelist', 'file,pipe', ...(demuxer(format.mime) ? ['-f', demuxer(format.mime)!] : []), ...(format.mime === 'video/mp4' ? ['-enable_drefs', '0', '-use_absolute_path', '0'] : []), '-i', path]
      const transcript: string[] = []
      if (details.audio) for (let offset = start; offset < end; offset += 600) {
        const duration = Math.min(600, end - offset), wav = join(temp, `audio-${Math.floor(offset)}.wav`)
        await runCommand(prefs.ffmpeg || 'ffmpeg', [...common, '-ss', String(offset), ...inputArgs, '-t', String(duration), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], signal, Math.max(90_000, duration * 2_000))
        let text = ''
        try { text = await recognize(prefs.language, signal, wav) } catch (error) { if (!/No speech was recognized/.test((error as Error).message)) throw error; text = '[No speech recognized in this interval.]' }
        transcript.push(`[${clock(offset)}–${clock(offset + duration)}]\n${text}`); await rm(wav, { force: true })
      }
      let acoustic = 'No audio stream was present.'
      if (details.audio) {
        try {
          const values = (await runCommand(prefs.ffmpeg || 'ffmpeg', [...common, '-ss', String(start), ...inputArgs, '-t', String(selectedDuration), '-vn', '-af', 'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=pipe\\:1', '-f', 'null', '-'], signal, Math.max(90_000, selectedDuration * 500), 4_000_000)).toString().match(/lavfi\.astats\.Overall\.RMS_level=([-\d.]+)/g)?.map(row => Number(row.split('=')[1])).filter(Number.isFinite) || []
          acoustic = values.length ? `Measured RMS level across ${values.length} windows: average ${(values.reduce((a,b)=>a+b,0)/values.length).toFixed(1)} dB, range ${Math.min(...values).toFixed(1)} to ${Math.max(...values).toFixed(1)} dB. This describes recorded level/dynamics, not emotion or intent.` : 'Audio was fully presented to the measurement pass, but no stable RMS values were returned.'
        } catch { acoustic = 'Acoustic measurement did not finish; the transcript coverage below remains separate.' }
      }
      const images: NonNullable<MediaResult['images']> = []
      if (format.kind === 'video') for (const [index, point] of framePoints(selectedDuration, Math.min(3, Math.max(1, Math.ceil(selectedDuration / 300)))).entries()) {
        const file = join(temp, `frame-${index}.jpg`), absolute = start + point
        await runCommand(prefs.ffmpeg || 'ffmpeg', [...common, '-ss', String(absolute), ...inputArgs, '-frames:v', '1', '-vf', 'scale=1280:1280:force_original_aspect_ratio=decrease', '-q:v', '3', file], signal)
        const data = await readFile(file); if (data.length > 2 * 1024 * 1024) throw Error('Decoded frame exceeds the 2 MB engine-image safety limit.')
        images.push({ name: `${name}-${clock(absolute)}.jpg`, mime: 'image/jpeg', data: data.toString('base64') })
      }
      if (!transcript.length && !images.length) throw Error('No audio or video content could be decoded from this container.')
      const coverage = range ? `${clock(start)}–${clock(end)} of ${clock(details.duration)}` : `the complete ${clock(details.duration)} duration`
      const text = `${format.kind === 'video' ? 'Video' : 'Audio'} coverage: ${coverage}.\n${acoustic}\n\n${transcript.join('\n\n')}`
      const result = transcript.length ? extracted(name, text, `Local full-duration timeline for ${coverage}; speech recognition covered every audio interval. ${images.length} evenly spread visual sample(s) represent the selected duration. Visual frames are samples, not frame-by-frame interpretation.`) : { ok: true as const, name, disclosure: `${images.length} evenly spread visual samples across ${coverage}; no audio stream was present.` }
      return { ...result, images, time: { read: selectedDuration, total: details.duration, unit: 'seconds' }, textComplete: !range || start === 0 && end === details.duration, source }
    } finally { await rm(temp, { recursive: true, force: true }) }
  }
  return {
    canRecord: (owner: number): boolean => (recording.get(owner) || 0) > Date.now(),
    authorizeRecording: (owner: number, expected: { provider: string; model: string }): MediaResult => {
      try {
        if (jobs.has(owner)) throw Error('Another media operation is running.')
        if (preferences.dictation !== 'provider' || !expected || expected.provider !== preferences.transcriptionProvider || expected.model !== preferences.transcriptionModel || !expected.model) throw Error('Dictation provider/model changed or is not selected. Check Voice & files.')
        recording.set(owner, Date.now() + 65_000); return { ok: true, name: 'Microphone' }
      } catch (error) { return { ok: false, name: 'Microphone', error: (error as Error).message } }
    },
    read: (): MediaPreferences => ({ ...preferences }), update, cancel, cancelAll,
    async configureOcrAdapter(path: string): Promise<MediaPreferences> {
      const controller = new AbortController(), identity = await copyOrHashStable(path, null, controller.signal)
      const raw = await runCommand(path, ['--oddbrain-capabilities'], controller.signal, 30_000, 200_000)
      let capability: any
      try { capability = JSON.parse(raw.toString('utf8')) } catch { throw Error('The selected OCR program did not return its reviewable capability JSON. Nothing was saved.') }
      if (capability?.protocol !== 'oddbrain-deepseek-ocr2-v1' || capability?.model !== 'DeepSeek-OCR-2' || typeof capability.version !== 'string' || !capability.version || capability.version.length > 100 || /[\x00-\x1f]/.test(capability.version) || typeof capability.license !== 'string' || !capability.license || capability.license.length > 200 || /[\x00-\x1f]/.test(capability.license)) throw Error('This is not a reviewed DeepSeek-OCR-2 adapter for OddBrain. Nothing was saved.')
      const confirmed = await copyOrHashStable(path, null, controller.signal)
      if (confirmed.bytes !== identity.bytes || confirmed.sha256 !== identity.sha256) throw Error('The OCR adapter changed during capability review. Nothing was saved; choose it again.')
      return update({ ocrAdapter: path, ocrAdapterSha256: identity.sha256, ocrAdapterLabel: `DeepSeek-OCR-2 ${capability.version} · ${capability.license} · adapter ${identity.sha256.slice(0, 12)}` }, true)
    },
    resolveSource(owner: number, input: { handle: string; bytes: number; sha256: string; name?: string; mime?: string }): { path: string; name: string; mime: string; bytes: number; sha256: string; storage: 'in-place' | 'private-copy' } {
      const value = handles.get(input.handle)
      if (!value || value.owner !== owner || value.bytes !== input.bytes || value.sha256 !== input.sha256 || (input.name !== undefined && input.name !== value.name) || (input.mime !== undefined && input.mime !== value.mime)) throw Error('The selected source handle expired or changed. Reattach it; nothing was sent.')
      return { path: value.path, name: value.name, mime: value.mime, bytes: value.bytes, sha256: value.sha256, storage: value.storage }
    },
    releaseSource(owner: number, sourceHandle: string): void {
      const value = handles.get(sourceHandle)
      if (value?.owner === owner) handles.delete(sourceHandle)
    },
    dictate: (owner: number): Promise<MediaResult> => job(owner, 'Dictation', async signal => {
      if (!options.access().permissions.local) throw Error('Local inference is disabled. The microphone was not opened.')
      return extracted('Dictation', await recognize(preferences.language, signal), 'Offline Windows speech recognition. Check the transcript before sending.')
    }),
    decode: (owner: number, input: MediaInput): Promise<MediaResult> => job(owner, typeof input?.name === 'string' ? input.name.slice(0, 200) : 'Attachment', async signal => {
      if (!input || typeof input.name !== 'string' || !input.name || /[\x00-\x1f]/.test(input.name) || input.name.length > 240 || !(input.bytes instanceof Uint8Array) || !input.bytes.length || input.bytes.length > MAX_INLINE_MEDIA_BYTES) throw Error('This inline operation exceeds the bounded 8 MB renderer-memory transport. Use the desktop file picker for streamed processing; nothing was decoded or sent.')
      if (!['local', 'provider', 'transcribe'].includes(input.route)) throw Error('Inline OCR is not supported. Choose the file through the desktop picker.')
      recording.delete(owner)
      if (input.route !== 'local') return providerDecode(input, { ...preferences }, options.access(), signal, options.fetchImpl)
      const result = await (options.decode || decodeInWorker)(input.name, input.bytes, signal)
      if (!result.ok) throw Error(result.error || 'Decoding failed.'); return result
    }),
    decodeFile: (owner: number, path: string, input: MediaFileInput): Promise<MediaResult> => job(owner, typeof input?.name === 'string' ? input.name.slice(0, 200) : 'Attachment', async signal => {
      if (!input || typeof path !== 'string' || !path || typeof input.name !== 'string' || !input.name || input.name !== basename(input.name) || /[\x00-\x1f]/.test(input.name) || input.name.length > 240 || !Number.isSafeInteger(input.size) || input.size < 1 || !['local','provider','transcribe','ocr'].includes(input.route) || !['in-place','private-copy'].includes(input.storage)) throw Error('The selected-file request is invalid.')
      if (input.range && (!Number.isFinite(input.range.start) || !Number.isFinite(input.range.end) || input.range.start < 0 || input.range.end < input.range.start || (input.range.unit === 'seconds' && input.range.end === input.range.start) || !['pages','seconds'].includes(input.range.unit))) throw Error('Choose a valid page or time range.')
      recording.delete(owner)
      const staged = await stage(owner, path, input, signal), processor = input.route === 'local' ? 'local-media/document' : input.route === 'ocr' ? `local:${preferences.ocrAdapterLabel || 'DeepSeek-OCR-2 adapter'}` : `${input.route}:${input.expected?.provider || 'unselected'}/${input.expected?.model || 'unselected'}`
      let claimedStart: number | null = null; const startedAt = Date.now()
      try {
        if (staged.jobId && options.processing) {
          const current = options.processing.read().jobs.find(value => value.id === staged.jobId)
          if (current?.state === 'blocked' || current?.state === 'paused') options.processing.resume(staged.jobId)
          if (current?.state !== 'done') claimedStart = options.processing.claim(staged.jobId, input.route === 'local' || input.route === 'ocr' ? { localSeconds: 1 } : {}).start
        }
        let result: MediaResult
        if (input.route === 'ocr') {
          const prefs = { ...preferences }
          if (!prefs.ocrAdapter || !prefs.ocrAdapterSha256) throw Error('Choose and review an owner-installed DeepSeek-OCR-2 adapter in Voice & files first. OddBrain will not download one silently.')
          const adapter = await copyOrHashStable(prefs.ocrAdapter, null, signal)
          if (adapter.sha256 !== prefs.ocrAdapterSha256) throw Error('The selected OCR adapter changed since review. Choose it again; the document was not processed.')
          const rangeArgs = input.range ? ['--range', `${input.range.unit}:${input.range.start}-${input.range.end}`] : []
          const raw = await runCommand(prefs.ocrAdapter, ['--oddbrain-process', staged.path, '--json', ...rangeArgs], signal, 30 * 60_000, 4_000_000)
          const confirmedAdapter = await copyOrHashStable(prefs.ocrAdapter, null, signal)
          if (confirmedAdapter.bytes !== adapter.bytes || confirmedAdapter.sha256 !== adapter.sha256) throw Error('The OCR adapter changed while it was running. Its output was not accepted.')
          let output: any
          try { output = JSON.parse(raw.toString('utf8')) } catch { throw Error('The OCR adapter returned unreadable output. No OCR result was accepted.') }
          if (typeof output?.text !== 'string' || !output.text.trim() || typeof output.coverage !== 'string' || output.coverage.length > 2000 || output.text.length > 500_000 || !output.pages || !Number.isInteger(output.pages.read) || !Number.isInteger(output.pages.total) || output.pages.read < 1 || output.pages.total < output.pages.read) throw Error('The OCR adapter did not return bounded text with honest page coverage. No result was accepted.')
          const extractedResult = extracted(input.name, output.text, `Owner-run ${prefs.ocrAdapterLabel}. ${output.coverage} Layout-aware model output is unconfirmed derived text; the immutable original remains separate.`)
          result = { ...extractedResult, pages: output.pages, textComplete: output.pages.read === output.pages.total, source: staged.source }
        } else if (input.route !== 'local') {
          const providerLimit = input.route === 'transcribe' ? 24 * 1024 * 1024 : 18 * 1024 * 1024
          if (staged.source.bytes > providerLimit) throw Error(`The selected ${input.route === 'transcribe' ? 'transcription' : 'file'} provider adapter accepts at most ${providerLimit.toLocaleString()} bytes per upload. Nothing was uploaded; local processing and manual external handoff remain available.`)
          const bytes = await readFile(staged.path)
          result = { ...(await providerDecode({ name: input.name, mime: input.mime, bytes, route: input.route, expected: input.expected }, { ...preferences }, options.access(), signal, options.fetchImpl)), source: staged.source }
        } else result = await decodeLocalPath(input.name, staged.path, staged.source, input.range, signal)
        const coverage = result.disclosure || 'Processor returned usable output without a coverage note.'
        if (staged.jobId && options.processing && claimedStart !== null) {
          options.processing.finish(staged.jobId, claimedStart, { state: 'done', output: coverage, usage: input.route === 'local' || input.route === 'ocr' ? { localSeconds: Math.max(1, (Date.now() - startedAt) / 1000) } : {} })
        }
        options.onProcessed?.(staged.source.sha256, processor, coverage, true)
        return result
      } catch (error) {
        handles.delete(staged.source.handle)
        if (staged.jobId && options.processing && claimedStart !== null) try { options.processing.finish(staged.jobId, claimedStart, { state: 'blocked', error: (error as Error).message, usage: input.route === 'local' || input.route === 'ocr' ? { localSeconds: Math.max(0, (Date.now() - startedAt) / 1000) } : {} }) } catch {}
        options.onProcessed?.(staged.source.sha256, processor, (error as Error).message, false); throw error
      }
    }),
  }
}
