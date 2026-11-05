export type AttachmentOrigin = 'native-chat' | 'captured-conversation' | 'dm' | 'project' | 'folder' | 'vault' | 'unknown'
export type AttachmentRecord = {
  id: string
  sha256: string
  name: string
  mime: string
  bytes: number
  storage: 'in-place' | 'private-copy'
  locator: string
  fileStamp?: { modifiedAtMs: number; changedAtMs: number }
  origin: AttachmentOrigin
  addedAt: string
  updatedAt: string
  state: 'available' | 'processed' | 'unsupported' | 'unavailable'
  coverage: string
  processors: string[]
  turnCopies: string[]
}
export type AttachmentCenterState = { version: 1; revision: number; records: AttachmentRecord[] }
export type AttachmentDeletePreview = { token: string; id: string; revision: number; name: string; bytes: number; impacts: string[]; allowed: boolean }
export type AttachmentCenterBridge = {
  read(): Promise<{ ok: boolean; state?: AttachmentCenterState; error?: string }>
  previewDelete(id: string): Promise<{ ok: boolean; preview?: AttachmentDeletePreview; error?: string }>
  confirmDelete(token: string): Promise<{ ok: boolean; state?: AttachmentCenterState; answer?: string; error?: string }>
}
export const emptyAttachmentCenter = (): AttachmentCenterState => ({ version: 1, revision: 0, records: [] })
export function attachmentCenterProblem(value: unknown): string {
  const state = value as AttachmentCenterState
  if (!state || state.version !== 1 || !Number.isInteger(state.revision) || state.revision < 0 || !Array.isArray(state.records)) return 'the attachment inventory header is unreadable'
  for (const row of state.records) if (!row || typeof row.id !== 'string' || !/^[a-f0-9]{64}$/.test(row.sha256) || typeof row.name !== 'string' || !Number.isSafeInteger(row.bytes) || row.bytes < 1 || !['in-place','private-copy'].includes(row.storage) || !['available','processed','unsupported','unavailable'].includes(row.state) || (row.fileStamp !== undefined && (!Number.isFinite(row.fileStamp.modifiedAtMs) || !Number.isFinite(row.fileStamp.changedAtMs))) || !Array.isArray(row.processors) || !Array.isArray(row.turnCopies)) return 'an attachment inventory record is unreadable'
  return ''
}
