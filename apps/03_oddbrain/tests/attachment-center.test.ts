import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAttachmentCenter } from '../src/main/attachments/center'

describe('Attachment Center', () => {
  it('keeps source identity, coverage, and deletion consequences separate', () => {
    const root = mkdtempSync(join(tmpdir(), 'oddbrain-attachments-')), originals = join(root, 'attachment-center', 'originals'), file = join(originals, 'source.bin')
    mkdirSync(originals, { recursive: true }); const bytes = Buffer.from('exact original bytes'); writeFileSync(file, bytes)
    const sha256 = createHash('sha256').update(bytes).digest('hex'), center = createAttachmentCenter(join(root, 'attachment-center', 'index.json'), originals, () => '2026-10-21T00:00:00.000Z')
    const row = center.record({ sha256, name: 'source.bin', mime: 'application/octet-stream', bytes: bytes.length, storage: 'private-copy', locator: file, origin: 'native-chat' })
    center.processed(sha256, 'local-document', 'Pages 1–4 of 4; text only.', true)
    center.markTurn(sha256, 'turn-1')
    const preview = center.previewDelete(row.id)
    expect(preview.impacts.join(' ')).toContain('turn transcript')
    expect(preview.impacts.join(' ')).toContain('not deleted')
    const after = center.confirmDelete(preview.token)
    expect(after.records).toHaveLength(0)
  })

  it('never offers to delete an owner file used in place', () => {
    const root = mkdtempSync(join(tmpdir(), 'oddbrain-attachments-')), file = join(root, 'owner.txt'); writeFileSync(file, 'owner')
    const sha256 = createHash('sha256').update('owner').digest('hex'), center = createAttachmentCenter(join(root, 'index.json'), join(root, 'private'))
    const row = center.record({ sha256, name: 'owner.txt', mime: 'text/plain', bytes: 5, storage: 'in-place', locator: file, origin: 'folder' })
    const preview = center.previewDelete(row.id)
    expect(preview.allowed).toBe(false)
    expect(preview.impacts[0]).toContain('will not delete')
    expect(() => center.confirmDelete(preview.token)).toThrow(/did not allow/)
  })
})
