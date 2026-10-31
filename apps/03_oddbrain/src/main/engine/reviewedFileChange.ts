import { randomUUID, createHash } from 'node:crypto'
import { openSync, closeSync, fstatSync, readSync, writeFileSync, renameSync, linkSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { noLinkedPath } from './configTransaction'
import { unifiedDiff, type FileReview, type FileDecision } from '../../shared/lib/changeReview'
import { scanTextHazards, textHazardDetails } from '../../shared/lib/textHazards'

const fingerprint = (bytes: Buffer | null) => bytes === null ? 'missing' : createHash('sha256').update(bytes).digest('hex')
function read(path: string): Buffer | null {
  noLinkedPath(path)
  let fd: number
  try { fd = openSync(path, 'r') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
  try {
    const before = fstatSync(fd)
    if (!before.isFile() || before.size > 2_000_000) throw Error('Only regular files up to 2 MB can be reviewed.')
    const buffer = Buffer.alloc(before.size + 1); let total = 0
    while (total < buffer.length) { const count = readSync(fd, buffer, total, buffer.length - total, null); if (!count) break; total += count }
    const after = fstatSync(fd)
    if (total !== before.size || total > 2_000_000 || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw Error('File grew or changed while reading. Review again; nothing was replaced.')
    return buffer.subarray(0, total)
  } finally { closeSync(fd) }
}
/** MAIN PROCESS ONLY. The caller resolves an indexed checkpoint or authorized rule destination.
 * Never expose prepare(path,text) directly as arbitrary renderer-controlled IPC.
 * Retains displaced bytes beside the original; never uses rename to overwrite a newer destination.
 * Not an OS-wide filesystem transaction or protection against hostile concurrent directory changes.
 */
export function createFileReviewService(now = Date.now) {
  const pending = new Map<string, { review: FileReview; expected: string; after: Buffer | null }>()
  const prune = () => { for (const [token, value] of pending) if (value.review.expiresAt <= now()) pending.delete(token) }
  return {
    prepare(path: string, after: Buffer | null, purpose: FileReview['purpose']): FileReview {
      prune(); if (pending.size >= 50) throw Error('Too many pending reviews. Allow, deny or wait for expiry before requesting more.')
      path = resolve(path); const before = read(path)
      const decode = (bytes: Buffer | null) => { if (bytes?.includes(0)) throw Error('Binary changes require a separate byte-aware review. Nothing was changed.'); return new TextDecoder('utf-8', { fatal: true }).decode(bytes || new Uint8Array()) }
      if (after && after.length > 2_000_000) throw Error('Replacement exceeds 2 MB. Nothing was changed.')
      const beforeText = decode(before), afterText = decode(after), hazards = scanTextHazards(afterText)
      const review: FileReview = { token: randomUUID(), path, purpose, expiresAt: now() + 300_000, before: beforeText, after: afterText, diff: unifiedDiff(beforeText, afterText, path), checks: ['Local file bytes inspected', 'UTF-8 text and size checked', ...(hazards.total ? textHazardDetails(hazards) : ['No suspicious invisible or direction-changing characters detected']), 'No tests or commands executed', 'No filesystem permissions granted'], ...(hazards.total ? { hazards } : {}) }
      pending.set(review.token, { review: { ...review }, expected: fingerprint(before), after: after === null ? null : Buffer.from(after) })
      return review
    },
    /** Coordinator may reveal this path in its folder, never execute it or take a renderer path. */
    reviewedPath(token: string): string {
      prune(); const entry = pending.get(token)
      if (!entry) throw Error('Review expired or unknown.')
      noLinkedPath(entry.review.path)
      return entry.review.path
    },
    decide(token: string, decision: 'allow' | 'deny'): FileDecision {
      prune(); const entry = pending.get(token); pending.delete(token)
      if (!entry) return { ok: false, answer: 'Review expired, was already used, or is unknown. Preview again.' }
      if (decision === 'deny') return { ok: true, answer: 'Denied. No files changed.' }
      if (decision !== 'allow') return { ok: false, answer: 'Explicit allow or deny is required.' }
      const { path } = entry.review
      let recoveryPath: string | undefined, temporary: string | undefined
      try {
        if (fingerprint(read(path)) !== entry.expected) throw Error('File changed since preview. Nothing was replaced; preview again.')
        if (entry.after !== null) { temporary = path + '.oddbrain-reviewed-' + randomUUID(); writeFileSync(temporary, entry.after, { flag: 'wx', mode: 0o600 }) }
        if (entry.expected !== 'missing') {
          recoveryPath = path + '.oddbrain-before-' + randomUUID()
          noLinkedPath(path); renameSync(path, recoveryPath)
          if (fingerprint(read(recoveryPath)) !== entry.expected) throw Error('File changed during restore. Displaced bytes were retained.')
        }
        // link is exclusive: a concurrently-created file is NEVER overwritten.
        if (temporary) linkSync(temporary, path)
        else if (read(path) !== null) throw Error('A new file appeared during removal. It was left untouched.')
        return { ok: true, answer: entry.after === null ? 'Reviewed file removed; previous bytes retained for recovery.' : 'Reviewed replacement written; previous bytes retained for recovery.', recoveryPath }
      } catch (error) {
        if (recoveryPath) { try { linkSync(recoveryPath, path) } catch { /* Never replace a concurrent file. Recovery bytes stay at recoveryPath. */ } }
        return { ok: false, answer: (error as Error).message, recoveryPath }
      } finally { if (temporary) { try { unlinkSync(temporary) } catch { /* Staged copy retained; never delete unrelated paths. */ } } }
    },
  }
}
