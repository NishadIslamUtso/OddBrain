import { createHash, randomUUID } from 'node:crypto'
import { link, lstat, mkdir, open, readFile, rm, stat, statfs } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { freemem, tmpdir } from 'node:os'
import { readRecoverableJson, writeRecoverableJson } from '../recoverableJson'
import { DEFAULT_MEDIA, MAX_INLINE_MEDIA_BYTES, normalizeMedia, type MediaFileInput, type MediaAudioWindow, type MediaInput, type MediaPreferences, type MediaRange, type MediaResult, type MediaSourceHandle } from '../../shared/lib/mediaBridge'
import { decodeInWorker } from './workerClient'
import { providerDecode, type MediaAccess } from './provider'
import { extracted } from './documents'
import { windowsRecognize } from './windowsSpeech'
import { mediaKind } from './formats'
import { runMediaCommand } from './process'
import { adaptiveFramePoints, parseSceneMetadata } from '../../shared/lib/videoStudio'
import type { ProcessingLedgerStore } from '../processing/ledger'

const safeName = (value: string): string => basename(value).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || 'source.bin'
const same = (a: Awaited<ReturnType<typeof stat>>, b: Awaited<ReturnType<typeof stat>>): boolean => a.isFile() && b.isFile() && a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs
const clock = (seconds: number): string => `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
function pauseIntervals(value: string, offset: number): Array<{ start: number; end: number; duration: number }> {
  const found: Array<{ start: number; end: number; duration: number }> = []; let end: number | undefined, seconds: number | undefined
  for (const line of value.split(/\r?\n/)) {
    const ended = line.match(/lavfi\.silence_end=([\d.]+)/), duration = line.match(/lavfi\.silence_duration=([\d.]+)/)
    if (ended) end = Number(ended[1])
    if (duration) seconds = Number(duration[1])
    if (Number.isFinite(end) && Number.isFinite(seconds)) {
      if (seconds! >= .3) found.push({ start: offset + Math.max(0, end! - seconds!), end: offset + end!, duration: seconds! })
      end = undefined; seconds = undefined
    }
  }
  return found
}

function transcriptWindows(start: number, end: number, pauses: Array<{ start: number; end: number }>): Array<{ start: number; end: number; decodeStart: number }> {
  const windows: Array<{ start: number; end: number; decodeStart: number }> = []
  for (let cursor = start; cursor < end;) {
    const target = Math.min(end, cursor + 60)
    const near = target < end ? pauses
      .filter(pause => pause.start >= target - 8 && pause.end <= target + 8 && (pause.start + pause.end) / 2 >= cursor + 20)
      .sort((a, b) => Math.abs((a.start + a.end) / 2 - target) - Math.abs((b.start + b.end) / 2 - target))[0] : undefined
    const boundary = near ? Math.min(end, (near.start + near.end) / 2) : target
    windows.push({ start: cursor, end: boundary, decodeStart: windows.length && !near ? Math.max(start, cursor - 1.5) : cursor })
    cursor = boundary
  }
  return windows
}

function dedupeRecognition(previous: string, current: string): string {
  const before = previous.trim().split(/\s+/).filter(Boolean), next = current.trim().split(/\s+/).filter(Boolean)
  const normalized = (value: string): string => value.normalize('NFKC').toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  const maximum = Math.min(30, before.length, next.length)
  for (let size = maximum; size >= 2; size--) {
    const left = before.slice(-size).map(normalized), right = next.slice(0, size).map(normalized)
    if (left.every((word, index) => word && word === right[index])) return next.slice(size).join(' ')
  }
  return current.trim()
}

async function copyOrHashStable(path: string, destination: string | null, signal: AbortSignal): Promise<{ bytes: number; sha256: string }> {
  // Open first, then validate the name against that descriptor. All bytes come
  // from the descriptor, so replacing the path cannot redirect this read.
  const input = await open(path, 'r'); let output: Awaited<ReturnType<typeof open>> | null = null
  try {
    const before = await input.stat(), namedBefore = await lstat(path)
    if (!before.isFile() || before.size < 1 || namedBefore.isSymbolicLink() || !same(namedBefore, before)) throw Error('The selected source is empty, linked, or changed before it could be read.')
    output = destination ? await open(destination, 'wx', 0o600) : null
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

export function createMediaService(options: { file: string; sourceRoot?: string; processing?: ProcessingLedgerStore; onCancelled?(owner: number): void; onSource?(owner: number, input: { sha256: string; name: string; mime: string; bytes: number; storage: 'in-place' | 'private-copy'; locator: string; videoOcr: boolean }): void; onProcessed?(owner: number, sha256: string, processor: string, coverage: string, ok: boolean): void; access(): MediaAccess; decode?: typeof decodeInWorker; recognize?: typeof windowsRecognize; runCommand?: typeof runMediaCommand; fetchImpl?: typeof fetch }) {
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
        try {
          // Same-volume hard-link creation is atomic and never overwrites an
          // existing immutable source. The temporary name is removed after.
          await link(temporary, destination); await rm(temporary, { force: true })
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
          const existing = await copyOrHashStable(destination, null, signal)
          if (existing.bytes !== identity.bytes || existing.sha256 !== identity.sha256) throw Error('A conflicting private source copy already exists. It was preserved for review.')
          await rm(temporary, { force: true })
        }
        usePath = destination
      } catch (error) { try { await rm(temporary, { force: true }) } catch {}; throw error }
    } else identity = await copyOrHashStable(path, null, signal)
    const handle = randomUUID(), consequence = input.storage === 'private-copy' ? 'Verified private copy kept in app data and included in app-data backup; sending also retains a turn copy.' : 'Processed from its current location. Move/delete makes later reprocessing unavailable; sending retains a verified turn copy.'
    options.onSource?.(owner, { sha256: identity.sha256, name: input.name, mime: input.mime, bytes: identity.bytes, storage: input.storage, locator: usePath, videoOcr: input.videoOcr === true })
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
  const decodeLocalPath = async (name: string, path: string, source: MediaSourceHandle, range: MediaRange | undefined, videoOcr: boolean, videoFrameBudget: number, signal: AbortSignal): Promise<MediaResult> => {
    const sourceFile = await open(path, 'r'), head = Buffer.alloc(1024 * 1024)
    let read = 0, documentBytes: Buffer | null = null, format!: ReturnType<typeof mediaKind>
    try {
      const before = await sourceFile.stat(), namedBefore = await lstat(path)
      if (!before.isFile() || before.size !== source.bytes || namedBefore.isSymbolicLink() || !same(namedBefore, before)) throw Error('The selected source changed before decoding. Reattach it; nothing was used.')
      read = (await sourceFile.read(head, 0, head.length, 0)).bytesRead; format = mediaKind(head.subarray(0, read))
      if (format.mime === 'video/mp4' && head.subarray(0, read).includes(Buffer.from('pssh'))) throw Error('This media appears DRM-protected. Decryption is not supported.')
      if (format.kind === 'document' || format.kind === 'image') {
        const memoryBudget = Math.max(16 * 1024 * 1024, Math.floor(freemem() / 4))
        if (source.bytes > memoryBudget) throw Error(`This document decoder needs one private memory buffer, but the current safe memory budget is ${memoryBudget.toLocaleString()} bytes. Choose a page-range export or retry with more free memory; nothing was clipped.`)
        documentBytes = Buffer.allocUnsafe(source.bytes); let position = 0
        while (position < documentBytes.length) {
          if (signal.aborted) throw Error('Cancelled.')
          const part = await sourceFile.read(documentBytes, position, Math.min(1024 * 1024, documentBytes.length - position), position)
          if (!part.bytesRead) break
          position += part.bytesRead
        }
        const after = await sourceFile.stat(), namedAfter = await lstat(path)
        if (position !== source.bytes || !same(before, after) || !same(after, namedAfter) || createHash('sha256').update(documentBytes).digest('hex') !== source.sha256) throw Error('The selected source changed while decoding. No result was kept.')
      }
    } finally { await sourceFile.close() }
    if (documentBytes) {
      const result = await (options.decode || decodeInWorker)(name, documentBytes, signal, range)
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
      const transcript: string[] = [], transcriptSegments: NonNullable<MediaResult['segments']> = [], audioMap: MediaAudioWindow[] = [], diagnostics: NonNullable<MediaResult['diagnostics']> = []; let recognizedWords = 0
      let pauses: Array<{ start: number; end: number; duration: number }> = []
      if (details.audio) {
        try {
          const pauseMetadata = (await runCommand(prefs.ffmpeg || 'ffmpeg', [...common, '-ss', String(start), ...inputArgs, '-t', String(selectedDuration), '-vn', '-af', 'silencedetect=noise=-35dB:d=0.3,ametadata=mode=print:file=-', '-f', 'null', '-'], signal, Math.max(90_000, selectedDuration * 500), 4_000_000)).toString('utf8')
          pauses = pauseIntervals(pauseMetadata, start)
          diagnostics.push({ area: 'pauses', status: pauses.length ? 'complete' : 'empty', message: pauses.length ? `Measured ${pauses.length} pause interval(s) across the selected audio.` : 'Pause measurement completed and found no interval at least 0.3 seconds below -35 dB.' })
        } catch {
          diagnostics.push({ area: 'pauses', status: 'failed', message: 'FFmpeg pause measurement failed. Transcript coverage remains separate and no empty result was implied.' })
        }
      }
      let previousRecognition = ''
      if (details.audio) for (const [index, window] of transcriptWindows(start, end, pauses).entries()) {
        const decodeDuration = window.end - window.decodeStart, logicalDuration = window.end - window.start, wav = join(temp, `audio-${index}.wav`)
        await runCommand(prefs.ffmpeg || 'ffmpeg', [...common, '-ss', String(window.decodeStart), ...inputArgs, '-t', String(decodeDuration), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], signal, Math.max(90_000, decodeDuration * 2_000))
        let recognized = ''
        try { recognized = (await recognize(prefs.language, signal, wav)).trim() } catch (error) { if (!/No speech was recognized/.test((error as Error).message)) throw error }
        if (window.decodeStart < window.start && recognized) recognized = dedupeRecognition(previousRecognition, recognized)
        const words = recognized.split(/\s+/).filter(Boolean).length, shown = recognized || '[No speech recognized in this interval.]', label = `${clock(window.start)}–${clock(window.end)} · speaker unassigned`
        previousRecognition = `${previousRecognition} ${recognized}`.trim().split(/\s+/).slice(-60).join(' ')
        recognizedWords += words; transcript.push(`[${label}]\n${shown}`); transcriptSegments.push({ id: `transcript-${String(index + 1).padStart(4, '0')}`, label, text: shown })
        audioMap.push({ start: window.start, end: window.end, speaker: 'unassigned', words, paceWpm: logicalDuration ? words / logicalDuration * 60 : 0, pauseCount: 0, pauseSeconds: 0 })
        await rm(wav, { force: true })
      }
      let acoustic = 'No audio stream was present.'
      if (details.audio) {
        let rmsValues: number[] = []
        try {
          const rmsOutput = (await runCommand(prefs.ffmpeg || 'ffmpeg', [...common, '-ss', String(start), ...inputArgs, '-t', String(selectedDuration), '-vn', '-af', 'aresample=16000,asetnsamples=n=16000:p=1,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-', '-f', 'null', '-'], signal, Math.max(90_000, selectedDuration * 500), 4_000_000)).toString(), rmsTimeline = [...rmsOutput.matchAll(/lavfi\.astats\.Overall\.RMS_level=([^\r\n]+)/g)].map(match => { const value = Number(match[1]); return Number.isFinite(value) ? value : null })
          rmsValues = rmsTimeline.filter((value): value is number => value !== null)
          for (const window of audioMap) {
            const first = Math.max(0, Math.floor(window.start - start)), last = Math.min(rmsTimeline.length, Math.ceil(window.end - start)), values = rmsTimeline.slice(first, last).filter((value): value is number => value !== null)
            if (values.length) { window.rmsAverageDb = values.reduce((sum, value) => sum + value, 0) / values.length; window.rmsMinimumDb = Math.min(...values); window.rmsMaximumDb = Math.max(...values) }
          }
          diagnostics.push({ area: 'audio-levels', status: rmsValues.length ? 'complete' : 'empty', message: rmsValues.length ? `Measured ${rmsValues.length} one-second RMS window(s).` : 'Audio-level measurement completed but returned no stable finite RMS value.' })
          acoustic = rmsValues.length ? `Measured one-second RMS windows across the complete selected audio: average ${(rmsValues.reduce((a,b)=>a+b,0)/rmsValues.length).toFixed(1)} dB, range ${Math.min(...rmsValues).toFixed(1)} to ${Math.max(...rmsValues).toFixed(1)} dB.` : 'Audio was fully presented to the measurement pass, but no stable RMS values were returned.'
        } catch {
          diagnostics.push({ area: 'audio-levels', status: 'failed', message: 'FFmpeg audio-level measurement failed. Transcript coverage remains separate and no level result was implied.' })
          acoustic = 'Acoustic level measurement failed; transcript coverage remains separate.'
        }
        if (recognizedWords) acoustic += ` Overall recognized-word pace: ${(recognizedWords / selectedDuration * 60).toFixed(1)} words per minute across the selected duration, including pauses.`
        for (const window of audioMap) for (const pause of pauses) { const overlap = Math.max(0, Math.min(window.end, pause.end) - Math.max(window.start, pause.start)); if (overlap > 0) { window.pauseCount++; window.pauseSeconds += overlap } }
        const pauseStatus = diagnostics.find(item => item.area === 'pauses')?.status
        if (pauseStatus === 'failed') acoustic += ' Pause measurement failed; no absence of pauses is claimed.'
        else if (pauses.length) acoustic += ` Pause evidence below -35 dB: ${pauses.length} interval(s), ${pauses.reduce((sum, value) => sum + value.duration, 0).toFixed(1)} seconds total, longest ${Math.max(...pauses.map(value => value.duration)).toFixed(1)} seconds.`
        else acoustic += ' No pause interval of at least 0.3 seconds was returned below the fixed -35 dB threshold.'
        acoustic += ' Interval measurements support delivery, pacing and emphasis analysis but do not establish speaker identity, emotion, intent or pitch contour.'
        transcriptSegments.unshift({ id: 'audio-delivery-summary', label: 'Complete audio delivery measurements', text: acoustic })
      }
      const images: NonNullable<MediaResult['images']> = [], visualEvidence: NonNullable<MediaResult['visualEvidence']> = []
      let sceneMap: NonNullable<MediaResult['sceneMap']> = []
      if (format.kind === 'video') {
        let scenes: Array<{ at: number; score: number }> = []
        try {
          // A low-resolution local pass scores visual changes. It processes the
          // stream deterministically; no frame is uploaded or treated as model
          // context. The bounded adaptive retained frames are chosen from this map.
          const metadata = await runCommand(prefs.ffmpeg || 'ffmpeg', [...common, '-ss', String(start), ...inputArgs, '-t', String(selectedDuration), '-an', '-vf', "fps=2,scale=320:-2,select='gt(scene,0.12)',metadata=print:file=-", '-f', 'null', '-'], signal, Math.max(90_000, selectedDuration * 250), 4_000_000)
          scenes = parseSceneMetadata(metadata.toString('utf8')).map(item => ({ ...item, at: item.at + start }))
          diagnostics.push({ area: 'scene-changes', status: scenes.length ? 'complete' : 'empty', message: scenes.length ? `Measured ${scenes.length} scene-change candidate(s) across the selected video.` : 'Scene-change measurement completed and found no change above the fixed threshold.' })
        } catch {
          scenes = []
          diagnostics.push({ area: 'scene-changes', status: 'failed', message: 'FFmpeg scene-change measurement failed. Overview frames still span the complete selected video.' })
        }
        sceneMap = scenes.slice(0, 10_000)
        // Even a short clip needs beginning/middle/end visual evidence. Longer
        // material grows toward the reviewed route's budget; it never falls to
        // one frame merely because its duration is under two minutes.
        const wanted = Math.min(videoFrameBudget, Math.max(Math.min(3, videoFrameBudget), Math.ceil(selectedDuration / 120)))
        const planned = adaptiveFramePoints(selectedDuration, scenes.map(item => ({ at: item.at - start, score: item.score })), wanted)
        let adapterIdentity: { bytes: number; sha256: string } | null = null
        if (videoOcr) {
          if (!prefs.ocrAdapter || !prefs.ocrAdapterSha256) throw Error('Video OCR was requested, but no reviewed DeepSeek-OCR-2 adapter is configured. Choose it in Voice & attachments, then retry.')
          adapterIdentity = await copyOrHashStable(prefs.ocrAdapter, null, signal)
          if (adapterIdentity.sha256 !== prefs.ocrAdapterSha256) throw Error('The selected OCR adapter changed since review. Choose it again; no video OCR was accepted.')
        }
        for (const [index, point] of planned.entries()) {
          const file = join(temp, `frame-${index}.jpg`), absolute = start + point.at
          await runCommand(prefs.ffmpeg || 'ffmpeg', [...common, '-ss', String(absolute), ...inputArgs, '-frames:v', '1', '-vf', 'scale=1280:1280:force_original_aspect_ratio=decrease', '-q:v', '3', file], signal)
          const data = await readFile(file); if (data.length > 2 * 1024 * 1024) throw Error('Decoded frame exceeds the 2 MB engine-image safety limit.')
          const frame = `${name}-${clock(absolute)}.jpg`, evidence: NonNullable<MediaResult['visualEvidence']>[number] = { at: absolute, reason: point.reason, score: point.score, frame }
          if (videoOcr) {
            const raw = await runCommand(prefs.ocrAdapter, ['--oddbrain-process', file, '--json'], signal, 10 * 60_000, 1_000_000)
            let output: any
            try { output = JSON.parse(raw.toString('utf8')) } catch { throw Error(`OCR-2 returned unreadable output for ${clock(absolute)}. No video OCR result was accepted.`) }
            if (typeof output?.text !== 'string' || output.text.length > 100_000 || typeof output.coverage !== 'string' || output.coverage.length > 2000) throw Error(`OCR-2 did not return bounded text with coverage for ${clock(absolute)}. No video OCR result was accepted.`)
            evidence.ocr = output.text.trim()
          }
          visualEvidence.push(evidence); images.push({ name: frame, mime: 'image/jpeg', data: data.toString('base64') })
        }
        if (adapterIdentity) {
          const confirmed = await copyOrHashStable(prefs.ocrAdapter, null, signal)
          if (confirmed.bytes !== adapterIdentity.bytes || confirmed.sha256 !== adapterIdentity.sha256) throw Error('The OCR adapter changed while processing video frames. Its output was not accepted.')
        }
      }
      if (!transcript.length && !images.length) throw Error('No audio or video content could be decoded from this container.')
      const coverage = range ? `${clock(start)}–${clock(end)} of ${clock(details.duration)}` : `the complete ${clock(details.duration)} duration`
      const visualText = visualEvidence.length ? `\n\nAdaptive visual evidence:\n${visualEvidence.map(item => `[${clock(item.at)}] ${item.reason === 'scene-change' ? `scene change score ${item.score.toFixed(3)}` : 'overview'}${item.ocr ? `\nOn-screen text from configured OCR-2 (unconfirmed): ${item.ocr}` : ''}`).join('\n')}` : ''
      const timelineText = `${format.kind === 'video' ? 'Video' : 'Audio'} coverage: ${coverage}.\n${acoustic}\n\n${transcript.join('\n\n')}${visualText}`
      if (!transcriptSegments.length) transcriptSegments.push({ id: 'media-overview', label: `Complete ${format.kind} overview`, text: `${format.kind === 'video' ? 'No recognized speech was available. ' : ''}${acoustic}${visualText}`.trim() })
      const failedDiagnostics = diagnostics.filter(item => item.status === 'failed')
      const disclosure = `Local full-duration timeline for ${coverage}; ${transcript.length ? 'speech used silence-aware intervals up to about 60 seconds, with a small overlap and exact word-sequence deduplication where no suitable pause existed; speaker remains unassigned because the current local recognizer does not diarize' : 'no timestamped speech text was returned, so visual evidence remains separate from any unheard words'}. One-second signal measurements were aggregated into the same intervals. A two-frame-per-second local scene-change pass planned ${images.length} initial visual evidence frame(s); they are samples, not continuous model vision.${failedDiagnostics.length ? ` ${failedDiagnostics.length} measurement pass(es) failed visibly and were not represented as empty evidence.` : ''} The AI can inspect retained frames and retrieve new question-driven timestamps without loading the whole video into model context.${videoOcr ? ' The existing reviewed DeepSeek-OCR-2 adapter read only the owner-approved selected frames; its derived text remains unconfirmed.' : ''}`
      const result: MediaResult = { ok: true, name, textComplete: true, ...(timelineText.length <= 12_000 ? { text: timelineText } : {}), segments: transcriptSegments, diagnostics, disclosure }
      const confirmed = await copyOrHashStable(path, null, signal)
      if (confirmed.bytes !== source.bytes || confirmed.sha256 !== source.sha256) throw Error('The selected source changed during media processing. No result was kept.')
      return { ...result, images, visualEvidence, sceneMap, audioMap, time: { read: selectedDuration, total: details.duration, unit: 'seconds' }, textComplete: !range || start === 0 && end === details.duration, source }
    } finally { await rm(temp, { recursive: true, force: true }) }
  }
  const extractEvidence = async (path: string, moments: number[], videoOcr = false, externalSignal?: AbortSignal): Promise<{ sha256: string; duration: number; images: NonNullable<MediaResult['images']>; audio: Array<{ at: number; mime: string; data: string }>; visualEvidence: NonNullable<MediaResult['visualEvidence']> }> => {
    if (!Array.isArray(moments) || moments.length < 1 || moments.length > 6 || moments.some(at => !Number.isFinite(at) || at < 0)) throw Error('Choose 1–6 valid video timestamps for question-driven evidence.')
    const controller = new AbortController(), signal = externalSignal ? AbortSignal.any([controller.signal, externalSignal]) : controller.signal
    const identity = await copyOrHashStable(path, null, signal), sourceFile = await open(path, 'r'), head = Buffer.alloc(1024 * 1024)
    let format!: ReturnType<typeof mediaKind>
    try { const read = (await sourceFile.read(head, 0, head.length, 0)).bytesRead; format = mediaKind(head.subarray(0, read)) } finally { await sourceFile.close() }
    if (format.kind !== 'video') throw Error('Question-driven frame retrieval needs a verified video source.')
    const prefs = { ...preferences }, details = await probe(path, prefs.ffmpeg, format.mime, signal, runCommand)
    const latestFrame = Math.max(0, details.duration - Math.min(0.001, details.duration / 2))
    const points = [...new Set(moments.map(at => Math.min(latestFrame, Math.max(0, Math.round(at * 1000) / 1000))))]
    const temp = await (await import('node:fs/promises')).mkdtemp(join(tmpdir(), 'oddbrain-question-evidence-'))
    const images: NonNullable<MediaResult['images']> = [], audio: Array<{ at: number; mime: string; data: string }> = [], visualEvidence: NonNullable<MediaResult['visualEvidence']> = []
    let adapterIdentity: { bytes: number; sha256: string } | null = null
    try {
      if (videoOcr) {
        if (!prefs.ocrAdapter || !prefs.ocrAdapterSha256) throw Error('Question-driven OCR was requested, but the reviewed DeepSeek-OCR-2 adapter is not configured.')
        adapterIdentity = await copyOrHashStable(prefs.ocrAdapter, null, signal)
        if (adapterIdentity.sha256 !== prefs.ocrAdapterSha256) throw Error('The OCR-2 adapter changed since review. Choose it again.')
      }
      const common = ['-hide_banner', '-loglevel', 'error', '-nostdin'], inputArgs = ['-max_alloc', '134217728', '-threads', '2', '-protocol_whitelist', 'file,pipe', ...(demuxer(format.mime) ? ['-f', demuxer(format.mime)!] : []), ...(format.mime === 'video/mp4' ? ['-enable_drefs', '0', '-use_absolute_path', '0'] : []), '-i', path]
      for (const [index, at] of points.entries()) {
        const file = join(temp, `question-${index}.jpg`)
        await runCommand(prefs.ffmpeg || 'ffmpeg', [...common, '-ss', String(at), ...inputArgs, '-frames:v', '1', '-vf', 'scale=1280:1280:force_original_aspect_ratio=decrease', '-q:v', '3', file], signal)
        const data = await readFile(file); if (data.length > 2 * 1024 * 1024) throw Error('A retrieved evidence frame exceeds the 2 MB engine-image safety limit.')
        const frame = `${basename(path)}-${clock(at)}-question.jpg`, evidence: NonNullable<MediaResult['visualEvidence']>[number] = { at, reason: 'question', score: 0, frame }
        if (adapterIdentity) {
          const raw = await runCommand(prefs.ocrAdapter, ['--oddbrain-process', file, '--json'], signal, 10 * 60_000, 1_000_000)
          const output = JSON.parse(raw.toString('utf8'))
          if (typeof output?.text !== 'string' || output.text.length > 100_000 || typeof output.coverage !== 'string' || output.coverage.length > 2000) throw Error(`OCR-2 returned invalid output for ${clock(at)}.`)
          evidence.ocr = output.text.trim()
        }
        images.push({ name: frame, mime: 'image/jpeg', data: data.toString('base64') }); visualEvidence.push(evidence)
        if (details.audio) {
          const wav = join(temp, `question-${index}.wav`), clipStart = Math.max(0, at - 2), clipDuration = Math.min(4, details.duration - clipStart)
          await runCommand(prefs.ffmpeg || 'ffmpeg', [...common, '-ss', String(clipStart), ...inputArgs, '-t', String(clipDuration), '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], signal)
          const sound = await readFile(wav)
          if (sound.length > 300_000) throw Error('A retrieved audio evidence window exceeds the 300 KB safety limit.')
          audio.push({ at, mime: 'audio/wav', data: sound.toString('base64') })
        }
      }
      const confirmed = await copyOrHashStable(path, null, signal)
      if (confirmed.bytes !== identity.bytes || confirmed.sha256 !== identity.sha256) throw Error('The video changed while extra evidence was being retrieved. Nothing was accepted.')
      if (adapterIdentity) {
        const confirmedAdapter = await copyOrHashStable(prefs.ocrAdapter, null, signal)
        if (confirmedAdapter.sha256 !== adapterIdentity.sha256 || confirmedAdapter.bytes !== adapterIdentity.bytes) throw Error('The OCR-2 adapter changed while retrieving evidence. Nothing was accepted.')
      }
      return { sha256: identity.sha256, duration: details.duration, images, audio, visualEvidence }
    } finally { await rm(temp, { recursive: true, force: true }) }
  }
  return {
    extractEvidence,
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
      if (!input || typeof path !== 'string' || !path || typeof input.name !== 'string' || !input.name || input.name !== basename(input.name) || /[\x00-\x1f]/.test(input.name) || input.name.length > 240 || !Number.isSafeInteger(input.size) || input.size < 1 || !['local','provider','transcribe','ocr'].includes(input.route) || !['in-place','private-copy'].includes(input.storage) || (input.videoOcr !== undefined && typeof input.videoOcr !== 'boolean') || (input.videoFrameBudget !== undefined && (!Number.isInteger(input.videoFrameBudget) || input.videoFrameBudget < 1 || input.videoFrameBudget > 12))) throw Error('The selected-file request is invalid.')
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
        } else result = await decodeLocalPath(input.name, staged.path, staged.source, input.range, input.videoOcr === true, input.videoFrameBudget || 3, signal)
        const coverage = result.disclosure || 'Processor returned usable output without a coverage note.'
        if (staged.jobId && options.processing && claimedStart !== null) {
          options.processing.finish(staged.jobId, claimedStart, { state: 'done', output: coverage, usage: input.route === 'local' || input.route === 'ocr' ? { localSeconds: Math.max(1, (Date.now() - startedAt) / 1000) } : {} })
        }
        options.onProcessed?.(owner, staged.source.sha256, processor, coverage, true)
        return result
      } catch (error) {
        handles.delete(staged.source.handle)
        if (staged.jobId && options.processing && claimedStart !== null) try { options.processing.finish(staged.jobId, claimedStart, { state: 'blocked', error: (error as Error).message, usage: input.route === 'local' || input.route === 'ocr' ? { localSeconds: Math.max(0, (Date.now() - startedAt) / 1000) } : {} }) } catch {}
        options.onProcessed?.(owner, staged.source.sha256, processor, (error as Error).message, false); throw error
      }
    }),
  }
}
