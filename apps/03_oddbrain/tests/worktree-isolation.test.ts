import { afterEach, expect, test } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDetachedWorktree, finishDetachedWorktree, inspectWorktreeRepository, recheckWorktreeRepository } from '../src/main/workflows/worktrees'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
function repository() {
  const base = mkdtempSync(join(tmpdir(), 'oddbrain-worktree-')); roots.push(base)
  const repo = join(base, 'repo'), storage = join(base, 'private-worktrees'); mkdirSync(repo)
  execFileSync('git', ['init', '-q'], { cwd: repo }); execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repo }); execFileSync('git', ['config', 'user.name', 'OddBrain test'], { cwd: repo })
  writeFileSync(join(repo, 'original.txt'), 'source\n'); execFileSync('git', ['add', 'original.txt'], { cwd: repo }); execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repo })
  return { base, repo, storage }
}
const id = () => `${Date.now()}-11111111-1111-4111-8111-111111111111`

test('a changed detached checkout is retained with bounded Git evidence while the source stays unchanged', () => {
  const f = repository(), reviewed = inspectWorktreeRepository(f.repo, f.storage)
  recheckWorktreeRepository(reviewed, f.storage)
  const path = createDetachedWorktree(reviewed, f.storage, id(), 0)
  writeFileSync(join(path, 'original.txt'), 'isolated change\n'); writeFileSync(join(path, 'new.txt'), 'new\n')
  const receipt = finishDetachedWorktree(reviewed, f.storage, path)
  expect(receipt).toMatchObject({ retained: true, changed: true, baseRevision: reviewed.revision, headRevision: reviewed.revision })
  expect(receipt.statusBytes).toBeGreaterThan(0); expect(receipt.statusSha256).toMatch(/^[a-f0-9]{64}$/)
  expect(readFileSync(join(f.repo, 'original.txt'), 'utf8')).toBe('source\n'); expect(existsSync(join(f.repo, 'new.txt'))).toBe(false)
})

test('a clean unchanged checkout is removed but its receipt remains honest', () => {
  const f = repository(), reviewed = inspectWorktreeRepository(f.repo, f.storage), path = createDetachedWorktree(reviewed, f.storage, id(), 0)
  const receipt = finishDetachedWorktree(reviewed, f.storage, path)
  expect(receipt).toMatchObject({ retained: false, changed: false, statusBytes: 0 }); expect(existsSync(path)).toBe(false)
})

test('dirty source state and configured checkout filters refuse before a worktree is made', () => {
  const dirty = repository(); writeFileSync(join(dirty.repo, 'untracked.txt'), 'private')
  expect(() => inspectWorktreeRepository(dirty.repo, dirty.storage)).toThrow(/uncommitted or untracked/)
  const filtered = repository(); execFileSync('git', ['config', 'filter.unsafe.smudge', 'echo not-allowed'], { cwd: filtered.repo })
  expect(() => inspectWorktreeRepository(filtered.repo, filtered.storage)).toThrow(/checkout filters/)
  expect(existsSync(join(filtered.storage, id()))).toBe(false)
})
