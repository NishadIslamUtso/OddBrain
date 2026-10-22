/**
 * The memory folder's reader: what the engine wrote, listed for the owner.
 * Reads only inside the vault's memory folder — the path is validated
 * against tricks before anything opens — and removals move exactly one file
 * into owner-restorable Trash, never a glob or permanent deletion.
 */
import { constants } from 'node:fs'
import { copyFile, mkdir, open, readFile, realpath, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, sep } from 'node:path'
import { MEMORY_DIR, MEMORY_READ_CAP, safeMemoryRelative, type MemoryFile, type MemoryTrashFile } from '../shared/lib/memory'
import { hashRegularFileSync } from './safeFile'

export type MemoryListAnswer = {
  ok: boolean
  answer?: string
  folder?: string
  files?: MemoryFile[]
}

export type MemoryTrashListAnswer = {
  ok: boolean
  answer?: string
  folder?: string
  files?: MemoryTrashFile[]
}

type TrashRecord = { schema: 1; id: string; originalName: string; trashedAt: string }
const TRASH_ID = /^[a-f0-9]{8}-[a-f0-9-]{27}$/

export function createMemoryManager(vaultRoot: () => string, customFolder: () => string = () => '') {
  const folder = (): string => customFolder() || join(vaultRoot(), MEMORY_DIR)
  const trashFolder = (): string => join(folder(), '.oddbrain-trash')

  const list = async (): Promise<MemoryListAnswer> => {
    let names: string[]
    try {
      names = (await readdir(folder(), { withFileTypes: true }))
        .filter(entry => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith('.md'))
        .map(entry => entry.name)
        .sort()
    } catch {
      // No folder yet: the engine has remembered nothing. That is honest.
      return { ok: true, folder: folder(), files: [] }
    }
    const files: MemoryFile[] = []
    for (const name of names) {
      const full = join(folder(), name)
      try {
        // A symlink inside the memory folder is NOT memory. Open the leaf with
        // no-follow and validate that same handle before reading from it.
        const descriptor = await open(full, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
        try {
          const before = await descriptor.stat()
          if (!before.isFile() || before.size > 8_000_000) continue
          const raw = await descriptor.readFile('utf8')
          const after = await descriptor.stat()
          if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) continue
          files.push({
            name,
            path: `${MEMORY_DIR}/${name}`,
            updated: after.mtime.toISOString(),
            content: raw.length > MEMORY_READ_CAP ? raw.slice(0, MEMORY_READ_CAP) : raw,
            clipped: raw.length > MEMORY_READ_CAP,
          })
        } finally { await descriptor.close() }
      } catch {
        continue
      }
    }
    return { ok: true, folder: folder(), files }
  }

  /**
   * The real folder, resolved: the final containment check. The name guard is
   * lexical; this one is the filesystem's own truth — a symlink that slipped
   * in resolves to somewhere else and is refused before it is read or removed.
   */
  const realFolder = async (): Promise<string> => realpath(folder())

  const contained = async (full: string): Promise<boolean> => {
    const realFile = await realpath(full)
    return realFile === (await realFolder()) || realFile.startsWith(`${await realFolder()}${sep}`)
  }

  const remove = async (name: string, expectedFolder?: string): Promise<{ ok: boolean; answer: string }> => {
    if (expectedFolder && expectedFolder !== folder()) return { ok: false, answer: 'The memory folder changed. Refresh before moving a file to Trash.' }
    const checked = safeMemoryRelative(name)
    if (!checked.ok) return checked
    const originalName = checked.rel.slice(MEMORY_DIR.length + 1)
    // The visible manager currently lists only top-level markdown notes. Refuse
    // a hidden nested path rather than inventing a restore destination.
    if (!originalName || originalName.includes('/') || originalName.includes('\\')) return { ok: false, answer: 'Only a listed memory note can be moved to Trash.' }
    const full = join(folder(), originalName)
    const id = randomUUID(), trashedAt = new Date().toISOString()
    const entry = join(trashFolder(), id)
    try {
      if (!(await contained(full))) return { ok: false, answer: 'That path is not really inside the memory folder.' }
      const descriptor = await open(full, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
      try { if (!(await descriptor.stat()).isFile()) return { ok: false, answer: 'That memory item is not a regular file.' } } finally { await descriptor.close() }
      await mkdir(trashFolder(), { recursive: true, mode: 0o700 })
      if ((await realpath(trashFolder())) !== join(await realFolder(), '.oddbrain-trash')) throw Error('The recoverable Trash path is not the memory folder it claims to be.')
      await mkdir(entry, { recursive: false, mode: 0o700 })
      const record: TrashRecord = { schema: 1, id, originalName, trashedAt }
      await writeFile(join(entry, 'record.json'), JSON.stringify(record), { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      await rename(full, join(entry, 'content.md'))
      return { ok: true, answer: `Moved ${checked.rel} to recoverable Trash. Its exact markdown is retained until you restore it.` }
    } catch (failure) {
      try { await rm(entry, { recursive: true, force: true }) } catch { /* original error remains authoritative */ }
      const code = (failure as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { ok: false, answer: 'That memory file does not exist.' }
      return { ok: false, answer: `Could not move to Trash: ${(failure as Error).message}` }
    }
  }

  const listTrash = async (): Promise<MemoryTrashListAnswer> => {
    let entries: string[]
    try {
      entries = (await readdir(trashFolder(), { withFileTypes: true }))
        .filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && TRASH_ID.test(entry.name))
        .map(entry => entry.name)
    } catch (failure) {
      if ((failure as NodeJS.ErrnoException).code === 'ENOENT') return { ok: true, folder: folder(), files: [] }
      return { ok: false, answer: 'Recoverable memory Trash could not be read.', folder: folder(), files: [] }
    }
    const files: MemoryTrashFile[] = []
    for (const id of entries) {
      try {
        const entry = join(trashFolder(), id)
        const recordBytes = await readFile(join(entry, 'record.json'))
        if (recordBytes.length > 4_096) continue
        const record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(recordBytes)) as TrashRecord
        if (record?.schema !== 1 || record.id !== id || typeof record.trashedAt !== 'string' || Number.isNaN(Date.parse(record.trashedAt)) || typeof record.originalName !== 'string' || record.originalName.includes('/') || record.originalName.includes('\\')) continue
        const checked = safeMemoryRelative(`${MEMORY_DIR}/${record.originalName}`)
        if (!checked.ok) continue
        const contentPath = join(entry, 'content.md')
        const descriptor = await open(contentPath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
        try {
          const before = await descriptor.stat()
          if (!before.isFile() || before.size > 8_000_000) continue
          const raw = await descriptor.readFile('utf8')
          const after = await descriptor.stat()
          if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) continue
          files.push({ id, name: record.originalName, path: checked.rel, trashedAt: record.trashedAt, updated: after.mtime.toISOString(), content: raw.length > MEMORY_READ_CAP ? raw.slice(0, MEMORY_READ_CAP) : raw, clipped: raw.length > MEMORY_READ_CAP })
        } finally { await descriptor.close() }
      } catch { /* A damaged entry is retained on disk and omitted, never repaired. */ }
    }
    files.sort((left, right) => right.trashedAt.localeCompare(left.trashedAt))
    return { ok: true, folder: folder(), files }
  }

  const restore = async (id: string, expectedFolder?: string): Promise<{ ok: boolean; answer: string }> => {
    if (expectedFolder && expectedFolder !== folder()) return { ok: false, answer: 'The memory folder changed. Refresh before restoring a file.' }
    if (!TRASH_ID.test(id)) return { ok: false, answer: 'That Trash entry is invalid.' }
    const entry = join(trashFolder(), id)
    try {
      const recordBytes = await readFile(join(entry, 'record.json'))
      if (recordBytes.length > 4_096) throw Error('The Trash record is too large.')
      const record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(recordBytes)) as TrashRecord
      if (record?.schema !== 1 || record.id !== id || typeof record.originalName !== 'string' || record.originalName.includes('/') || record.originalName.includes('\\')) throw Error('The Trash record is damaged.')
      const checked = safeMemoryRelative(`${MEMORY_DIR}/${record.originalName}`)
      if (!checked.ok) throw Error(checked.answer)
      const source = join(entry, 'content.md'), destination = join(folder(), record.originalName)
      if (!(await contained(source))) throw Error('The Trash content is not really inside the memory folder.')
      // COPYFILE_EXCL makes a concurrent/new note win: restoration never
      // replaces active owner memory. The Trash copy remains after any failure.
      const expected = hashRegularFileSync(source)
      await copyFile(source, destination, constants.COPYFILE_EXCL)
      try { hashRegularFileSync(destination, expected) } catch (error) { try { await unlink(destination) } catch { /* surface the verification failure */ }; throw error }
      try { await rm(entry, { recursive: true, force: false }) } catch {
        return { ok: true, answer: `Restored ${checked.rel}. A duplicate recovery copy remains in Trash because cleanup was interrupted.` }
      }
      return { ok: true, answer: `Restored ${checked.rel}. No active note was replaced.` }
    } catch (failure) {
      const code = (failure as NodeJS.ErrnoException).code
      if (code === 'EEXIST') return { ok: false, answer: 'A memory note with that name already exists. It was not replaced; the Trash copy is unchanged.' }
      if (code === 'ENOENT') return { ok: false, answer: 'That recoverable memory item no longer exists.' }
      return { ok: false, answer: `Could not restore: ${(failure as Error).message}` }
    }
  }

  const read = async (name: string): Promise<{ ok: boolean; content?: string; answer?: string }> => {
    const checked = safeMemoryRelative(name)
    if (!checked.ok) return checked
    const full = join(folder(), checked.rel.slice(MEMORY_DIR.length + 1))
    try {
      if (!(await contained(full))) return { ok: false, answer: 'That path is not really inside the memory folder.' }
      return { ok: true, content: await readFile(full, 'utf8') }
    } catch (failure) {
      const code = (failure as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { ok: false, answer: 'That memory file does not exist yet.' }
      return { ok: false, answer: `Could not read: ${(failure as Error).message}` }
    }
  }

  return { list, listTrash, remove, restore, read }
}

export type MemoryManager = ReturnType<typeof createMemoryManager>
