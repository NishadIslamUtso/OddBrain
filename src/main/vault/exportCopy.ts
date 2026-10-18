/**
 * A portable copy of the vault (Track D).
 *
 * Research note (2026-10-16): the "Obsidian export" tools all do one thing —
 * copy a folder of markdown and keep it a folder of markdown. The vault
 * already IS that: plain .md files in plain folders, no proprietary store.
 * So an export here is exactly what those tools produce — a timestamped
 * snapshot copy the owner can hand to Obsidian, a backup, or another
 * machine. Nothing is converted, because nothing needs converting.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createVaultFiles } from './files'

export type ExportCopyResult = { ok: true; destination: string; count: number } | { ok: false; answer: string }

export function exportVaultCopy(
  root: string,
  destination: string,
  files: ReturnType<typeof createVaultFiles> = createVaultFiles(root, () => new Date()),
): ExportCopyResult {
  const walk = files.walkFiles('', '.md', 2000)
  const list = walk.files
  if (!list.length) return { ok: false, answer: 'The vault has no markdown to copy.' }
  try {
    for (const relative of list) {
      const target = join(destination, relative)
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(join(root, relative), target)
    }
  } catch (error) {
    return { ok: false, answer: error instanceof Error ? error.message : 'The copy failed.' }
  }
  return { ok: true, destination, count: list.length }
}
