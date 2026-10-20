/**
 * Isolated Git checkouts created and removed by the app.
 *
 * The only Git commands used are `rev-parse`, `worktree add --detach`,
 * `worktree remove`, `worktree prune` and `status --porcelain`. No branch is
 * created or deleted, nothing is committed, pushed, fetched or staged, and the
 * owner's own working tree is never the `cwd` of a mutating command.
 *
 * Every call is bounded (15 s, 1 MB of output), runs `git` without a shell and
 * with a minimal environment, and refuses a folder that is not inside a Git
 * working tree. Removal refuses a checkout with uncommitted changes unless the
 * caller says to discard them; the record is kept either way.
 */
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { commitConfigs, configBytes, noLinkedPath } from '../engine/configTransaction'
import { commandEnvironment } from '../commands/runner'
import type { Worktree } from '../../shared/lib/worktrees'

const ID = /^\d{13}-[a-f0-9-]{36}$/
const LIMIT = 20
type Run = (args: string[], cwd: string) => Promise<string>

export type WorktreeService = ReturnType<typeof createWorktreeService>

export function createWorktreeService(options: {
  root: string
  /** The folder the app has selected, resolved at call time. */
  folder: () => string
  run?: Run
}): {
  list: () => Promise<{ worktrees: Worktree[]; problem: string }>
  create: () => Promise<{ ok: boolean; answer: string; worktree?: Worktree }>
  remove: (id: string, discardChanges: boolean) => Promise<{ ok: boolean; answer: string }>
  /** The live worktree at this absolute path, or undefined. */
  at: (path: string) => Promise<Worktree | undefined>
  /** Synchronous check used where an absolute path is about to be authorized. */
  check: (path: string) => { ok: boolean; path?: string; id?: string; reason?: string }
} {
  const run: Run = options.run ?? ((args, cwd) => new Promise((resolvePromise, reject) => {
    execFile('git', args, {
      cwd,
      timeout: 15_000,
      maxBuffer: 1_000_000,
      windowsHide: true,
      shell: false,
      env: commandEnvironment(process.env),
    }, (error, stdout, stderr) => {
      if (error) { reject(Error((String(stderr || '') || error.message).trim().slice(0, 2_000))); return }
      resolvePromise(String(stdout).trim())
    })
  }))
  const record = (id: string) => {
    if (!ID.test(id)) throw Error('Invalid worktree identifier.')
    const file = join(options.root, `${id}.json`)
    noLinkedPath(file)
    return file
  }
  const read = (id: string): Worktree => {
    const bytes = configBytes(record(id))
    if (!bytes) throw Error('That worktree record is missing.')
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Worktree
    if (!value || value.id !== id || typeof value.path !== 'string' || !isAbsolute(value.path) || typeof value.repo !== 'string' || !/^[a-f0-9]{40}$/i.test(value.base) || typeof value.createdAt !== 'string') throw Error('That worktree record is damaged. Its file was not changed.')
    return value
  }
  const changes = async (path: string): Promise<number> => {
    try {
      const status = await run(['status', '--porcelain', '--untracked-files=normal'], path)
      return status ? status.split('\n').filter(Boolean).length : 0
    } catch {
      return -1
    }
  }
  const list = async () => {
    let names: string[] = []
    try {
      noLinkedPath(options.root)
      names = readdirSync(options.root).filter(name => name.endsWith('.json') && ID.test(name.slice(0, -5)))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { worktrees: [] as Worktree[], problem: '' }
      return { worktrees: [] as Worktree[], problem: 'The worktree records could not be read.' }
    }
    const found: Worktree[] = []
    let problem = ''
    for (const name of names.sort().reverse().slice(0, LIMIT)) {
      try {
        const value = read(name.slice(0, -5))
        if (value.removedAt) found.push({ ...value, changes: 0 })
        else if (!existsSync(value.path)) found.push({ ...value, changes: 0, removedAt: new Date(0).toISOString() })
        else found.push({ ...value, changes: await changes(value.path) })
      } catch { problem = problem || 'One worktree record could not be read; its file has not been changed.' }
    }
    return { worktrees: found, problem }
  }
  const at = async (path: string): Promise<Worktree | undefined> => {
    if (typeof path !== 'string' || !isAbsolute(path)) return undefined
    let wanted: string
    try { wanted = realpathSync(resolve(path)) } catch { return undefined }
    for (const entry of (await list()).worktrees) {
      if (entry.removedAt) continue
      try { if (realpathSync(entry.path) === wanted) return entry } catch { /* gone */ }
    }
    return undefined
  }
  const check = (path: string) => {
    if (typeof path !== 'string' || !isAbsolute(path)) return { ok: false, reason: 'Not an absolute folder path.' }
    const full = resolve(path), root = resolve(options.root)
    if (!full.startsWith(root + sep)) return { ok: false, reason: 'Not inside this app’s checkout storage.' }
    const id = full.slice(root.length + 1)
    if (id.includes(sep) || !ID.test(id)) return { ok: false, reason: 'Not a checkout this app created.' }
    try {
      const entry = read(id)
      if (entry.removedAt) return { ok: false, reason: 'That checkout was removed.' }
      if (resolve(entry.path) !== full) return { ok: false, reason: 'The checkout record names a different folder.' }
      if (!statSync(full).isDirectory()) return { ok: false, reason: 'That checkout folder is gone.' }
      return { ok: true, path: full, id }
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : 'The checkout record could not be read.' }
    }
  }
  return {
    list,
    at,
    check,
    async create() {
      const folder = resolve(options.folder())
      noLinkedPath(folder)
      let info: ReturnType<typeof statSync>
      try { info = statSync(folder) } catch { return { ok: false, answer: 'The selected working folder does not exist, so no checkout could be made.' } }
      if (!info.isDirectory()) return { ok: false, answer: 'The selected working folder is not a directory.' }
      const notATree = { ok: false, answer: 'That folder is not inside a Git working tree, so there is nothing to check out. An isolated folder would be a copy, not a checkout; this app does not pretend otherwise.' }
      let repo: string, base: string
      try {
        if (await run(['rev-parse', '--is-inside-work-tree'], folder) !== 'true') return notATree
      } catch { return notATree }
      try {
        repo = realpathSync(resolve(await run(['rev-parse', '--show-toplevel'], folder)))
      } catch (error) {
        return { ok: false, answer: `Git could not describe this folder: ${error instanceof Error ? error.message : 'unknown error'}. Nothing was created.` }
      }
      try {
        base = await run(['rev-parse', '--verify', 'HEAD'], folder)
      } catch {
        return { ok: false, answer: 'That repository has no commit yet, so there is no snapshot to check out. Nothing was created.' }
      }
      if (!/^[a-f0-9]{40}$/i.test(base)) return { ok: false, answer: 'That repository’s latest commit could not be read, so there is no snapshot to check out. Nothing was created.' }
      const id = `${Date.now()}-${randomUUID()}`
      const path = join(options.root, id)
      noLinkedPath(options.root)
      try {
        // The app owns this folder: a settings change between review and creation
        // must not point the checkout at the owner's own working tree.
        if (resolve(options.folder()) !== folder) return { ok: false, answer: 'The selected folder changed while the checkout was being prepared. Nothing was created.' }
        const entry: Worktree = { id, path, repo, base, createdAt: new Date().toISOString(), changes: 0 }
        const made = await run(['worktree', 'add', '--detach', path, base], repo)
        if (!existsSync(join(path, '.git'))) throw Error(made || 'Git did not create the checkout.')
        if (await run(['rev-parse', 'HEAD'], path) !== base) throw Error('The checkout is not at the reviewed commit.')
        commitConfigs([{ path: record(id), text: JSON.stringify(entry, null, 2) + '\n' }])
        return { ok: true, answer: `Isolated checkout of ${repo} at ${base.slice(0, 12)} created. Commands can be reviewed against this folder; nothing is committed or pushed from it.`, worktree: entry }
      } catch (error) {
        try { await run(['worktree', 'remove', '--force', path], repo) } catch { /* report the original failure */ }
        try { await run(['worktree', 'prune'], repo) } catch { /* a stale record is better than a hidden one */ }
        return { ok: false, answer: `The checkout could not be created: ${error instanceof Error ? error.message : 'unknown error'}. No worktree remains.` }
      }
    },
    async remove(id, discardChanges) {
      if (typeof discardChanges !== 'boolean') return { ok: false, answer: 'Say explicitly whether changes in the checkout may be discarded. Nothing was removed.' }
      let entry: Worktree
      try { entry = read(String(id ?? '')) } catch (error) { return { ok: false, answer: error instanceof Error ? error.message : 'Unknown worktree.' } }
      if (entry.removedAt) return { ok: false, answer: 'That checkout was already removed; its record is kept as history.' }
      const count = await changes(entry.path)
      if (count > 0 && !discardChanges) return { ok: false, answer: `The checkout has ${count} changed or untracked ${count === 1 ? 'file' : 'files'}. Review them, copy what you need, or choose to discard them. Nothing was removed.` }
      try {
        await run(['worktree', 'remove', ...(discardChanges || count > 0 ? ['--force'] : []), entry.path], entry.repo)
        await run(['worktree', 'prune'], entry.repo)
      } catch (error) {
        return { ok: false, answer: `Git refused to remove the checkout: ${error instanceof Error ? error.message : 'unknown error'}. It is still there.` }
      }
      const removedAt = new Date().toISOString()
      try { commitConfigs([{ path: record(entry.id), text: JSON.stringify({ ...entry, removedAt }, null, 2) + '\n' }]) }
      catch { return { ok: true, answer: 'The checkout was removed, but its record could not be updated. The folder is gone; the history still shows it as live.' } }
      return { ok: true, answer: 'The checkout was removed. Its record stays as history; no branch or commit was deleted.' }
    },
  }
}
