import { createHash } from 'node:crypto'
import { accessSync, constants, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmdirSync, statSync } from 'node:fs'
import { delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { noLinkedPath } from '../engine/configTransaction'

const RUN_ID = /^\d{13}-[a-f0-9-]{36}$/
const ENV_KEYS = new Set(['PATH', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'APPDATA', 'LOCALAPPDATA', 'LANG', 'LC_ALL', 'LC_CTYPE', 'PATHEXT'])
const commandEnvironment = (source: NodeJS.ProcessEnv): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(source).filter(([key, value]) => ENV_KEYS.has(key.toUpperCase()) && typeof value === 'string'))
const REVISION = /^[a-f0-9]{40,64}$/
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
const inside = (parent: string, child: string) => { const rel = relative(resolve(parent), resolve(child)); return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel)) }
const sameDirectory = (left: string, right: string) => {
  const leftPath = realpathSync(left), rightPath = realpathSync(right)
  const leftInfo = statSync(leftPath), rightInfo = statSync(rightPath)
  if (!leftInfo.isDirectory() || !rightInfo.isDirectory()) return false
  if (leftInfo.ino !== 0 && leftInfo.dev === rightInfo.dev && leftInfo.ino === rightInfo.ino) return true
  return process.platform === 'win32' && leftPath.toLowerCase() === rightPath.toLowerCase()
}

export type WorktreeRepository = {
  root: string
  revision: string
  gitProgram: string
  stamp: string
}
export type WorktreeReceipt = {
  path: string
  baseRevision: string
  headRevision?: string
  retained: boolean
  changed?: boolean
  statusBytes?: number
  statusEntries?: number
  statusSha256?: string
  note: string
}

function gitExecutable(env: NodeJS.ProcessEnv): string {
  const names = process.platform === 'win32' ? ['git.exe', 'git.cmd'] : ['git']
  for (const folder of (env.PATH || env.Path || '').split(delimiter).filter(Boolean)) {
    for (const name of names) {
      const candidate = join(folder, name)
      try { accessSync(candidate, constants.X_OK); const real = realpathSync(candidate); if (statSync(real).isFile()) return real } catch { /* keep looking */ }
    }
  }
  throw Error('Git could not be resolved to a regular executable from the current PATH. No isolated worktree was created.')
}

function safeEnvironment(): NodeJS.ProcessEnv {
  return {
    ...commandEnvironment(process.env),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_ATTR_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
  }
}

function runGit(program: string, hooks: string, cwd: string, args: string[], allowOne = false, max = 262_144): Buffer {
  const result = spawnSync(program, ['-c', `core.hooksPath=${hooks}`, '-c', 'core.fsmonitor=false', '-c', 'core.pager=cat', '-c', 'protocol.file.allow=never', '-C', cwd, ...args], {
    cwd,
    env: safeEnvironment(),
    encoding: 'buffer',
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: max,
    shell: false,
  })
  if (result.error || (result.status !== 0 && !(allowOne && result.status === 1))) throw Error(`Git could not complete the bounded ${args[0] || 'repository'} check. No task was started or retried.`)
  return Buffer.from(result.stdout || [])
}

function text(bytes: Buffer): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/[\r\n]+$/, '')
}

export function inspectWorktreeRepository(cwd: string, storageRoot: string): WorktreeRepository {
  if (typeof cwd !== 'string' || typeof storageRoot !== 'string') throw Error('Choose a Git repository before preparing isolated work.')
  noLinkedPath(cwd); noLinkedPath(storageRoot)
  const root = realpathSync(cwd)
  if (root !== resolve(cwd) || !statSync(root).isDirectory()) throw Error('The selected working folder must be the real Git repository root, not a link.')
  if (inside(root, storageRoot) || inside(storageRoot, root)) throw Error('Private worktree storage must be outside the selected repository. Nothing was created.')
  mkdirSync(storageRoot, { recursive: true, mode: 0o700 })
  const hooks = join(storageRoot, '.disabled-hooks'); mkdirSync(hooks, { recursive: true, mode: 0o700 })
  const gitProgram = gitExecutable(process.env), gitInfo = statSync(gitProgram)
  const reported = text(runGit(gitProgram, hooks, root, ['rev-parse', '--show-toplevel']))
  if (!sameDirectory(reported, root)) throw Error('Parallel worktrees require the selected working folder to be the repository root.')
  if (text(runGit(gitProgram, hooks, root, ['rev-parse', '--is-inside-work-tree'])) !== 'true') throw Error('The selected folder is not a checked-out Git work tree.')
  const revision = text(runGit(gitProgram, hooks, root, ['rev-parse', '--verify', 'HEAD'])).toLowerCase()
  if (!REVISION.test(revision)) throw Error('Git did not return an immutable HEAD revision. Nothing was created.')
  const filters = runGit(gitProgram, hooks, root, ['config', '--local', '--null', '--get-regexp', '^filter\\..*\\.(clean|smudge|process|required)$'], true)
  if (filters.length) throw Error('This repository configures checkout filters that may execute code. Isolated worktree setup refuses them rather than running unreviewed filter commands.')
  const status = runGit(gitProgram, hooks, root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  if (status.length) throw Error('The source repository has uncommitted or untracked changes. Commit, stash, or remove them before isolated parallel work; nothing was copied or hidden.')
  const folder = statSync(root)
  const stamp = sha(JSON.stringify([root, revision, gitProgram, gitInfo.dev, gitInfo.ino, gitInfo.size, gitInfo.mtimeMs, folder.dev, folder.ino, safeEnvironment()]))
  return { root, revision, gitProgram, stamp }
}

export function recheckWorktreeRepository(repository: WorktreeRepository, storageRoot: string): void {
  const fresh = inspectWorktreeRepository(repository.root, storageRoot)
  if (fresh.stamp !== repository.stamp || fresh.revision !== repository.revision || fresh.gitProgram !== repository.gitProgram) throw Error('The Git executable, clean source checkout, or HEAD revision changed after review. No isolated task was started.')
}

export function detachedWorktreePath(storageRoot: string, runId: string, index: number): string {
  if (!RUN_ID.test(runId) || !Number.isSafeInteger(index) || index < 0 || index >= 8) throw Error('Invalid isolated-worktree destination.')
  noLinkedPath(storageRoot)
  return join(storageRoot, runId, `step-${index + 1}`)
}

export function createDetachedWorktree(repository: WorktreeRepository, storageRoot: string, runId: string, index: number): string {
  const destination = detachedWorktreePath(storageRoot, runId, index)
  const retained = existsSync(storageRoot) ? readdirSync(storageRoot).filter(name => RUN_ID.test(name)).filter(name => { try { const info = lstatSync(join(storageRoot, name)); return !info.isDirectory() || info.isSymbolicLink() || readdirSync(join(storageRoot, name)).length > 0 } catch { return true } }).length : 0
  const runRoot = join(storageRoot, runId)
  if (!existsSync(runRoot) && retained >= 20) throw Error('Twenty isolated batches are already retained. Inspect and remove old Git worktrees before starting another batch.')
  if (existsSync(destination)) throw Error('The isolated task folder already exists. It was not reused or overwritten.')
  mkdirSync(runRoot, { recursive: true, mode: 0o700 }); noLinkedPath(destination)
  const hooks = join(storageRoot, '.disabled-hooks')
  runGit(repository.gitProgram, hooks, repository.root, ['worktree', 'add', '--detach', destination, repository.revision], false, 1_000_000)
  const actual = text(runGit(repository.gitProgram, hooks, destination, ['rev-parse', '--verify', 'HEAD'])).toLowerCase()
  if (actual !== repository.revision) throw Error('The isolated checkout does not match the reviewed revision. It was retained for inspection and no command was started there.')
  return destination
}

export function cleanupEmptyWorktreeBatch(storageRoot: string, runId: string): void {
  if (!RUN_ID.test(runId)) return
  const path = join(storageRoot, runId)
  try { noLinkedPath(path); if (lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink() && readdirSync(path).length === 0) rmdirSync(path) } catch { /* retained or already absent */ }
}

export function finishDetachedWorktree(repository: WorktreeRepository, storageRoot: string, path: string): WorktreeReceipt {
  const hooks = join(storageRoot, '.disabled-hooks')
  const receipt: WorktreeReceipt = { path, baseRevision: repository.revision, retained: true, note: 'The isolated checkout is retained. Nothing was merged, pushed, or copied into the source repository.' }
  try {
    noLinkedPath(path)
    if (!existsSync(path) || !lstatSync(path).isDirectory()) return { ...receipt, note: 'The task removed or replaced its isolated checkout. Git metadata or side effects may remain; cleanup was not guessed.' }
    const headRevision = text(runGit(repository.gitProgram, hooks, path, ['rev-parse', '--verify', 'HEAD'])).toLowerCase()
    const status = runGit(repository.gitProgram, hooks, path, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    const changed = headRevision !== repository.revision || status.length > 0
    Object.assign(receipt, { headRevision, changed, statusBytes: status.length, statusEntries: status.length ? status.subarray(0, -1).toString('binary').split('\0').length : 0, statusSha256: sha(status) })
    if (changed) return receipt
    runGit(repository.gitProgram, hooks, repository.root, ['worktree', 'remove', '--force', path], false, 1_000_000)
    return { ...receipt, retained: false, note: 'The isolated checkout was clean and still at the reviewed revision, so it was removed. Command output remains in the run record.' }
  } catch (error) {
    return { ...receipt, note: `${(error as Error).message} The checkout was not automatically removed, merged, or retried.` }
  }
}
