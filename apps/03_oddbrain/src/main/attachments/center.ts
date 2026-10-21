import { createHash, randomUUID } from 'node:crypto'
import { lstatSync, unlinkSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { attachmentCenterProblem, emptyAttachmentCenter, type AttachmentCenterState, type AttachmentDeletePreview, type AttachmentOrigin, type AttachmentRecord } from '../../shared/lib/attachmentCenter'
import { hashRegularFileSync } from '../safeFile'
import { readRecoverableJson, writeRecoverableJson } from '../recoverableJson'

const inside = (root: string, path: string): boolean => { const value = relative(resolve(root), resolve(path)); return value !== '..' && !value.startsWith(`..${sep}`) }
const validate = (value: unknown): AttachmentCenterState => { const problem = attachmentCenterProblem(value); if (problem) throw Error(`Attachment inventory needs repair: ${problem}. It was not reset.`); return value as AttachmentCenterState }

export function createAttachmentCenter(file: string, privateRoot: string, clock: () => string = () => new Date().toISOString()) {
  const previews = new Map<string, AttachmentDeletePreview>()
  const readStored = (): AttachmentCenterState => readRecoverableJson(file, validate, emptyAttachmentCenter()).value
  const save = (state: AttachmentCenterState): void => writeRecoverableJson(file, state)
  const refreshed = (): AttachmentCenterState => {
    const state = readStored(); let changed = false
    const records = state.records.map(row => {
      try {
        const current = lstatSync(row.locator)
        if (!current.isFile() || current.isSymbolicLink() || current.size !== row.bytes) throw Error('not the indexed file')
        const sameStamp = row.fileStamp?.modifiedAtMs === current.mtimeMs && row.fileStamp.changedAtMs === current.ctimeMs
        if (!sameStamp) {
          hashRegularFileSync(row.locator, { bytes: row.bytes, sha256: row.sha256 })
          row.fileStamp = { modifiedAtMs: current.mtimeMs, changedAtMs: current.ctimeMs }; changed = true
        }
        if (row.state === 'unavailable') { row.state = 'available'; changed = true }
        return row
      } catch { return { ...row, state: 'unavailable' as const } }
    })
    if (changed) { state.revision++; save(state) }
    return { ...state, records }
  }
  return {
    read: refreshed,
    record(input: { sha256: string; name: string; mime: string; bytes: number; storage: 'in-place' | 'private-copy'; locator: string; origin?: AttachmentOrigin }): AttachmentRecord {
      if (!/^[a-f0-9]{64}$/.test(input.sha256) || !input.name || input.name.length > 240 || !Number.isSafeInteger(input.bytes) || input.bytes < 1 || (input.storage === 'private-copy' && !inside(privateRoot, input.locator))) throw Error('Invalid Attachment Center source record.')
      const current = lstatSync(input.locator)
      if (!current.isFile() || current.isSymbolicLink() || current.size !== input.bytes) throw Error('Attachment Center source is no longer the verified regular file.')
      const fileStamp = { modifiedAtMs: current.mtimeMs, changedAtMs: current.ctimeMs }
      const state = readStored(), id = createHash('sha256').update(JSON.stringify([input.sha256, input.storage, resolve(input.locator)])).digest('hex')
      const old = state.records.find(row => row.id === id), now = clock()
      if (old) { old.updatedAt = now; old.state = 'available'; old.name = input.name; old.mime = input.mime; old.fileStamp = fileStamp; save({ ...state, revision: state.revision + 1 }); return old }
      const record: AttachmentRecord = { id, sha256: input.sha256, name: input.name, mime: input.mime, bytes: input.bytes, storage: input.storage, locator: resolve(input.locator), fileStamp, origin: input.origin || 'unknown', addedAt: now, updatedAt: now, state: 'available', coverage: 'Original bytes verified; processing has not recorded coverage yet.', processors: [], turnCopies: [] }
      state.records.push(record); state.revision++; save(state); return record
    },
    processed(sha256: string, processor: string, coverage: string, ok = true): void {
      const state = readStored(), rows = state.records.filter(row => row.sha256 === sha256)
      if (!rows.length) return
      const unsupported = /unsupported|no verified adapter|encrypted|password|DRM|corrupt|does not match its declared format|no audio or video content/i.test(coverage)
      for (const row of rows) { row.state = ok ? 'processed' : unsupported ? 'unsupported' : 'available'; row.coverage = coverage.slice(0, 4000); if (!row.processors.includes(processor)) row.processors.push(processor); row.updatedAt = clock() }
      state.revision++; save(state)
    },
    markTurn(sha256: string, transcriptId: string): void {
      const state = readStored(); let changed = false
      for (const row of state.records.filter(row => row.sha256 === sha256)) if (!row.turnCopies.includes(transcriptId)) { row.turnCopies.push(transcriptId); row.updatedAt = clock(); changed = true }
      if (changed) { state.revision++; save(state) }
    },
    previewDelete(id: string): AttachmentDeletePreview {
      const state = refreshed(), row = state.records.find(value => value.id === id)
      if (!row) throw Error('Attachment Center record not found.')
      if (previews.size >= 100) throw Error('Too many deletion previews are open. Confirm or cancel them before making another; nothing was evicted.')
      const allowed = row.storage === 'private-copy' && row.state !== 'unavailable'
      const impacts = row.storage === 'in-place' ? ['Use-in-place sources belong to you outside OddBrain. OddBrain will not delete them.'] : [`Removes only the Attachment Center private copy (${row.bytes.toLocaleString()} bytes).`, 'Any unsent composer reference and future reprocessing from this copy will stop working.', row.turnCopies.length ? `${row.turnCopies.length} verified turn transcript copy/copies remain separate and are not deleted.` : 'No recorded turn-copy dependency was found.', 'Confirmed memory, captured-conversation originals, and derived review records are not deleted.']
      const preview = { token: randomUUID(), id, revision: state.revision, name: row.name, bytes: row.bytes, impacts, allowed }; previews.set(preview.token, preview); return preview
    },
    confirmDelete(token: string): AttachmentCenterState {
      const preview = previews.get(token); previews.delete(token)
      if (!preview || !preview.allowed) throw Error('Deletion preview is missing, expired, or did not allow deletion. Nothing was deleted.')
      const state = readStored(), row = state.records.find(value => value.id === preview.id)
      if (!row || state.revision !== preview.revision || row.storage !== 'private-copy' || !inside(privateRoot, row.locator)) throw Error('Attachment inventory changed after the preview. Review it again; nothing was deleted.')
      const stat = lstatSync(row.locator)
      if (!stat.isFile() || stat.isSymbolicLink()) throw Error('The private copy is no longer a regular file. It was not deleted.')
      hashRegularFileSync(row.locator, { bytes: row.bytes, sha256: row.sha256 }); unlinkSync(row.locator)
      state.records = state.records.filter(value => value.id !== row.id); state.revision++; save(state); return state
    },
  }
}
export type AttachmentCenter = ReturnType<typeof createAttachmentCenter>
