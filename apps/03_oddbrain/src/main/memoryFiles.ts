/**
 * The memory folder's reader: what the engine wrote, listed for the owner.
 * Reads only inside the vault's memory folder — the path is validated
 * against tricks before anything opens — and deletes are exactly one file,
 * never a glob.
 */
import { constants } from 'node:fs'
import { open, readFile, realpath, readdir, rm } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { MEMORY_DIR, MEMORY_READ_CAP, safeMemoryRelative, type MemoryFile } from '../shared/lib/memory'

export type MemoryListAnswer = {
  ok: boolean
  answer?: string
  folder?: string
  files?: MemoryFile[]
}

export function createMemoryManager(vaultRoot: () => string, customFolder: () => string = () => '') {
  const folder = (): string => customFolder() || join(vaultRoot(), MEMORY_DIR)

  const list = async (): Promise<MemoryListAnswer> => {
    let names: string[]
    try {
      names = (await readdir(folder())).filter(entry => entry.endsWith('.md')).sort()
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
    if (expectedFolder && expectedFolder !== folder()) return { ok: false, answer: 'The memory folder changed. Refresh before removing a file.' }
    const checked = safeMemoryRelative(name)
    if (!checked.ok) return checked
    const full = join(folder(), checked.rel.slice(MEMORY_DIR.length + 1))
    try {
      if (!(await contained(full))) return { ok: false, answer: 'That path is not really inside the memory folder.' }
      await rm(full, { force: false })
      return { ok: true, answer: `Removed ${checked.rel}. The lines are gone; nothing was kept in secret.` }
    } catch (failure) {
      const code = (failure as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { ok: false, answer: 'That memory file does not exist.' }
      return { ok: false, answer: `Could not remove: ${(failure as Error).message}` }
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

  return { list, remove, read }
}

export type MemoryManager = ReturnType<typeof createMemoryManager>
