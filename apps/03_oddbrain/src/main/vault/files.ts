/**
 * The vault on disk. Every read and write in this app goes through here, so the
 * rules about where a file may live are in exactly one place.
 *
 * Three rules, and each one has a test behind it:
 *
 * - Nothing outside the vault root, ever. A path that escapes is refused, not
 *   clamped into place — "it worked but wrote somewhere else" is worse than an
 *   error.
 * - A symlink that leads out of the vault is refused before anything is written,
 *   including a symlink on a directory that does not exist yet.
 * - A source file is written once. Captures are evidence, so a re-capture
 *   deduplicates instead of overwriting history.
 */
import { createHash } from 'node:crypto'
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { InputError } from './errors'
import { readRegularFileSync, readRegularHeadSync } from '../safeFile'

/**
 * Vault-relative keys speak the Obsidian dialect: forward slashes, whatever
 * the host separator is. Files on disk stay platform-true; keys that cross
 * into answers, routes and the renderer are normalized here so a vault syncs
 * and renders identically on every OS.
 */
export function toPosix(relative: string): string {
  return relative.split(sep).join('/')
}
import { dhakaParts } from './text'

export function createVaultFiles(root: string, clock: () => Date) {
  root = resolve(root)
  const realRoot = realpathSync(root)

  function filePath(relative: string): string {
    const full = resolve(root, relative)
    // The root itself is inside the vault (an empty relative path); anything
    // short of it that does not sit under the root is an escape.
    if (full !== root && !full.startsWith(root + sep)) throw new InputError('Path outside vault.')
    // existsSync follows links, so a dangling link looks absent. Inspect every
    // existing component first, including the leaf, before any read or write.
    let ancestor = full
    while (ancestor !== root) {
      try { if (lstatSync(ancestor).isSymbolicLink()) throw new InputError('Symlink outside vault or unsupported linked path.') }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      ancestor = dirname(ancestor)
    }
    return full
  }

  function ensureDirectory(relative: string): string {
    const full = filePath(relative)
    let ancestor = full
    while (!existsSync(ancestor)) ancestor = dirname(ancestor)
    const existingReal = realpathSync(ancestor)
    if (existingReal !== realRoot && !existingReal.startsWith(realRoot + sep)) {
      throw new InputError('Symlink outside vault.')
    }
    mkdirSync(full, { recursive: true })
    const real = realpathSync(full)
    if (real !== realRoot && !real.startsWith(realRoot + sep)) throw new InputError('Symlink outside vault.')
    return full
  }

  /**
   * Whether a file is there to read. A preview that cannot tell this apart from
   * an empty file shows a blank pane and calls it a note; the two answers are
   * different and the interface needs the true one.
   */
  const MAX_VAULT_FILE_BYTES = 128_000_000

  function exists(relative: string): boolean {
    try { return readRegularHeadSync(filePath(relative), 1).stat.isFile() }
    catch (error) { if (error instanceof InputError) throw error; return false }
  }

  function read(relative: string): string {
    try { return readRegularFileSync(filePath(relative), MAX_VAULT_FILE_BYTES).bytes.toString('utf8') }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw error }
  }

  function readBytes(relative: string): Buffer {
    try { return readRegularFileSync(filePath(relative), MAX_VAULT_FILE_BYTES).bytes }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return Buffer.alloc(0); throw error }
  }

  /** Replace projections/checkpoints atomically; immutable source revisions use writeOnce. */
  function writeAtomic(relative: string, content: string): void {
    ensureDirectory(dirname(relative))
    const full = filePath(relative)
    // Stage inside a fresh owner-only directory on the destination filesystem,
    // then atomically replace the leaf. A fixed temp filename is never exposed.
    // Stage at the vault root to keep Windows paths below MAX_PATH even when
    // the destination itself is deeply nested. It remains on the same volume.
    const staging = mkdtempSync(resolve(root, '.oddbrain-write-'))
    const temporary = resolve(staging, 'content')
    try {
      writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 })
      renameSync(temporary, full)
    } finally {
      rmSync(staging, { recursive: true, force: true })
    }
  }

  /** Write a file only if it is not there yet. Returns true when it already was. */
  function writeOnce(relative: string, content: string | Uint8Array): boolean {
    ensureDirectory(dirname(relative))
    const full = filePath(relative)
    try {
      const descriptor = openSync(full, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW || 0), 0o600)
      try { writeFileSync(descriptor, content); fsyncSync(descriptor) } finally { closeSync(descriptor) }
      return false
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return true
      throw error
    }
  }

  /** Remove one verified transfer fragment after its assembled immutable source is durable. */
  function removeVerified(relative: string, expectedSha256: string): void {
    if (!/^[a-f0-9]{64}$/.test(expectedSha256)) throw new InputError('Invalid cleanup checksum.')
    const full = filePath(relative), bytes = readRegularFileSync(full, 2_000_000).bytes
    if (createHash('sha256').update(bytes).digest('hex') !== expectedSha256) throw new InputError('Transfer fragment changed before cleanup; it was preserved.')
    unlinkSync(full)
  }

  function append(relative: string, text: string): void {
    ensureDirectory(dirname(relative))
    const full = filePath(relative)
    const descriptor = openSync(full, constants.O_CREAT | constants.O_APPEND | constants.O_WRONLY | (constants.O_NOFOLLOW || 0), 0o600)
    try {
      if (!fstatSync(descriptor).isFile()) throw new InputError('Vault destination is not a regular file.')
      writeFileSync(descriptor, text)
    } finally { closeSync(descriptor) }
  }

  function write(relative: string, text: string): void {
    writeAtomic(relative, text)
  }

  /** The plain-language log of what the app did, in the vault, on the user's side. */
  function activity(message: string): void {
    const now = clock()
    const { year, month } = dhakaParts(now)
    append(
      `09 Activity & Undo/${year}/${month}.md`,
      `- [${now.toISOString()}] ${message.replace(/\r?\n/g, ' ')}\n`
    )
  }

  /** How many files the vault holds, for the status line. Unreadable parts are skipped. */
  function countFiles(): number {
    let files = 0
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue
        const full = resolve(directory, entry.name)
        if (entry.isDirectory()) walk(full)
        else files += 1
      }
    }
    try {
      walk(root)
    } catch {
      /* Partially unreadable vault: report what counted rather than nothing. */
    }
    return files
  }

  /**
   * The first `limit` bytes of a file, for reading a heading or a frontmatter
   * block without loading a whole capture into memory. A map of what the vault
   * holds must be cheap: it looks at thousands of files, and only reads the part
   * that says what each one is.
   */
  function readHead(relative: string, limit = 8 * 1024): string {
    try { return readRegularHeadSync(filePath(relative), Math.max(1, limit)).bytes.toString('utf8') }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''; throw error }
  }

  /** How big a file is, for a map that says how much was kept. 0 when absent. */
  function size(relative: string): number {
    try { return readRegularHeadSync(filePath(relative), 1).stat.size }
    catch { return 0 }
  }

  /**
   * Every file under a folder whose name ends with `extension`, as vault-relative
   * paths, newest directory first. Bounded on purpose: a walk that decides how
   * much work to do is the difference between a map and a hang, so it stops at
   * `limit` files and says that it stopped.
   */
  function walkFiles(
    relative: string,
    extension: string,
    limit = 4000
  ): { files: string[]; capped: boolean; incomplete?: boolean; issues?: string[] } {
    const directory = filePath(relative)
    if (!existsSync(directory)) return { files: [], capped: false }
    const files: string[] = []
    let capped = false
    let visited = 0
    const issues: string[] = []
    const walk = (current: string): void => {
      if (capped) return
      let entries: import('node:fs').Dirent[]
      try {
        filePath(toPosix(current.slice(root.length + 1)))
        entries = readdirSync(current, { withFileTypes: true })
      } catch {
        issues.push(`Could not read ${current}`)
        return
      }
      for (const entry of entries) {
        if (capped) return
        if (entry.name.startsWith('.')) continue
        const full = resolve(current, entry.name)
        if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) { issues.push(`Unsupported linked or special entry: ${full}`); continue }
        if (entry.isDirectory()) {
          visited += 1
          if (visited > limit) {
            capped = true
            return
          }
          walk(full)
          continue
        }
        if (!entry.name.endsWith(extension)) continue
        files.push(toPosix(full.slice(root.length + 1)))
        if (files.length >= limit) {
          capped = true
          return
        }
      }
    }
    try {
      walk(directory)
    } catch {
      issues.push('The source walk could not finish.')
    }
    return { files, capped, ...(issues.length ? { incomplete: true, issues } : {}) }
  }

  /** Markdown file names in one folder, for the entity library. */
  function listMarkdown(relative: string): string[] {
    const directory = filePath(relative)
    if (!existsSync(directory)) return []
    return readdirSync(directory, { withFileTypes: true }).filter(file => file.isFile() && file.name.endsWith('.md')).map(file => file.name)
  }

  return {
    root,
    filePath,
    ensureDirectory,
    exists,
    read,
    readHead,
    readBytes,
    writeAtomic,
    writeOnce,
    removeVerified,
    write,
    append,
    activity,
    countFiles,
    listMarkdown,
    walkFiles,
    size,
  }
}

export type VaultFiles = ReturnType<typeof createVaultFiles>
