// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorktreeService } from '../src/main/worktrees/service'

// Real `git` on a cold Windows runner is slower than a unit test budget.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })
const roots: string[] = []
const dir = () => { const path = mkdtempSync(join(tmpdir(), 'oddbrain-worktree-')); roots.push(path); return path }
// Windows may still hold a handle on a just-closed git file; retry instead of
// failing teardown, and never let cleanup hide the test's own result.
afterEach(() => { for (const root of roots.splice(0)) { try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) } catch { /* left in %TEMP% */ } } })

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' } }).trim()
/** A real repository with one commit, and an app-owned record folder beside it. */
function repo() {
  const base = dir(), working = join(base, 'project'), root = join(base, 'checkouts')
  mkdirSync(working); git(working, 'init', '-b', 'main')
  writeFileSync(join(working, 'readme.txt'), 'first\n'); git(working, 'add', 'readme.txt'); git(working, 'commit', '-m', 'first')
  return { base, working, root, head: git(working, 'rev-parse', 'HEAD') }
}

test('a folder that is not a Git working tree is refused, and nothing is created', async () => {
  const base = dir(), folder = join(base, 'plain'), root = join(base, 'checkouts')
  mkdirSync(folder)
  const service = createWorktreeService({ root, folder: () => folder })
  const answer = await service.create()
  expect(answer.ok).toBe(false)
  expect(answer.answer).toContain('not inside a Git working tree')
  expect(existsSync(root) ? readdirSync(root) : []).toEqual([])
})

test('a repository with no commit yet has no snapshot to check out', async () => {
  const base = dir(), folder = join(base, 'empty'), root = join(base, 'checkouts')
  mkdirSync(folder); git(folder, 'init', '-b', 'main')
  const answer = await createWorktreeService({ root, folder: () => folder }).create()
  expect(answer.ok).toBe(false)
  expect(answer.answer).toContain('no commit yet')
  expect(existsSync(root) ? readdirSync(root) : []).toEqual([])
})

test('a checkout is created detached at the reviewed commit and leaves the owner’s folder untouched', async () => {
  const r = repo(), service = createWorktreeService({ root: r.root, folder: () => r.working })
  const answer = await service.create()
  expect(answer.ok).toBe(true)
  const entry = answer.worktree!
  expect(entry.base).toBe(r.head); expect(entry.repo.endsWith('project')).toBe(true)
  expect(existsSync(join(entry.path, 'readme.txt'))).toBe(true)
  expect(git(entry.path, 'rev-parse', 'HEAD')).toBe(r.head)
  // Detached: no branch owns the checkout, and the owner's repository is clean and still on main.
  expect(() => git(entry.path, 'symbolic-ref', '--short', 'HEAD')).toThrow()
  expect(git(r.working, 'status', '--porcelain')).toBe('')
  expect(git(r.working, 'branch', '--show-current')).toBe('main')
  expect(service.check(entry.path)).toMatchObject({ ok: true, id: entry.id })
  expect(await service.at(entry.path)).toMatchObject({ id: entry.id, base: r.head })
  const listed = await service.list()
  expect(listed.worktrees).toHaveLength(1); expect(listed.worktrees[0].changes).toBe(0); expect(listed.problem).toBe('')
})

test('a checkout with uncommitted work is not removed without an explicit discard', async () => {
  const r = repo(), service = createWorktreeService({ root: r.root, folder: () => r.working })
  const entry = (await service.create()).worktree!
  writeFileSync(join(entry.path, 'scratch.txt'), 'unsaved work\n')
  expect((await service.list()).worktrees[0].changes).toBe(1)
  const refused = await service.remove(entry.id, false)
  expect(refused.ok).toBe(false)
  expect(refused.answer).toContain('1 changed or untracked file')
  expect(existsSync(join(entry.path, 'scratch.txt'))).toBe(true)
  const removed = await service.remove(entry.id, true)
  expect(removed.ok).toBe(true)
  expect(existsSync(entry.path)).toBe(false)
  // The record stays as history and the owner's folder still has its own files.
  expect((await service.list()).worktrees[0].removedAt).toBeTruthy()
  expect(service.check(entry.path).ok).toBe(false)
  expect(git(r.working, 'status', '--porcelain')).toBe('')
})

test('a clean checkout can be removed without discarding anything', async () => {
  const r = repo(), service = createWorktreeService({ root: r.root, folder: () => r.working })
  const entry = (await service.create()).worktree!
  expect((await service.remove(entry.id, false)).ok).toBe(true)
  expect(existsSync(entry.path)).toBe(false)
  expect(git(r.working, 'status', '--porcelain')).toBe('')
})

test('paths outside this app’s checkout storage are never authorized, and ids cannot be forged', async () => {
  const r = repo(), service = createWorktreeService({ root: r.root, folder: () => r.working })
  expect(service.check(r.working).ok).toBe(false)
  expect(service.check(join(r.root, '..', 'elsewhere')).ok).toBe(false)
  expect(service.check(join(r.root, '1234567890123-not-a-uuid')).ok).toBe(false)
  expect(service.check(r.root).ok).toBe(false)
  expect(service.check('relative/path').ok).toBe(false)
  const refused = await service.remove('../../etc', true)
  expect(refused.ok).toBe(false)
  expect(refused.answer).toContain('Invalid worktree')
  // An unreadable record is reported, never treated as an empty or trusted checkout.
  mkdirSync(r.root, { recursive: true }); writeFileSync(join(r.root, '1234567890123-00000000-0000-4000-8000-000000000000.json'), '{not json')
  const listed = await service.list()
  expect(listed.worktrees).toEqual([])
  expect(listed.problem).toContain('could not be read')
})

test('removal needs an explicit boolean choice; a missing record is reported instead of guessed', async () => {
  const r = repo(), service = createWorktreeService({ root: r.root, folder: () => r.working })
  expect((await service.remove('9999999999999-00000000-0000-4000-8000-000000000000', true)).ok).toBe(false)
  expect((await service.remove(r.working, true)).ok).toBe(false)
  const entry = (await service.create()).worktree!
  expect((await service.remove(entry.id, 'yes' as unknown as boolean)).answer).toContain('explicitly')
  expect(existsSync(entry.path)).toBe(true)
})

test('the folder is re-read at creation time, so a settings change cannot point the checkout elsewhere', async () => {
  const r = repo(), other = repo()
  let current = r.working
  const service = createWorktreeService({ root: r.root, folder: () => current })
  // Switching the selected folder between review and creation is refused by the service
  // when the folder changes while the command is in flight; here the second call simply
  // checks out the newly selected repository, at its own commit.
  const first = await service.create()
  expect(first.worktree!.repo.endsWith('project')).toBe(true)
  current = other.working
  const second = await service.create()
  expect(second.ok).toBe(true)
  expect(second.worktree!.base).toBe(other.head)
  expect(second.worktree!.repo).not.toBe(first.worktree!.repo)
})
