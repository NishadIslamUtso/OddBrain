/** Markdown export, not a full backup of attachments or the review database.
 * A destination is reserved exclusively. Any failure removes only this call's
 * new partial directory; existing folders are never reused or overwritten. */
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, rmSync, writeSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { createVaultFiles } from './files'
export type ExportCopyResult = { ok: true; destination: string; count: number } | { ok: false; answer: string }
export function exportVaultCopy(root: string, destination: string, files: ReturnType<typeof createVaultFiles> = createVaultFiles(root, () => new Date())): ExportCopyResult {
  let owned = false
  const targetRoot = resolve(destination)
  try {
    const realRoot = realpathSync(root)
    // Resolve the existing parent before touching the destination, rejecting links.
    let parent = dirname(targetRoot)
    for (;;) { if (lstatSync(parent).isSymbolicLink()) throw Error('Export destination cannot pass through a symlink.'); if (dirname(parent) === parent) break; parent = dirname(parent) }
    const canonical = join(realpathSync(dirname(targetRoot)), targetRoot.slice(dirname(targetRoot).length + 1))
    if (canonical === realRoot || canonical.startsWith(realRoot + sep)) throw Error('Choose an export destination outside the vault.')
    const walk = files.walkFiles('', '.md', 2000)
    if (walk.capped || walk.incomplete) throw Error('The vault could not be read completely within the export safety limit. No complete copy was made.')
    if (!walk.files.length) return { ok: false, answer: 'The vault has no markdown to copy.' }
    mkdirSync(targetRoot) // EEXIST is intentional, even for an empty destination.
    owned = true
    for (const relative of walk.files) {
      const source = files.filePath(relative), target = resolve(targetRoot, relative)
      if (!target.startsWith(targetRoot + sep)) throw Error('Invalid export path.')
      const input = openSync(source, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
      try {
        const before = fstatSync(input)
        if (!before.isFile()) throw Error('Export source is no longer a regular file.')
        mkdirSync(dirname(target), { recursive: true })
        const output = openSync(target, 'wx')
        try {
          const buffer = Buffer.alloc(64 * 1024); let total = 0
          for (;;) {
            const count = readSync(input, buffer, 0, buffer.length, null)
            if (!count) break
            total += count
            if (total > before.size) throw Error('A source changed while exporting; try again when captures are idle.')
            for (let offset = 0; offset < count;) offset += writeSync(output, buffer, offset, count - offset)
          }
          const after = fstatSync(input)
          if (total !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw Error('A source changed while exporting; try again when captures are idle.')
        } finally { closeSync(output) }
      } finally { closeSync(input) }
    }
    return { ok: true, destination: targetRoot, count: walk.files.length }
  } catch (error) {
    if (owned) { try { rmSync(targetRoot, { recursive: true, force: true }) } catch { return { ok: false, answer: 'Export failed and its incomplete destination could not be removed. Do not treat it as a complete copy.' } } }
    return { ok: false, answer: (error as Error).message }
  }
}
