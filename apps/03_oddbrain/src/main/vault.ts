import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { VaultFile, VaultReadReply, VaultReply } from '../shared/desktop'

const MAX_FILES = 240
const MAX_FILE_BYTES = 128 * 1024
const humanError = (cause: unknown): string =>
  cause instanceof Error ? cause.message : 'Folder could not be read.'
const within = (root: string, target: string): boolean =>
  target === root || (target.startsWith(root + sep) && !relative(root, target).startsWith('..'))

/** Do not follow symlinks or let renderer-provided paths escape the chosen folder. */
export function createVaultReader(getFolder: () => string) {
  const root = async (): Promise<string> => {
    const folder = getFolder()
    if (!folder) throw new Error('Choose a folder in the installed app first.')
    const real = await realpath(folder)
    if (!(await stat(real)).isDirectory()) throw new Error('The chosen folder is not a directory.')
    return real
  }
  const guardedPath = async (base: string, path: string): Promise<string> => {
    if (
      !path ||
      path.length > 600 ||
      path.includes('\0') ||
      isAbsolute(path) ||
      path.split(/[\\/]/).some((part) => part === '..' || part === '.' || part === '')
    )
      throw new Error('That note is outside the chosen folder.')
    const full = resolve(base, path)
    if (!within(base, full) || !/\.md$/i.test(full))
      throw new Error('Only Markdown notes in the chosen folder can be read.')
    let part = base
    for (const segment of relative(base, full).split(sep)) {
      part = join(part, segment)
      if ((await lstat(part)).isSymbolicLink()) throw new Error('Linked paths are not followed.')
    }
    if (!(await lstat(full)).isFile() || (await stat(full)).size > MAX_FILE_BYTES)
      throw new Error('That note cannot be read (file type or size).')
    return full
  }
  const read = async (path: string): Promise<VaultReadReply> => {
    try {
      return { ok: true, content: await readFile(await guardedPath(await root(), path), 'utf8') }
    } catch (failure) {
      return { ok: false, error: humanError(failure) }
    }
  }
  const list = async (): Promise<VaultReply> => {
    const selected = getFolder()
    try {
      const base = await root()
      const files: VaultFile[] = []
      let truncated = false
      const walk = async (folder: string, depth: number): Promise<void> => {
        if (depth > 5 || files.length >= MAX_FILES) {
          truncated = true
          return
        }
        if (!within(base, await realpath(folder)) || (await lstat(folder)).isSymbolicLink())
          throw new Error('A folder is no longer inside the chosen vault.')
        for (const entry of await readdir(folder, { withFileTypes: true })) {
          if (files.length >= MAX_FILES) {
            truncated = true
            break
          }
          if (entry.name.startsWith('.')) continue
          const full = join(folder, entry.name)
          if (entry.isSymbolicLink()) continue
          if (entry.isDirectory()) {
            await walk(full, depth + 1)
            continue
          }
          if (!entry.isFile() || !/\.md$/i.test(entry.name) || (await stat(full)).size > MAX_FILE_BYTES)
            continue
          const safe = await guardedPath(base, relative(base, full))
          const info = await stat(safe)
          files.push({
            path: relative(base, safe).split(sep).join('/'),
            bytes: info.size,
            modified: info.mtime.toISOString(),
            content: await readFile(safe, 'utf8'),
          })
        }
      }
      await walk(base, 0)
      files.sort((a, b) => a.path.localeCompare(b.path))
      return { ok: true, folder: selected, files, truncated }
    } catch (failure) {
      return { ok: false, folder: selected, error: humanError(failure) }
    }
  }
  return { list, read }
}

/** Persist only an explicit, native-picker folder selection. */
export async function saveVaultFolder(preferenceFile: string, folder: string): Promise<void> {
  const real = await realpath(folder)
  if (!(await stat(real)).isDirectory()) throw new Error('Choose a readable folder.')
  const parent = dirname(preferenceFile)
  await mkdir(parent, { recursive: true })
  const temporary = join(parent, `.vault-${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, real, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await rename(temporary, preferenceFile)
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
  }
}
