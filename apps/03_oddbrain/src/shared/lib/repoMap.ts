/**
 * The repo map: the folder's structure on one page, so a person — or an
 * engine — can see what lives where before reading anything. Aider plants
 * the flag (a ranked map of the repo beats blind exploration); ours is
 * honest about being v1: a bounded tree with sizes, never contents. The
 * engine still reads the files itself — the map is a map, not a substitute.
 * Bounded on purpose: ignores, depth, file count, characters. A folder that
 * says nothing is refused; a folder that says too much is cut and SAYS so.
 */

export type RepoEntry = { path: string; dir: boolean; bytes: number | null }

export const REPO_MAP_IGNORES = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target',
  '.next', '.nuxt', '.venv', 'venv', '__pycache__', 'coverage',
  '.cache', '.idea', '.vs', '.pytest_cache', '.ruff_cache', 'tmp',
])

export const REPO_MAP_MAX_FILES = 400
export const REPO_MAP_MAX_DIRS = 120
export const REPO_MAP_MAX_DEPTH = 6
export const REPO_MAP_MAX_CHARS = 12_000

export function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The last segment of a relative path, and how deep it sits. */
export function splitPath(path: string): { name: string; depth: number } {
  const parts = path.split('/')
  return { name: parts.at(-1) ?? path, depth: parts.length - 1 }
}

export type RepoMapResult = {
  rootName: string
  map: string
  files: number
  dirs: number
  /** True when the caps cut entries out — the map says so in itself. */
  truncated: boolean
}

/**
 * Render the map from a walk's entries. Dirs first, alphabetical, one line
 * each: `name/` for folders, `name · size` for files. The header carries
 * the root's name and honest counts; a cut map says what was cut.
 */
export function buildRepoMapText(rootName: string, entries: RepoEntry[]): RepoMapResult {
  const sorted = [...entries].sort((a, b) => {
    const depth = splitPath(a.path).depth - splitPath(b.path).depth
    if (depth !== 0) return depth
    if (a.dir !== b.dir) return a.dir ? -1 : 1
    return a.path.localeCompare(b.path)
  })
  let files = 0
  let dirs = 0
  const lines: string[] = [`${rootName}/`]
  let truncated = false
  let chars = lines[0].length
  for (const entry of sorted) {
    const { name, depth } = splitPath(entry.path)
    const line = entry.dir
      ? `${'  '.repeat(depth)}${name}/`
      : `${'  '.repeat(depth)}${name} · ${humanBytes(entry.bytes ?? 0)}`
    if (chars + line.length > REPO_MAP_MAX_CHARS) {
      truncated = true
      break
    }
    if (entry.dir) {
      if (dirs >= REPO_MAP_MAX_DIRS) {
        truncated = true
        break
      }
      dirs += 1
    } else {
      if (files >= REPO_MAP_MAX_FILES) {
        truncated = true
        break
      }
      files += 1
    }
    lines.push(line)
    chars += line.length + 1
  }
  const parts = [
    `${rootName}/ — `,
    files === 1 ? '1 file' : `${files} files`,
    dirs === 1 ? ', 1 folder' : dirs ? `, ${dirs} folders` : '',
  ].join('')
  lines[0] = parts
  if (truncated) lines.push('… the rest did not fit — the map is bounded, not complete.')
  return { rootName, map: lines.join('\n'), files, dirs, truncated }
}

/** The context block a map becomes when it rides with a message. */
export function mapContextBlock(map: string): string {
  return [
    '[Map of the folder I chose — structure only; read the files themselves for their contents]',
    map,
  ].join('\n')
}
