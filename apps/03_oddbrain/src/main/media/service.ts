import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { readRecoverableJson, writeRecoverableJson } from '../recoverableJson'
import { tmpdir } from 'node:os'
import { DEFAULT_MEDIA, MAX_MEDIA_BYTES, normalizeMedia, type MediaInput, type MediaPreferences, type MediaResult } from '../../shared/lib/mediaBridge'
import { decodeInWorker } from './workerClient'
import { providerDecode, providerTarget, type MediaAccess } from './provider'
import { extracted } from './documents'
import { windowsRecognize } from './windowsSpeech'
import { mediaKind } from './formats'
import { runMediaCommand } from './process'

export function createMediaService(options: { file: string; onCancelled?(owner: number): void; access(): MediaAccess; decode?: typeof decodeInWorker; fetchImpl?: typeof fetch }) {
  let preferences = { ...DEFAULT_MEDIA }
  try { preferences = readRecoverableJson(options.file, normalizeMedia, { ...DEFAULT_MEDIA }).value } catch { /* first use or unrecoverable owner file */ }
  const jobs = new Map<number, AbortController>()
  const recording = new Map<number, number>()
  const cancel = (owner: number): void => {
    const notify = recording.delete(owner) || (jobs.has(owner) && !jobs.get(owner)!.signal.aborted)
    jobs.get(owner)?.abort()
    if (notify) options.onCancelled?.(owner)
  }
  const cancelAll = (): void => { for (const owner of new Set([...jobs.keys(), ...recording.keys()])) cancel(owner) }
  const update = (patch: Partial<MediaPreferences>, native = false): MediaPreferences => {
    cancelAll()
    const proposed = { ...preferences, ...patch, ffmpeg: native || patch?.ffmpeg === '' ? patch.ffmpeg : preferences.ffmpeg }
    for (const [key, value] of Object.entries(proposed)) if (typeof value === 'string' && value.length > (key === 'ffmpeg' ? 4096 : 200)) throw Error('Media setting exceeds its saved limit. Nothing was shortened or changed.')
    const clean = normalizeMedia(proposed)
    writeRecoverableJson(options.file, clean)
    preferences = clean; return { ...clean }
  }
  const job = async (owner: number, name: string, run: (signal: AbortSignal) => Promise<MediaResult>): Promise<MediaResult> => {
    if (jobs.has(owner) || jobs.size >= 2) return { ok: false, name, error: 'Another media operation is running. Stop it or wait.' }
    const controller = new AbortController(); jobs.set(owner, controller)
    try { const result = await run(controller.signal); if (controller.signal.aborted) throw Error('Cancelled.'); return result }
    catch (error) { const message = controller.signal.aborted ? 'Cancelled.' : (error as Error).message; return { ok: false, name, error: message, fallbackAllowed: !/encrypted|password|DRM|cancelled/i.test(message) } }
    finally { jobs.delete(owner) }
  }
  return {
    canRecord: (owner: number): boolean => (recording.get(owner) || 0) > Date.now(),
    authorizeRecording: (owner: number, expected: { provider: string; model: string }): MediaResult => {
      try {
        if (jobs.has(owner)) throw Error('Another media operation is running.')
        if (preferences.dictation !== 'provider' || !expected || expected.provider !== preferences.transcriptionProvider || expected.model !== preferences.transcriptionModel || !expected.model) throw Error('Dictation provider/model changed or is not selected. Check Voice & files.')
        providerTarget(expected.provider, options.access())
        if (!['openai', 'groq', 'gemini', 'custom'].includes(expected.provider)) throw Error('This provider has no verified transcription adapter.')
        recording.set(owner, Date.now() + 65_000)
        return { ok: true, name: 'Microphone' }
      } catch (error) { return { ok: false, name: 'Microphone', error: (error as Error).message } }
    },
    read: (): MediaPreferences => ({ ...preferences }), update, cancel, cancelAll,
    dictate: (owner: number): Promise<MediaResult> => job(owner, 'Dictation', async signal => {
      if (!options.access().permissions.local) throw Error('Local inference is disabled. The microphone was not opened.')
      return extracted('Dictation', await windowsRecognize(preferences.language, signal), 'Offline Windows speech recognition. Check the transcript before sending.')
    }),
    decode: (owner: number, input: MediaInput): Promise<MediaResult> => job(owner, typeof input?.name === 'string' ? input.name.slice(0, 200) : 'Attachment', async signal => {
      if (!input || typeof input.name !== 'string' || !input.name || /[\x00-\x1f]/.test(input.name) || input.name.length > 240 || !(input.bytes instanceof Uint8Array) || !input.bytes.length || input.bytes.length > MAX_MEDIA_BYTES) throw Error('File is empty, invalid or larger than 50 MB. Nothing was decoded or sent.')
      if (!['local', 'provider', 'transcribe'].includes(input.route)) throw Error('Invalid media operation.')
      recording.delete(owner)
      const prefs = { ...preferences }
      if (input.route !== 'local') return providerDecode(input, prefs, options.access(), signal, options.fetchImpl)
      const format = mediaKind(input.bytes)
      if (format.kind === 'document' || format.kind === 'image') { const result = await (options.decode || decodeInWorker)(input.name, input.bytes, signal); if (!result.ok) throw Error(result.error || 'Decoding failed.'); return result }
      const buffer = Buffer.from(input.bytes)
      if (format.mime === 'video/mp4' && buffer.includes(Buffer.from('pssh'))) throw Error('This media appears DRM-protected. Decryption is not supported.')
      const temp = await mkdtemp(join(tmpdir(), 'oddbrain-media-'))
      try {
        const source = join(temp, 'source.bin'); await writeFile(source, buffer, { mode: 0o600 })
        const demuxer: Record<string, string> = { 'video/mp4': 'mov', 'video/webm': 'matroska', 'video/x-msvideo': 'avi', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac', 'audio/mpeg': 'mp3', 'audio/aac': 'aac' }
        const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-max_alloc', '134217728', '-threads', '2', '-protocol_whitelist', 'file,pipe', '-f', demuxer[format.mime], ...(format.mime === 'video/mp4' ? ['-enable_drefs', '0', '-use_absolute_path', '0'] : []), '-i', source]
        if (format.kind === 'audio' || /^audio\//.test(input.mime) || /\.(m4a|weba)$/i.test(input.name)) {
          if (!options.access().permissions.local) throw Error('Local inference is disabled.')
          const wav = join(temp, 'audio.wav')
          await runMediaCommand(prefs.ffmpeg || 'ffmpeg', [...args, '-t', '120', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav], signal)
          return extracted(input.name, await windowsRecognize(prefs.language, signal, wav), 'Local audio decode and offline speech recognition. At most the first 120 seconds were transcribed; check recognition errors. The original file was not changed.')
        }
        const frames = join(temp, 'frames'); await mkdir(frames)
        await runMediaCommand(prefs.ffmpeg || 'ffmpeg', [...args, '-t', '30', '-an', '-vf', 'fps=1/10:start_time=0:round=up:eof_action=pass,scale=1280:1280:force_original_aspect_ratio=decrease', '-frames:v', '3', '-q:v', '3', join(frames, 'frame-%02d.jpg')], signal)
        const images = await Promise.all((await readdir(frames)).filter(n => /^frame-\d+\.jpg$/.test(n)).sort().slice(0, 3).map(async name => { const data = await readFile(join(frames, name)); if (data.length > 2 * 1024 * 1024) throw Error('Decoded frame exceeds 2 MB.'); return { name: input.name + '-' + name, mime: 'image/jpeg', data: data.toString('base64') } }))
        if (!images.length) throw Error('No video frames could be decoded. The container/codec may be unsupported or corrupt.')
        return { ok: true, name: input.name, images, disclosure: `${images.length} sampled still frame(s), at ten-second sampling intervals within the first 30 seconds. This is not full video analysis. Audio was NOT transcribed. Use your selected transcription provider separately if needed.` }
      } finally { await rm(temp, { recursive: true, force: true }) }
    }),
  }
}
