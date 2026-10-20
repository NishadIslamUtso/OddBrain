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
export const MAX_ENGINE_IMAGE_BYTES = 2 * 1024 * 1024
/** Base64 ceiling for exactly the decoded-byte budget (rounded to a quartet). */
export const MAX_ENGINE_IMAGE_CHARS = Math.ceil(MAX_ENGINE_IMAGE_BYTES / 3) * 4

export type EngineImage = { mime: typeof ENGINE_IMAGE_MIMES[number]; data: string }
export type EngineImagesAnswer = { ok: true; images: EngineImage[] } | { ok: false; answer: string }

/** Validate the privileged IPC boundary without truncating or decoding a huge string. */
export function engineImages(input: unknown): EngineImagesAnswer {
  if (!Array.isArray(input)) return { ok: false, answer: 'Pictures must be sent as a list. Nothing was sent.' }
  if (input.length > MAX_ENGINE_ATTACHMENTS) return { ok: false, answer: `At most ${MAX_ENGINE_ATTACHMENTS} pictures can ride with one task. Nothing was silently dropped.` }
  const images: EngineImage[] = []
  for (const value of input) {
    const entry = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    const mime = entry.mime
    const data = entry.data
    if (typeof mime !== 'string' || !ENGINE_IMAGE_MIMES.includes(mime as EngineImage['mime']) || typeof data !== 'string') {
      return { ok: false, answer: 'One of the pictures is not a PNG, JPEG or WebP. Nothing was sent.' }
    }
    if (!data || data.length > MAX_ENGINE_IMAGE_CHARS || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) {
      return { ok: false, answer: 'One of the pictures is invalid or larger than 2 MB. Nothing was sent.' }
    }
    const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
    if ((data.length * 3) / 4 - padding > MAX_ENGINE_IMAGE_BYTES) {
      return { ok: false, answer: 'One of the pictures is invalid or larger than 2 MB. Nothing was sent.' }
    }
    images.push({ mime: mime as EngineImage['mime'], data })
  }
  return { ok: true, images }
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
