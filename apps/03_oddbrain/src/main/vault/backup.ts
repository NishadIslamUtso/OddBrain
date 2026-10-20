/** Full vault bytes, not a Markdown export. Restore only into a NEW folder.
 * No extraction, overwrites, symlinks, credentials outside the vault or network.
 * Bounds and failures are explicit; partial directories are never called backups. */
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, realpathSync, rmSync, writeFileSync, writeSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, sep } from 'node:path'
const MAX_FILES = 50000, MAX_BYTES = 2 * 1024 ** 3
const MANIFEST = 'oddbrain-backup.json'
type Entry = { path: string; bytes: number; sha256: string }
type Manifest = { version: 1; created: string; files: Entry[] }
export type BackupResult = { ok: true; destination: string; count: number; bytes: number } | { ok: false; answer: string }
function noLinks(path: string): string {
  let current = resolve(path)
  for (;;) {
    if (lstatSync(current).isSymbolicLink()) throw Error('Linked paths are not supported for backups or restores.')
    if (current === dirname(current)) break
    current = dirname(current)
  }
  return realpathSync(path)
}
function safePath(path: unknown): string {
  if (typeof path !== 'string' || !path || path.length > 2000 || /[\\:<>"?*|\x00-\x1f]/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw Error('The backup contains an unsafe path.')
  return path
}
function inventory(root: string): Array<{ path: string; bytes: number }> {
  const result: Array<{ path: string; bytes: number }> = []; let bytes = 0, visited = 0
  const visit = (relative: string, depth: number) => {
    if (depth > 100) throw Error('The folder structure exceeds the backup safety limit.')
    for (const name of readdirSync(join(root, relative)).sort()) {
      if (++visited > MAX_FILES * 2) throw Error('The folder structure exceeds the backup safety limit.')
      const path = safePath(relative ? relative + '/' + name : name), stat = lstatSync(join(root, path))
      if (stat.isSymbolicLink()) throw Error('The vault contains a linked path. No complete backup was made.')
      if (stat.isDirectory()) visit(path, depth + 1)
      else if (stat.isFile()) {
        bytes += stat.size
        if (result.length >= MAX_FILES || bytes > MAX_BYTES) throw Error('This operation supports up to 50,000 files and 2 GiB. Use a filesystem backup for this larger vault.')
        result.push({ path, bytes: stat.size })
      } else throw Error('The vault contains a non-regular file. No complete backup was made.')
    }
  }
  visit('', 0); return result
}
/** Hash what was copied, checking for edits while reading. Never follow a link. */
function stream(source: string, target?: string): { bytes: number; sha256: string } {
  noLinks(source)
  const input = openSync(source, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
  let output: number | undefined
  try {
    const before = fstatSync(input)
    if (!before.isFile() || before.size > MAX_BYTES) throw Error('Invalid backup file.')
    if (target) { mkdirSync(dirname(target), { recursive: true, mode: 0o700 }); output = openSync(target, 'wx', 0o600) }
    const digest = createHash('sha256'), buffer = Buffer.alloc(1024 * 1024); let bytes = 0
    for (;;) {
      const count = readSync(input, buffer, 0, buffer.length, null)
      if (!count) break
      bytes += count
      if (bytes > before.size) throw Error('A file changed during the copy. Pause captures and try again.')
      digest.update(buffer.subarray(0, count))
      if (output !== undefined) for (let offset = 0; offset < count;) { const n = writeSync(output, buffer, offset, count - offset); if (!n) throw Error('The backup destination stopped accepting data.'); offset += n }
    }
    const after = fstatSync(input), pathAfter = lstatSync(source)
    if (bytes !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || pathAfter.isSymbolicLink() || pathAfter.ino !== before.ino || pathAfter.dev !== before.dev) throw Error('A file changed during the copy. Pause captures and try again.')
    return { bytes, sha256: digest.digest('hex') }
  } finally { if (output !== undefined) closeSync(output); closeSync(input) }
}
function check(root: string, entries: Entry[]): void {
  const all = inventory(root), expected = new Map(entries.map(e => [e.path, e.bytes]))
  if (all.length !== entries.length || all.some(file => expected.get(file.path) !== file.bytes)) throw Error('The file list changed or does not match the backup manifest.')
  for (const entry of entries) { const actual = stream(join(root, entry.path)); if (actual.bytes !== entry.bytes || actual.sha256 !== entry.sha256) throw Error('Backup verification failed: ' + entry.path) }
}
function destinationOutside(source: string, destination: string): string {
  const parent = noLinks(dirname(resolve(destination))), target = join(parent, resolve(destination).slice(dirname(resolve(destination)).length + 1))
  if (target === source || target.startsWith(source + sep)) throw Error('Choose a destination outside the source folder.')
  return target
}
function manifestAt(root: string): Manifest {
  noLinks(join(root, MANIFEST))
  if (lstatSync(join(root, MANIFEST)).size > 20_000_000) throw Error('The backup manifest exceeds the safety limit.')
  const m = JSON.parse(readFileSync(join(root, MANIFEST), 'utf8')) as Manifest
  if (m.version !== 1 || !Array.isArray(m.files) || m.files.length > MAX_FILES) throw Error('This is not a supported OddBrain backup.')
  let bytes = 0; const seen = new Set<string>()
  for (const e of m.files) {
    safePath(e?.path)
    if (!Number.isSafeInteger(e.bytes) || e.bytes < 0 || typeof e.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(e.sha256) || seen.has(e.path.toLowerCase())) throw Error('The backup manifest is damaged or has conflicting file names.')
    seen.add(e.path.toLowerCase()); bytes += e.bytes
  }
  if (bytes > MAX_BYTES) throw Error('The backup exceeds the 2 GiB safety limit.')
  return m
}
export function backupVault(source: string, destination: string): BackupResult {
  let owned = false, target = ''
  try {
    const root = noLinks(source); target = destinationOutside(root, destination)
    const list = inventory(root)
    if (new Set(list.map(e => e.path.toLowerCase())).size !== list.length) throw Error('File names differ only by case. Rename them before making a portable backup.')
    mkdirSync(target, { mode: 0o700 }); owned = true
    mkdirSync(join(target, 'data'), { mode: 0o700 })
    const entries = list.map(e => ({ path: e.path, ...stream(join(root, e.path), join(target, 'data', e.path)) }))
    check(root, entries); check(join(target, 'data'), entries)
    writeFileSync(join(target, MANIFEST), JSON.stringify({ version: 1, created: new Date().toISOString(), files: entries }), { flag: 'wx', mode: 0o600 })
    return { ok: true, destination: target, count: entries.length, bytes: entries.reduce((n,e) => n + e.bytes, 0) }
  } catch (e) { return failure(e, owned ? target : '') }
}
export function restoreVault(source: string, destination: string): BackupResult {
  let owned = false, target = ''
  try {
    const root = noLinks(source), manifest = manifestAt(root), data = noLinks(join(root, 'data'))
    target = destinationOutside(root, destination)
    check(data, manifest.files) // Refuse damage BEFORE creating a destination.
    mkdirSync(target, { mode: 0o700 }); owned = true
    for (const entry of manifest.files) {
      const actual = stream(join(data, entry.path), join(target, entry.path))
      if (actual.bytes !== entry.bytes || actual.sha256 !== entry.sha256) throw Error('Backup changed during restore: ' + entry.path)
    }
    check(target, manifest.files)
    return { ok: true, destination: target, count: manifest.files.length, bytes: manifest.files.reduce((n,e) => n + e.bytes, 0) }
  } catch (e) { return failure(e, owned ? target : '') }
}
function failure(error: unknown, owned: string): BackupResult {
  if (owned) try { rmSync(owned, { recursive: true, force: true }) } catch { return { ok: false, answer: 'The operation failed and its incomplete destination could not be removed. Do not use that folder as a backup or restored vault.' } }
  return { ok: false, answer: error instanceof Error ? error.message : 'The backup operation failed.' }
}
