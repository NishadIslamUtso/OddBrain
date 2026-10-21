/**
 * Media helpers the app owns.
 *
 * Pictures, voice and video work independently of the selected chat engine.
 * Whole source files use main-process handles; byte arrays are only a bounded
 * compatibility transport and are not a universal file-size policy.
 */

export const ENGINE_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const MAX_ENGINE_ATTACHMENTS = 4
export const MAX_ENGINE_IMAGE_BYTES = 2 * 1024 * 1024
export const MAX_ENGINE_IMAGE_CHARS = Math.ceil(MAX_ENGINE_IMAGE_BYTES / 3) * 4
export const MAX_INLINE_SOURCE_BYTES = 8 * 1024 * 1024
export const MAX_INLINE_SOURCE_TOTAL = 32 * 1024 * 1024

export type EngineImage = { mime: typeof ENGINE_IMAGE_MIMES[number]; data: string }
export type EngineInlineSourceFile = { id: string; name: string; mime: string; data: Uint8Array }
export type EngineHandledSourceFile = { id: string; name: string; mime: string; handle: string; bytes: number; sha256: string; storage: 'in-place' | 'private-copy' }
export type EngineSourceFile = EngineInlineSourceFile | EngineHandledSourceFile
export type EngineImagesAnswer = { ok: true; images: EngineImage[] } | { ok: false; answer: string }
export type EngineSourceFilesAnswer = { ok: true; files: EngineSourceFile[] } | { ok: false; answer: string }

/** Validate original-source descriptors at the privileged boundary. Paths never cross from the renderer. */
export function engineSourceFiles(input: unknown): EngineSourceFilesAnswer {
  if (!Array.isArray(input)) return { ok: false, answer: 'Original attachments must be sent as a list. Nothing was sent.' }
  if (input.length > 8) return { ok: false, answer: 'At most eight original attachment files can be retained for one task. Nothing was silently dropped.' }
  const files: EngineSourceFile[] = []; let inlineTotal = 0
  for (const value of input) {
    const entry = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    if (typeof entry.id !== 'string' || !/^[a-zA-Z0-9_.:-]{1,256}$/.test(entry.id) || typeof entry.name !== 'string' || !entry.name || entry.name.length > 255 || /[\x00-\x1f]/.test(entry.name) || typeof entry.mime !== 'string' || entry.mime.length > 200 || /[\x00-\x1f]/.test(entry.mime)) return { ok: false, answer: 'One original attachment has invalid metadata. Nothing was sent.' }
    if (entry.data instanceof Uint8Array) {
      if (!entry.data.byteLength || entry.data.byteLength > MAX_INLINE_SOURCE_BYTES) return { ok: false, answer: 'One original attachment exceeds the bounded 8 MB renderer-memory transport. Reattach it through the desktop file picker so it can stream from disk; nothing was sent.' }
      inlineTotal += entry.data.byteLength
      if (inlineTotal > MAX_INLINE_SOURCE_TOTAL) return { ok: false, answer: 'Inline original bytes exceed the 32 MB renderer-memory queue. Reattach larger sources through desktop streaming; nothing was sent or shortened.' }
      files.push({ id: entry.id, name: entry.name, mime: entry.mime, data: new Uint8Array(entry.data) }); continue
    }
    if (typeof entry.handle !== 'string' || !/^[a-f0-9-]{36}$/.test(entry.handle) || !Number.isSafeInteger(entry.bytes) || Number(entry.bytes) < 1 || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) || !['in-place', 'private-copy'].includes(String(entry.storage))) return { ok: false, answer: 'One streamed original-source handle is invalid. Reattach it; nothing was sent.' }
    files.push({ id: entry.id, name: entry.name, mime: entry.mime, handle: entry.handle, bytes: Number(entry.bytes), sha256: entry.sha256, storage: entry.storage as 'in-place' | 'private-copy' })
  }
  if (new Set(files.map(file => file.id)).size !== files.length) return { ok: false, answer: 'Original attachment identifiers must be unique. Nothing was sent.' }
  return { ok: true, files }
}

/** Validate image payloads without decoding arbitrary-size strings. */
export function engineImages(input: unknown): EngineImagesAnswer {
  if (!Array.isArray(input)) return { ok: false, answer: 'Pictures must be sent as a list. Nothing was sent.' }
  if (input.length > MAX_ENGINE_ATTACHMENTS) return { ok: false, answer: `At most ${MAX_ENGINE_ATTACHMENTS} pictures can ride with one task. Nothing was silently dropped.` }
  const images: EngineImage[] = []
  for (const value of input) {
    const entry = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    const mime = entry.mime, data = entry.data
    if (typeof mime !== 'string' || !ENGINE_IMAGE_MIMES.includes(mime as EngineImage['mime']) || typeof data !== 'string') return { ok: false, answer: 'One of the pictures is not a PNG, JPEG or WebP. Nothing was sent.' }
    if (!data || data.length > MAX_ENGINE_IMAGE_CHARS || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) return { ok: false, answer: 'One of the pictures is invalid or larger than 2 MB. Nothing was sent.' }
    const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0
    if ((data.length * 3) / 4 - padding > MAX_ENGINE_IMAGE_BYTES) return { ok: false, answer: 'One of the pictures is invalid or larger than 2 MB. Nothing was sent.' }
    images.push({ mime: mime as EngineImage['mime'], data })
  }
  return { ok: true, images }
}

export function framePoints(durationSeconds: number, count = 4): number[] {
  const duration = Number.isFinite(durationSeconds) ? Math.max(durationSeconds, 0) : 0
  if (duration <= 0 || count <= 0) return []
  if (count === 1) return [duration / 2]
  const first = duration * 0.08, last = duration * 0.92, step = (last - first) / (count - 1)
  return Array.from({ length: count }, (_, index) => first + step * index)
}
