// NOT RUN. No hostile-filesystem, power-loss or target Windows acceptance claimed.
import { expect, test } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFileReviewService } from '../src/main/engine/reviewedFileChange'
import { restoreCheckpoint, takeCheckpoint, createReviewedCheckpoints } from '../src/main/engine/checkpoints'
import { unifiedDiff } from '../src/shared/lib/changeReview'
test('diff retains changes and end-of-file newline differences; large comparisons refuse explicitly', () => {
  expect(unifiedDiff('before\n', 'after\n')).toContain('-before\n+after')
  expect(unifiedDiff('same', 'same\n')).toContain('No newline at end of file')
  expect(() => unifiedDiff('x\n'.repeat(1001), 'y')).toThrow('No content was clipped')
})
test('restore refuses post-preview edits and never reuses approval', () => {
  const dir = mkdtempSync(join(tmpdir(), 'p4-restore-')), path = join(dir, 'file.txt')
  try {
    writeFileSync(path, 'reviewed'); const service = createFileReviewService(), ticket = service.prepare(path, Buffer.from('older'), 'restore')
    writeFileSync(path, 'unrelated work')
    expect(service.decide(ticket.token, 'allow').ok).toBe(false); expect(readFileSync(path, 'utf8')).toBe('unrelated work')
    expect(service.decide(ticket.token, 'allow').ok).toBe(false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
test('approved replacement and ghost removal retain displaced bytes in exclusive recovery copies', () => {
  const dir = mkdtempSync(join(tmpdir(), 'p4-restore-')), path = join(dir, 'file.txt')
  try {
    writeFileSync(path, 'newer'); const service = createFileReviewService()
    const reply = service.decide(service.prepare(path, Buffer.from('older'), 'restore').token, 'allow')
    expect(reply.ok).toBe(true); expect(readFileSync(path, 'utf8')).toBe('older'); expect(readFileSync(reply.recoveryPath!, 'utf8')).toBe('newer')
    const removal = service.decide(service.prepare(path, null, 'restore').token, 'allow')
    expect(removal.ok).toBe(true); expect(existsSync(path)).toBe(false); expect(readFileSync(removal.recoveryPath!, 'utf8')).toBe('older')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
test('unreviewed legacy restore is disabled; indexed reviewed path is required', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'p4-checkpoint-')), file = join(dir, 'file.txt'), copies = join(dir, 'copies')
  try {
    writeFileSync(file, 'old'); const checkpoint = await takeCheckpoint(copies, file)
    writeFileSync(file, 'new')
    expect((await restoreCheckpoint(copies, checkpoint!.copy, file)).ok).toBe(false)
    const api = createReviewedCheckpoints(copies), review = await api.preview(checkpoint!.copy, file)
    expect(api.decide(review.token, 'allow').ok).toBe(true); expect(readFileSync(file, 'utf8')).toBe('old')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
