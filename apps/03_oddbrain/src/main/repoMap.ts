/**
 * The walk behind the map: bounded, ignore-aware, honest. The folder read
 * here is the one the engine already works in (the workspace, else the
 * vault) — the door takes no path from the window, because the map's job is
 * to describe THAT folder, not any folder on the machine.
 */
import { readdir, stat } from 'node:fs/promises'
import { join, basename } from 'node:path'
import {
  buildRepoMapText,
  REPO_MAP_IGNORES,
  REPO_MAP_MAX_DEPTH,
  type RepoEntry,
} from '../shared/lib/repoMap'

export type RepoMapAnswer =
  | { ok: true; map: string; files: number; dirs: number; truncated: boolean; root: string }
  | { ok: false; answer: string }

export async function buildRepoMap(root: string): Promise<RepoMapAnswer> {
  const entries: RepoEntry[] = []
  const walk = async (dir: string, rel: string, depth: number): Promise<void> => {
    if (depth > REPO_MAP_MAX_DEPTH) return
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      return
    }
    for (const name of names.sort()) {
      if (REPO_MAP_IGNORES.has(name)) continue
      const relPath = rel ? `${rel}/${name}` : name
      let isDir = false
      let bytes: number | null = null
      try {
        const info = await stat(join(dir, name))
        isDir = info.isDirectory()
        if (!isDir) bytes = info.size
      } catch {
        continue
      }
      if (!isDir && bytes === 0) continue // an empty file says nothing on a map
      entries.push({ path: relPath, dir: isDir, bytes })
      if (isDir) await walk(join(dir, name), relPath, depth + 1)
    }
  }
  try {
    await readdir(root)
  } catch (failure) {
    const code = (failure as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { ok: false, answer: 'That folder does not exist, so there is nothing to map.' }
    return { ok: false, answer: `Could not read the folder: ${(failure as Error).message}` }
  }
  await walk(root, '', 1)
  if (!entries.length) return { ok: false, answer: 'The folder has nothing in it to map.' }
  const built = buildRepoMapText(basename(root) || root, entries)
  return { ok: true, root, ...built }
}
