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
/** Base64 image budget per attachment: the reader's 2 MB decoded, as chars. */
export const MAX_ENGINE_IMAGE_BYTES = 2 * 1024 * 1024
export const MAX_ENGINE_IMAGE_CHARS = 4 * Math.ceil(MAX_ENGINE_IMAGE_BYTES / 3)
export const MAX_MEDIA_AUDIO_BYTES = 20 * 1024 * 1024
export const MAX_MEDIA_VIDEO_BYTES = 80 * 1024 * 1024
export const AUDIO_EXTENSIONS = /\.(?:mp3|wav|m4a|mp4|ogg|oga|flac|webm)$/i
export const VIDEO_EXTENSIONS = /\.(?:mp4|webm|mov|m4v)$/i

export type MediaOperation = 'audio' | 'image'
export type MediaProviderOption = { provider: string; label: string; model: string; operation: MediaOperation; endpoint?: string }
export type MediaImage = { mime: string; data: string }
export type MediaRequest = { provider: string; model: string; name: string; mime: string; data: string }
export type MediaVisualRequest = { provider: string; model: string; name: string; images: MediaImage[] }
export type MediaAnswer = { ok: boolean; text?: string; error?: string; provider?: string; model?: string }

/** Only known model families with a documented modality and a verified listing
 * are offered. A key alone or a model name guessed by the UI is not proof. */
export function mediaModelSupported(provider: string, operation: MediaOperation, model: string): boolean {
  if (operation === 'audio') {
    return provider === 'openai' ? /^(?:gpt-4o(?:-mini)?-transcribe(?:-diarize)?|whisper-1)$/.test(model)
      : provider === 'groq' && /^(?:whisper-large-v3(?:-turbo)?)$/.test(model)
  }
  return provider === 'anthropic' ? /^claude-(?:3(?:-|\.)|4(?:-|\.)|sonnet-|opus-|haiku-)/.test(model)
    : provider === 'openai' ? /^(?:gpt-4o(?:-|$)|gpt-4\.1(?:-|$)|gpt-5(?:-|$))/.test(model)
      : provider === 'gemini' && /^gemini-(?:1\.5|2\.|2\.5|3(?:\.|-))/.test(model)
}

/** Supported audio containers, checked by both the picker and the main IPC.
 * A matching filename alone is never proof that the bytes are decodable. */
export function audioMime(name: string, claimedType = ''): string | null {
  const extension = name.split('.').at(-1)?.toLowerCase()
  const types: Record<string, string> = {
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'audio/mp4',
    ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm',
  }
  if (!extension || !(extension in types)) return null
  // A browser may leave the MIME blank. Reject a contradictory MIME instead
  // of reading a video or HTML file labelled as a sound recording.
  if (claimedType && !/^audio\//.test(claimedType) &&
      !(extension === 'mp4' && claimedType === 'video/mp4') &&
      !(extension === 'webm' && claimedType === 'video/webm')) return null
  return types[extension]
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
