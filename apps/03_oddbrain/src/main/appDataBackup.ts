import { createHash } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { copyRegularFileVerifiedSync, hashRegularFileSync, readRegularFileSync } from './safeFile'

const MANIFEST = 'oddbrain-app-data-backup.json'
const MAX_FILES = 50_000
const MAX_MANIFEST_BYTES = 20_000_000
const DIRECTORIES = ['chats-v1', 'working-notes-v1', 'turn-transcripts', 'attachment-center', 'processing', 'artifacts', 'recipes', 'handoffs', 'workflows', 'command-runs', 'checkpoints', 'automation.json.reviews']
const FILES = ['projects.json', 'battle-ledger.json', 'hooks.json', 'house-rules.json', 'sessions-board.json', 'automation.json', 'media.json', 'video-studio.json']
const EXCLUDED = ['credentials and API keys', 'extension pairing secrets', 'saved read approvals and project file grants', 'engine session IDs and installed engines/models', 'installed extension packages and caches', 'workflow signing secrets and schedule/queue attempts', 'unselected external files']
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

type Entry = { path: string; bytes: number; sha256: string }
type Manifest = { format: 'oddbrain-app-data-backup-v1'; createdAt: string; files: Entry[]; excluded: string[] }
function inside(root: string, path: string): boolean { const rel = relative(resolve(root), resolve(path)); return rel !== '..' && !rel.startsWith(`..${sep}`) && !resolve(path).startsWith(resolve(root) + sep + '..') }
function walk(root: string, relativePath: string, out: string[]): void {
  const full = join(root, relativePath), stat = lstatSync(full)
  if (stat.isSymbolicLink()) throw Error(`Backup refused a linked path: ${relativePath}`)
  if (stat.isFile()) { out.push(relativePath.replaceAll('\\', '/')); return }
  if (!stat.isDirectory()) throw Error(`Backup refused a non-file entry: ${relativePath}`)
  for (const name of readdirSync(full)) walk(root, join(relativePath, name), out)
}
function selectedFiles(root: string): string[] {
  const out: string[] = []
  for (const item of [...DIRECTORIES, ...FILES]) if (existsSync(join(root, item))) walk(root, item, out)
  return out.sort()
}
function writeExclusive(path: string, bytes: Buffer | string): void { mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); const fd = openSync(path, 'wx', 0o600); try { writeFileSync(fd, bytes); fsyncSync(fd) } finally { closeSync(fd) } }
function manifestAt(folder: string): Manifest {
  const manifestPath = join(folder, MANIFEST)
  const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readRegularFileSync(manifestPath, MAX_MANIFEST_BYTES).bytes)) as Manifest
  if (parsed?.format !== 'oddbrain-app-data-backup-v1' || !Array.isArray(parsed.files) || parsed.files.length > MAX_FILES || !Array.isArray(parsed.excluded)) throw Error('This is not a supported OddBrain app-data backup.')
  const names = new Set<string>(); let total = 0
  for (const entry of parsed.files) {
    if (!entry || typeof entry.path !== 'string' || !entry.path || entry.path.includes('\\') || entry.path.split('/').some(part => !part || part === '.' || part === '..') || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) || names.has(entry.path)) throw Error('The app-data backup manifest is damaged.')
    total += entry.bytes
    if (!Number.isSafeInteger(total)) throw Error('The app-data backup byte total is not safely representable.')
    names.add(entry.path)
  }
  return parsed
}
function verify(folder: string, manifest: Manifest): void {
  for (const entry of manifest.files) {
    const file = resolve(folder, 'data', ...entry.path.split('/'))
    if (!inside(resolve(folder, 'data'), file)) throw Error('Backup path escaped its data folder.')
    try { hashRegularFileSync(file, { bytes: entry.bytes, sha256: entry.sha256 }) }
    catch { throw Error(`Backup verification failed: ${entry.path}`) }
  }
}

export function createAppDataBackup(root: string, destination: string, rendererPreferences: Record<string, string>): { files: number; bytes: number } {
  if (existsSync(destination)) throw Error('Backup destination already exists. Nothing was replaced.')
  const preferenceText = JSON.stringify(rendererPreferences, null, 2)
  if (Buffer.byteLength(preferenceText) > 5_000_000 || Object.entries(rendererPreferences).some(([key, value]) => key.length > 500 || typeof value !== 'string')) throw Error('Renderer preferences exceed the 5 MB backup limit. Nothing was shortened.')
  mkdirSync(destination, { recursive: false, mode: 0o700 })
  try {
    const files = selectedFiles(root), entries: Entry[] = []
    if (files.length + 1 > MAX_FILES) throw Error(`Selected app-private data exceeds ${MAX_FILES.toLocaleString()} files. Nothing was omitted.`)
    let total = 0
    for (const path of files) {
      const source = resolve(root, ...path.split('/')); if (!inside(root, source)) throw Error('App-data path escaped its root.')
      const target = resolve(destination, 'data', ...path.split('/')); mkdirSync(dirname(target), { recursive: true, mode: 0o700 })
      const copied = copyRegularFileVerifiedSync(source, target)
      total += copied.bytes
      if (!Number.isSafeInteger(total)) throw Error('Selected app-private data has an unsafe byte total. Nothing was omitted.')
      entries.push({ path, bytes: copied.bytes, sha256: copied.sha256 })
    }
    const preferenceBytes = Buffer.from(preferenceText)
    if (!Number.isSafeInteger(total + preferenceBytes.length)) throw Error('Selected app-private data has an unsafe byte total. Nothing was omitted.')
    writeExclusive(join(destination, 'data', 'renderer-preferences.json'), preferenceBytes)
    entries.push({ path: 'renderer-preferences.json', bytes: preferenceBytes.length, sha256: sha(preferenceBytes) }); total += preferenceBytes.length
    const manifest: Manifest = { format: 'oddbrain-app-data-backup-v1', createdAt: new Date().toISOString(), files: entries, excluded: EXCLUDED }
    writeExclusive(join(destination, MANIFEST), JSON.stringify(manifest, null, 2))
    verify(destination, manifest)
    return { files: entries.length, bytes: total }
  } catch (error) { rmSync(destination, { recursive: true, force: true }); throw error }
}

/** Restore is deliberately separate: verify and copy into a new folder, never into live app data. */
export function restoreAppDataBackup(source: string, destination: string): { files: number; bytes: number } {
  if (existsSync(destination)) throw Error('Restore destination already exists. Nothing was replaced.')
  const manifest = manifestAt(source); verify(source, manifest)
  mkdirSync(destination, { recursive: false, mode: 0o700 })
  try {
    let total = 0
    for (const entry of manifest.files) {
      const from = resolve(source, 'data', ...entry.path.split('/')), to = resolve(destination, ...entry.path.split('/'))
      if (!inside(destination, to)) throw Error('Restore path escaped its new folder.')
      mkdirSync(dirname(to), { recursive: true, mode: 0o700 })
      try { copyRegularFileVerifiedSync(from, to, { bytes: entry.bytes, sha256: entry.sha256 }); hashRegularFileSync(to, { bytes: entry.bytes, sha256: entry.sha256 }) }
      catch { throw Error(`Restored copy could not be verified: ${entry.path}`) }
      total += entry.bytes
    }
    writeExclusive(join(destination, MANIFEST), JSON.stringify(manifest, null, 2))
    return { files: manifest.files.length, bytes: total }
  } catch (error) { rmSync(destination, { recursive: true, force: true }); throw error }
}

export const appDataBackupExclusions = (): string[] => [...EXCLUDED]
