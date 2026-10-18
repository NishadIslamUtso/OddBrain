export const MAX_MEDIA_BYTES = 50 * 1024 * 1024
export const MAX_EXTRACTED_TEXT = 12_000
export type MediaPreferences = {
  provider: string; model: string
  transcriptionProvider: string; transcriptionModel: string
  dictation: 'local' | 'provider'; language: string; ffmpeg: string
}
export const DEFAULT_MEDIA: MediaPreferences = { provider: '', model: '', transcriptionProvider: '', transcriptionModel: '', dictation: 'local', language: 'en-US', ffmpeg: '' }
export function normalizeMedia(raw: unknown): MediaPreferences {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<MediaPreferences>
  const text = (x: unknown, max = 200): string => typeof x === 'string' && !/[\x00-\x1f]/.test(x) ? x.trim().slice(0, max) : ''
  return { provider: text(v.provider), model: text(v.model), transcriptionProvider: text(v.transcriptionProvider), transcriptionModel: text(v.transcriptionModel), dictation: v.dictation === 'provider' ? 'provider' : 'local', language: /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(v.language || '') ? v.language! : 'en-US', ffmpeg: text(v.ffmpeg, 4096) }
}
export type MediaInput = { name: string; mime: string; bytes: Uint8Array; route: 'local' | 'provider' | 'transcribe'; expected?: { provider: string; model: string } }
export type MediaResult = { ok: boolean; name: string; text?: string; images?: { name: string; mime: string; data: string }[]; disclosure?: string; error?: string; fallbackAllowed?: boolean }
export type MediaBridge = {
  authorizeRecording(expected: { provider: string; model: string }): Promise<MediaResult>
  onCancelled(listener: () => void): () => void
  read(): Promise<MediaPreferences>
  update(patch: Partial<MediaPreferences>): Promise<MediaPreferences>
  chooseDecoder(): Promise<MediaPreferences>
  decode(input: MediaInput): Promise<MediaResult>
  dictate(): Promise<MediaResult>
  cancel(): Promise<void>
}
