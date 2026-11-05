export const MAX_INLINE_MEDIA_BYTES = 8 * 1024 * 1024
export const LARGE_SOURCE_CHOICE_BYTES = 64 * 1024 * 1024
/** Above this size document text is offered as complete selectable sections
 * instead of one automatic attachment. This is not an ingestion ceiling. */
export const MAX_EXTRACTED_TEXT = 12_000
/** Leaves room inside the main process's explicit 250k transport safety budget
 * for the owner request, evidence envelope and app instructions. */
export const MAX_SELECTED_ATTACHMENT_TEXT = 180_000
export type MediaPreferences = {
  provider: string; model: string
  transcriptionProvider: string; transcriptionModel: string
  dictation: 'local' | 'provider'; language: string; ffmpeg: string
  ocrAdapter: string; ocrAdapterSha256: string; ocrAdapterLabel: string
}
export const DEFAULT_MEDIA: MediaPreferences = { provider: '', model: '', transcriptionProvider: '', transcriptionModel: '', dictation: 'local', language: 'en-US', ffmpeg: '', ocrAdapter: '', ocrAdapterSha256: '', ocrAdapterLabel: '' }
export function normalizeMedia(raw: unknown): MediaPreferences {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<MediaPreferences>
  const text = (x: unknown, max = 200): string => typeof x === 'string' && x.length <= max && !/[\x00-\x1f]/.test(x) ? x.trim() : ''
  return { provider: text(v.provider), model: text(v.model), transcriptionProvider: text(v.transcriptionProvider), transcriptionModel: text(v.transcriptionModel), dictation: v.dictation === 'provider' ? 'provider' : 'local', language: /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(v.language || '') ? v.language! : 'en-US', ffmpeg: text(v.ffmpeg, 4096), ocrAdapter: text(v.ocrAdapter, 4096), ocrAdapterSha256: /^[a-f0-9]{64}$/.test(v.ocrAdapterSha256 || '') ? v.ocrAdapterSha256! : '', ocrAdapterLabel: text(v.ocrAdapterLabel, 500) }
}
export type MediaInput = { name: string; mime: string; bytes: Uint8Array; route: 'local' | 'provider' | 'transcribe' | 'ocr'; expected?: { provider: string; model: string } }
export type MediaRange = { start: number; end: number; unit: 'pages' | 'seconds' }
export type MediaFileInput = { name: string; mime: string; size: number; route: MediaInput['route']; expected?: MediaInput['expected']; storage: 'in-place' | 'private-copy'; range?: MediaRange; /** Owner-approved reuse of the configured OCR-2 adapter on selected video evidence frames. */ videoOcr?: boolean; /** Privileged Video Studio routes may retain a larger local storyboard; ordinary chat keeps the default three-frame budget. */ videoFrameBudget?: number }
export type MediaSourceHandle = { handle: string; sha256: string; bytes: number; storage: 'in-place' | 'private-copy'; consequence: string }
export type MediaTextSegment = { id: string; label: string; text: string }
export type MediaVisualEvidence = { at: number; reason: 'overview' | 'scene-change' | 'question'; score: number; frame: string; ocr?: string }
export type MediaAudioWindow = { start: number; end: number; speaker: 'unassigned'; words: number; paceWpm: number; rmsAverageDb?: number; rmsMinimumDb?: number; rmsMaximumDb?: number; pauseCount: number; pauseSeconds: number }
export type MediaResult = { textComplete?: boolean; pages?: { read: number; total: number }; time?: { read: number; total: number; unit: 'seconds' }; ok: boolean; name: string; text?: string; segments?: MediaTextSegment[]; images?: { name: string; mime: string; data: string }[]; visualEvidence?: MediaVisualEvidence[]; /** Complete bounded local scene-change index; unlike visualEvidence, these entries do not imply an extracted or model-read frame. */ sceneMap?: Array<{ at: number; score: number }>; /** Complete interval-level delivery measurements. They describe signal level, recognized-word pace and pauses, never inferred emotion or identity. */ audioMap?: MediaAudioWindow[]; diagnostics?: Array<{ area: 'audio-levels' | 'pauses' | 'scene-changes'; status: 'complete' | 'empty' | 'failed'; message: string }>; disclosure?: string; error?: string; fallbackAllowed?: boolean; source?: MediaSourceHandle }
export type MediaBridge = {
  authorizeRecording(expected: { provider: string; model: string }): Promise<MediaResult>
  onCancelled(listener: () => void): () => void
  read(): Promise<MediaPreferences>
  update(patch: Partial<MediaPreferences>): Promise<MediaPreferences>
  chooseDecoder(): Promise<MediaPreferences>
  chooseOcrAdapter(): Promise<MediaPreferences>
  /** Small bounded IPC transport, retained for browser/test compatibility. */
  decode(input: MediaInput): Promise<MediaResult>
  /** Desktop selected-file route: the preload keeps the native path out of renderer code. */
  decodeFile(file: File, input: MediaFileInput): Promise<MediaResult>
  releaseSource(handle: string): Promise<void>
  dictate(): Promise<MediaResult>
  cancel(): Promise<void>
}
