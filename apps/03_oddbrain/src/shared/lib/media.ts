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
export const MAX_ENGINE_IMAGE_CHARS = 2 * 1024 * 1024 * 4 // 2 MB × (4/3) ≈ 2.7M

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
