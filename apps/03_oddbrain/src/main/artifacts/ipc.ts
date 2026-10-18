import { handle } from '../ipcGuard'
import { BrowserWindow, dialog } from 'electron'
import { readFileSync, statSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { adopt, duplicate, list, read, remove, rename, restore, save, listTrash, restoreTrash, type ItemAnswer } from './store'

/**
 * The library's channels, and the one place an artifact can enter the app from a
 * file on disk.
 *
 * The renderer may list, read, save, rename, duplicate, restore, remove and ask
 * for an import. It may not choose a path: the folder picker runs here, on this
 * side, so the interface never handles a file path it could be tricked into
 * using.
 */

const MAX_IMPORT_BYTES = 4_000_000

export type ImportAnswer =
  | { ok: true; item: unknown; canceled?: boolean }
  | { ok: false; error: string; canceled?: boolean }

function looksLikeArtifact(value: unknown): boolean {
  const text = String(value || '')
  return /<\s*(!doctype\s+html|html|svg|div|section|main|body|p|h1|table|canvas)\b/i.test(text)
}

function registerImport(root: string): void {
  handle('artifacts:import', async (): Promise<ImportAnswer> => {
    const [window] = BrowserWindow.getAllWindows()
    const chosen = await dialog.showOpenDialog(window, {
      title: 'Bring a file into the artifact library',
      buttonLabel: 'Import',
      properties: ['openFile'],
      filters: [
        { name: 'Web pages and drawings', extensions: ['html', 'htm', 'svg'] },
        { name: 'Everything', extensions: ['*'] },
      ],
    })
    if (chosen.canceled || !chosen.filePaths.length) return { ok: false, error: '', canceled: true }

    const path = chosen.filePaths[0]
    const extension = extname(path).toLowerCase()
    const type = extension === '.svg' ? 'svg' : 'html'
    try {
      const size = statSync(path).size
      if (size > MAX_IMPORT_BYTES) {
        return { ok: false, error: `That file is ${Math.round(size / 1_000_000)} MB, past the 4 MB a version may hold.` }
      }
      const content = readFileSync(path, 'utf8')
      if (!looksLikeArtifact(content)) {
        // Importing a file that is not a document would put a card in the grid
        // that cannot preview. One sentence, and nothing is written.
        return { ok: false, error: 'That file is not a web page or a drawing, so there would be nothing to show.' }
      }
      const title = basename(path, extension).replace(/[-_]+/g, ' ').trim() || 'Imported file'
      const answer = save(root, { title, type, content, origin: 'import', note: `Imported from ${basename(path)}` })
      return answer.ok ? { ok: true, item: answer.item } : { ok: false, error: answer.error }
    } catch (error) {
      return { ok: false, error: `That file could not be read: ${(error as Error).message}` }
    }
  })
}

export function registerArtifactIpc(root: string): void {
  handle('artifacts:list', () => list(root))
  handle('artifacts:trash-list', () => listTrash(root))
  handle('artifacts:trash-restore', (_event, key: unknown) => restoreTrash(root, key))
  handle('artifacts:read', (_event, id: unknown, version?: unknown) => read(root, id, version))
  handle('artifacts:save', (_event, input: unknown) => save(root, (input || {}) as never))
  handle('artifacts:rename', (_event, id: unknown, title: unknown) => rename(root, id, title))
  handle('artifacts:duplicate', (_event, id: unknown) => duplicate(root, id))
  handle('artifacts:restore', (_event, id: unknown, version: unknown) => restore(root, id, version))
  handle('artifacts:remove', (_event, id: unknown) => remove(root, id))
  handle('artifacts:adopt', (_event, records: unknown) => adopt(root, records))
  registerImport(root)
}

/** Re-exported so the renderer's types and this side cannot drift apart. */
export type { ItemAnswer }
