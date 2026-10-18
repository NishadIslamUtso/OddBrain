/**
 * Media helpers the app owns.
 *
 * The media rule (his, 2026-10-16): pictures, voice and video work no matter
 * which engine is chosen. What the machine can do natively is used as-is; what
 * it cannot, the app does itself. Everything here is pure or honestly guarded,
 * so a machine without a microphone gets a working button that says so, never
 * a broken promise.
 */

/** MIME types an attachment may carry to an engine. Mirrors the chat reader. */
export const ENGINE_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const

export const MAX_ENGINE_ATTACHMENTS = 4
/** Base64 image budget per attachment: 2 MB decoded, including expansion. */
export const MAX_ENGINE_IMAGE_CHARS = Math.ceil((2 * 1024 * 1024 * 4) / 3)
/** One selected-provider audio file: bounded before it becomes a base64 request. */
export const MAX_AUDIO_BYTES = 6 * 1024 * 1024
export const MAX_AUDIO_BASE64_CHARS = Math.ceil((MAX_AUDIO_BYTES * 4) / 3)
export const MAX_AUDIO_DURATION_SECONDS = 90
export type SupportedAudioFormat = 'wav' | 'mp3'

export type AudioInfo = {
  format: SupportedAudioFormat
  durationSeconds: number
  sampleRate: number
  channels: number
}

function audioContainerError(detail: string): never {
  throw new Error(`${detail} The file may be corrupt, encrypted, or DRM-protected; nothing was sent.`)
}

/** Validate container structure and duration before asking the browser decoder to allocate PCM. */
export function inspectAudioBytes(bytes: Uint8Array, format: SupportedAudioFormat): AudioInfo {
  if (!bytes.length || bytes.byteLength > MAX_AUDIO_BYTES) {
    audioContainerError('The audio file is empty or exceeds the 6 MB limit.')
  }
  return format === 'wav' ? inspectWave(bytes) : inspectMp3(bytes)
}

function inspectWave(bytes: Uint8Array): AudioInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ascii = (offset: number, length: number): string => String.fromCharCode(...bytes.subarray(offset, offset + length))
  if (bytes.byteLength < 44 || ascii(0, 4) !== 'RIFF' || ascii(8, 4) !== 'WAVE') {
    audioContainerError('This is not a readable WAV container.')
  }
  const riffEnd = view.getUint32(4, true) + 8
  if (riffEnd > bytes.byteLength || riffEnd < 12) audioContainerError('The WAV length is inconsistent.')

  let formatTag = 0
  let channels = 0
  let sampleRate = 0
  let byteRate = 0
  let blockAlign = 0
  let bitsPerSample = 0
  let dataBytes = 0
  for (let offset = 12; offset + 8 <= riffEnd;) {
    const chunkName = ascii(offset, 4)
    const chunkLength = view.getUint32(offset + 4, true)
    const chunkStart = offset + 8
    const chunkEnd = chunkStart + chunkLength
    if (chunkEnd > riffEnd || chunkEnd < chunkStart) audioContainerError('The WAV chunk lengths are inconsistent.')
    if (chunkName === 'fmt ') {
      if (chunkLength < 16) audioContainerError('The WAV format header is incomplete.')
      formatTag = view.getUint16(chunkStart, true)
      channels = view.getUint16(chunkStart + 2, true)
      sampleRate = view.getUint32(chunkStart + 4, true)
      byteRate = view.getUint32(chunkStart + 8, true)
      blockAlign = view.getUint16(chunkStart + 12, true)
      bitsPerSample = view.getUint16(chunkStart + 14, true)
      if (formatTag === 0xfffe) {
        if (chunkLength < 40 || view.getUint16(chunkStart + 16, true) < 22) {
          audioContainerError('The extensible WAV format record is incomplete.')
        }
        const subFormat = view.getUint32(chunkStart + 24, true)
        const guidTail = Array.from(bytes.subarray(chunkStart + 28, chunkStart + 40))
        const expectedGuidTail = [0, 0, 16, 0, 128, 0, 0, 170, 0, 56, 155, 113]
        if (guidTail.some((value, index) => value !== expectedGuidTail[index]) || (subFormat !== 1 && subFormat !== 3)) {
          audioContainerError('This WAV codec is compressed or unsupported.')
        }
        formatTag = subFormat
      }
    } else if (chunkName === 'data') {
      dataBytes += chunkLength
    }
    offset = chunkEnd + (chunkLength & 1)
  }

  if ((formatTag !== 1 && formatTag !== 3) || channels < 1 || channels > 2 || sampleRate < 8_000 || sampleRate > 48_000) {
    audioContainerError('Only uncompressed mono/stereo PCM or float WAV at up to 48 kHz is supported.')
  }
  const validPcmBits = formatTag === 1 ? [8, 16, 24, 32].includes(bitsPerSample) : [32, 64].includes(bitsPerSample)
  const expectedAlign = channels * (bitsPerSample / 8)
  if (!validPcmBits || blockAlign !== expectedAlign || byteRate !== sampleRate * blockAlign || !dataBytes || dataBytes % blockAlign !== 0) {
    audioContainerError('The WAV data does not match its format header.')
  }
  const durationSeconds = dataBytes / byteRate
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > MAX_AUDIO_DURATION_SECONDS) {
    audioContainerError(`Audio longer than ${MAX_AUDIO_DURATION_SECONDS} seconds is not supported here.`)
  }
  return { format: 'wav', durationSeconds, sampleRate, channels }
}

const MP3_BITRATES_MPEG1_LAYER3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
const MP3_BITRATES_MPEG2_LAYER3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
const MPEG_SAMPLE_RATES = [44_100, 48_000, 32_000]

function inspectMp3(bytes: Uint8Array): AudioInfo {
  let offset = 0
  if (bytes.byteLength >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    if (bytes.byteLength < 10 || bytes.subarray(6, 10).some(value => (value & 0x80) !== 0)) {
      audioContainerError('The MP3 metadata header is malformed.')
    }
    const tagBytes = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]
    offset = 10 + tagBytes + ((bytes[5] & 0x10) !== 0 ? 10 : 0)
    if (offset >= bytes.byteLength) audioContainerError('The MP3 has metadata but no audio frames.')
  }
  const hasId3v1 = bytes.byteLength >= 128 && bytes[bytes.byteLength - 128] === 0x54 &&
    bytes[bytes.byteLength - 127] === 0x41 && bytes[bytes.byteLength - 126] === 0x47
  const audioEnd = bytes.byteLength - (hasId3v1 ? 128 : 0)
  let version = -1
  let sampleRate = 0
  let channels = 0
  let frameCount = 0
  let frameSamples = 0

  while (offset + 4 <= audioEnd) {
    const first = bytes[offset]
    const second = bytes[offset + 1]
    const third = bytes[offset + 2]
    const fourth = bytes[offset + 3]
    const versionBits = (second >> 3) & 0x03
    const layerBits = (second >> 1) & 0x03
    const bitrateIndex = (third >> 4) & 0x0f
    const sampleIndex = (third >> 2) & 0x03
    if (first !== 0xff || (second & 0xe0) !== 0xe0 || versionBits === 1 || layerBits !== 1 ||
      bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3) {
      audioContainerError('The MP3 frame stream is malformed or uses an unsupported codec.')
    }
    const rateBase = MPEG_SAMPLE_RATES[sampleIndex]
    const rate = versionBits === 3 ? rateBase : versionBits === 2 ? rateBase / 2 : rateBase / 4
    const bitrate = (versionBits === 3 ? MP3_BITRATES_MPEG1_LAYER3 : MP3_BITRATES_MPEG2_LAYER3)[bitrateIndex] * 1_000
    if (!bitrate || rate > 48_000 || rate < 8_000) audioContainerError('The MP3 bitrate or sample rate is not supported.')
    const frameLength = Math.floor((versionBits === 3 ? 144 : 72) * bitrate / rate) + ((third >> 1) & 1)
    if (frameLength < 4 || offset + frameLength > audioEnd) audioContainerError('The MP3 frame is truncated.')
    const frameChannels = ((fourth >> 6) & 0x03) === 3 ? 1 : 2
    if (frameCount && (version !== versionBits || sampleRate !== rate || channels !== frameChannels)) {
      audioContainerError('The MP3 changes codec or sample rate mid-stream.')
    }
    version = versionBits
    sampleRate = rate
    channels = frameChannels
    frameSamples = versionBits === 3 ? 1_152 : 576
    frameCount += 1
    const seconds = frameCount * frameSamples / sampleRate
    if (seconds > MAX_AUDIO_DURATION_SECONDS) {
      audioContainerError(`Audio longer than ${MAX_AUDIO_DURATION_SECONDS} seconds is not supported here.`)
    }
    offset += frameLength
  }
  if (!frameCount || offset !== audioEnd) {
    audioContainerError('The MP3 is empty or has trailing data the decoder cannot verify.')
  }
  return { format: 'mp3', durationSeconds: frameCount * frameSamples / sampleRate, sampleRate, channels }
}

/**
 * Where to seek in a video when pulling still frames.
 * Evenly spread, never at the very first or last pixel (black frames live
 * there), at least one frame when the video is shorter than the ask.
 */
export function framePoints(durationSeconds: number, count = 4): number[] {
  const duration = Number.isFinite(durationSeconds) ? Math.max(durationSeconds, 0) : 0
  if (duration <= 0 || count <= 0) return []
  if (count === 1) return [duration / 2]
  const first = duration * 0.08
  const last = duration * 0.92
  const step = (last - first) / (count - 1)
  return Array.from({ length: count }, (_, index) => first + step * index)
}

/** True when this browser window can listen (Chromium's speech recognition). */
export function dictationSupported(scope: { webkitSpeechRecognition?: unknown } = globalThis as never): boolean {
  return typeof scope.webkitSpeechRecognition === 'function'
}

/** True when this browser window can speak aloud (the speech synthesis API). */
export function ttsSupported(scope: { speechSynthesis?: unknown } = globalThis as never): boolean {
  return typeof scope.speechSynthesis === 'object' && scope.speechSynthesis !== null
}
