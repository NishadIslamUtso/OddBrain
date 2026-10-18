/**
 * The memory folder's reader: what the engine wrote, listed for the owner.
 * Reads only inside the vault's memory folder — the path is validated
 * against tricks before anything opens — and deletes are exactly one file,
 * never a glob.
 */
import { lstat, readFile, realpath, readdir, rm } from 'node:fs/promises'
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
    const selected = folder()
    let names: string[]
    try {
      names = (await readdir(selected)).filter(entry => entry.endsWith('.md')).sort()
    } catch (failure) {
      // A missing *default* folder means no memory yet. A vanished selected
      // folder or an unreadable directory is not an empty memory folder.
      if ((failure as NodeJS.ErrnoException).code === 'ENOENT' && !customFolder()) return { ok: true, folder: selected, files: [] }
      return { ok: false, folder: selected, answer: `The memory folder could not be read: ${(failure as Error).message}` }
    }
    const files: MemoryFile[] = []
    let skipped = 0
    for (const name of names) {
      const full = join(selected, name)
      try {
        // A symlink inside the memory folder is NOT memory — it can point
        // anywhere on the disk, so listing follows only real files (the vault
        // service makes the same refusal with the same reasoning).
        const info = await lstat(full)
        if (!info.isFile() || info.isSymbolicLink()) { skipped++; continue }
        const raw = await readFile(full, 'utf8')
        files.push({
          name,
          path: `${MEMORY_DIR}/${name}`,
          updated: info.mtime.toISOString(),
          content: raw.length > MEMORY_READ_CAP ? raw.slice(0, MEMORY_READ_CAP) : raw,
          clipped: raw.length > MEMORY_READ_CAP,
        })
      } catch {
        skipped++
      }
    }
    return { ok: true, folder: selected, files, ...(skipped ? { answer: `${skipped} markdown file${skipped === 1 ? ' was' : 's were'} not read (link, directory or read failure). No other path was followed.` } : {}) }
  }

  /**
   * The real folder, resolved: the final containment check. The name guard is
   * lexical; this one is the filesystem's own truth — a symlink that slipped
   * in resolves to somewhere else and is refused before it is read or removed.
   */
  const contained = async (full: string, selected: string): Promise<boolean> => {
    const realFile = await realpath(full), realFolder = await realpath(selected)
    return realFile.startsWith(`${realFolder}${sep}`)
  }

  const remove = async (name: string, expectedFolder?: string): Promise<{ ok: boolean; answer: string }> => {
    const selected = folder()
    if (expectedFolder && expectedFolder !== selected) return { ok: false, answer: 'The memory folder changed. Refresh before removing a file.' }
    const checked = safeMemoryRelative(name)
    if (!checked.ok) return checked
    const full = join(selected, checked.rel.slice(MEMORY_DIR.length + 1))
    try {
      if (!(await contained(full, selected)) || selected !== folder()) return { ok: false, answer: 'The memory folder changed or that path is outside it. Refresh before removing.' }
      await rm(full, { force: false })
      return { ok: true, answer: `Removed ${checked.rel}. The lines are gone; nothing was kept in secret.` }
    } catch (failure) {
      const code = (failure as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { ok: false, answer: 'That memory file does not exist.' }
      return { ok: false, answer: `Could not remove: ${(failure as Error).message}` }
    }
  }

  const read = async (name: string): Promise<{ ok: boolean; content?: string; answer?: string }> => {
    const selected = folder()
    const checked = safeMemoryRelative(name)
    if (!checked.ok) return checked
    const full = join(selected, checked.rel.slice(MEMORY_DIR.length + 1))
    try {
      if (!(await contained(full, selected)) || selected !== folder()) return { ok: false, answer: 'The memory folder changed or that path is outside it. Refresh before reading.' }
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
