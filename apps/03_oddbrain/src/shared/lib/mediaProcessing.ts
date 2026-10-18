export type MediaPreferences = { model: string; allowNetwork: boolean; ocr: boolean; revision?: string }
export const DEFAULT_MEDIA: MediaPreferences = { model: '', allowNetwork: false, ocr: true }
export function normalizeMedia(value: unknown): MediaPreferences {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return { model: typeof v.model === 'string' && v.model.length <= 300 && !/[\r\n\0]/.test(v.model) ? v.model.trim() : '', allowNetwork: v.allowNetwork === true, ocr: v.ocr !== false }
}
export const MAX_MEDIA_BYTES = 24 * 1024 ** 2
export const MAX_MEDIA_TEXT = 180_000
export type MediaInput = { id: string; name: string; mime: string; data: Uint8Array; remote: boolean; model?: string; revision?: string; operation: 'extract' | 'transcribe' }
export type MediaResult = { ok: true; text: string; source: string; notes: string[] } | { ok: false; error: string }
export type MediaBridge = {
  read(): Promise<MediaPreferences>
  update(value: MediaPreferences): Promise<{ ok: boolean; error?: string; preferences?: MediaPreferences }>
  process(input: MediaInput): Promise<MediaResult>
  cancel(id: string): Promise<void>
  models(): Promise<{ models: { name: string; label: string }[]; problems: string[] }>
}
const EXTENSIONS: Record<string, string> = { pdf:'application/pdf', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif', bmp:'image/bmp', tif:'image/tiff', tiff:'image/tiff', avif:'image/avif', heic:'image/heic', heif:'image/heif', mp3:'audio/mpeg', wav:'audio/wav', m4a:'audio/mp4', aac:'audio/aac', ogg:'audio/ogg', oga:'audio/ogg', opus:'audio/ogg', flac:'audio/flac', mp4:'video/mp4', mov:'video/quicktime', webm:'video/webm', mkv:'video/x-matroska', avi:'video/x-msvideo', mpeg:'video/mpeg', mpg:'video/mpeg' }
export function mediaMime(name: string, reported = ''): string {
  const extension = name.split('.').at(-1)?.toLowerCase() || ''
  return EXTENSIONS[extension] || reported.split(';')[0].toLowerCase() || 'application/octet-stream'
}
export function validateMediaInput(value: unknown): MediaInput {
  const v = value as MediaInput
  if (!v || typeof v.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(v.id) || typeof v.name !== 'string' || v.name.length > 255 || /[\r\n\0]/.test(v.name)) throw Error('Invalid media request.')
  if (!(v.data instanceof Uint8Array) || !v.data.length || v.data.length > MAX_MEDIA_BYTES) throw Error('Media must contain between 1 byte and 24 MB.')
  if (v.operation !== 'extract' && v.operation !== 'transcribe') throw Error('Invalid media operation.')
  if (typeof v.remote !== 'boolean' || typeof v.mime !== 'string' || v.mime.length > 100) throw Error('Invalid media options.')
  if (v.remote && (typeof v.model !== 'string' || !v.model.trim() || v.model.length > 300)) throw Error('A confirmed exact media model is required.')
  return { ...v, mime: mediaMime(v.name, v.mime) }
}
