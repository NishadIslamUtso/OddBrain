import { constants, openSync, closeSync, copyFileSync, lstatSync, fstatSync, readSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, parse, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
export function noLinkedPath(path: string): void {
  const full = resolve(path), root = parse(full).root
  let current = root
  for (const part of full.slice(root.length).split(sep)) {
    current = resolve(current, part)
    try { if (lstatSync(current).isSymbolicLink()) throw Error('Configuration paths cannot contain symlinks.') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
}
export function configBytes(path: string): Buffer | null {
  noLinkedPath(path)
  let fd: number
  try { fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0)) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
  try {
    const before = fstatSync(fd)
    if (!before.isFile() || before.size > 2_000_000) throw Error('Configuration is not a regular file within the 2 MB read limit.')
    const bytes = Buffer.alloc(before.size + 1); let size = 0
    while (size < bytes.length) { const count = readSync(fd, bytes, size, bytes.length - size, null); if (!count) break; size += count }
    const after = fstatSync(fd); noLinkedPath(path)
    if (size !== before.size || size > 2_000_000 || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw Error('Configuration changed or exceeded its limit while reading. Nothing was replaced.')
    return bytes.subarray(0, size)
  } finally { closeSync(fd) }
}

export function preserveConfig(path: string, previous: Buffer): string {
  // Never overwrite a previous backup. A collision receives a new name.
  let copy = path + '.oddbrain-original'
  try { lstatSync(copy); copy += '-' + randomUUID() } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
  noLinkedPath(copy)
  copyFileSync(path, copy, constants.COPYFILE_EXCL)
  if (!readFileSync(copy).equals(previous)) throw Error('Configuration backup verification failed. Nothing was replaced.')
  return copy
}
/** Stages every file before the first replacement; rolls back all replacements
 * on ordinary filesystem failures. This is not a power-loss multi-file journal. */
export function commitConfigs(entries: Array<{ path: string; text: string; expected?: Buffer | null }>): void {
  const staged: Array<{ path: string; temporary: string; previous: Buffer | null; written: Buffer }> = [], committed: typeof staged = []
  try {
    if (entries.some(entry => Buffer.byteLength(entry.text) > 2_000_000)) throw Error('Configuration exceeds the 2 MB save limit.')
    if (new Set(entries.map(entry => resolve(entry.path).toLowerCase())).size !== entries.length) throw Error('Configuration destinations overlap.')
    for (const entry of entries) {
      const previous = configBytes(entry.path)
      if (Object.hasOwn(entry, 'expected') && ((previous === null) !== (entry.expected === null) || (previous && entry.expected && !previous.equals(entry.expected)))) throw Error('Configuration changed since the reviewed snapshot. Nothing was replaced.')
      mkdirSync(dirname(entry.path), { recursive: true })
      const temporary = entry.path + '.' + randomUUID() + '.tmp'
      const descriptor = openSync(temporary, 'wx', 0o600)
      staged.push({ path: entry.path, temporary, previous, written: Buffer.from(entry.text) })
      try { writeFileSync(descriptor, entry.text) } finally { closeSync(descriptor) }
    }
    for (const entry of staged) {
      const current = configBytes(entry.path)
      if ((current === null) !== (entry.previous === null) || (current && entry.previous && !current.equals(entry.previous))) throw Error('A configuration changed during saving. Try again after the other editor finishes.')
      renameSync(entry.temporary, entry.path); committed.push(entry)
    }
  } catch (error) {
    const failures: string[] = []
    for (const entry of committed.reverse()) {
      try {
        noLinkedPath(entry.path)
        const current = configBytes(entry.path)
        if (!current || !current.equals(entry.written)) throw Error('A newer file cannot be rolled back.')
        if (entry.previous === null) unlinkSync(entry.path)
        else { const temporary = entry.path + '.' + randomUUID() + '.rollback'; writeFileSync(temporary, entry.previous, { flag: 'wx', mode: 0o600 }); renameSync(temporary, entry.path) }
      } catch { failures.push(entry.path) }
    }
    if (failures.length) throw Error(`Configuration save failed; rollback needs attention for ${failures.join(', ')}. Existing backups were not removed; newer files were not overwritten by rollback.`)
    throw error
  } finally { for (const entry of staged) { try { unlinkSync(entry.temporary) } catch { /* renamed or already absent */ } } }
}
