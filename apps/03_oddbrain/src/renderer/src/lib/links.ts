import type { VaultFile } from '../../../shared/desktop'
import type { GraphEdge } from './graphScene'

type GraphLinks = { edges: GraphEdge[]; checked: number; dead: number; ambiguous: number }
const strip = (value: string): string => value.replace(/\.md$/i, '').toLowerCase()

/** Resolve [[links]] only when exactly one note matches; never draw guesses. */
export function resolveNoteLinks(files: VaultFile[]): GraphLinks {
  const paths = new Map<string, string>()
  const basenames = new Map<string, string[]>()
  for (const file of files) {
    const key = strip(file.path)
    paths.set(key, file.path)
    const base = key.split('/').at(-1) || key
    basenames.set(base, [...(basenames.get(base) || []), file.path])
  }
  const unique = new Map<string, GraphEdge>()
  let checked = 0,
    dead = 0,
    ambiguous = 0
  for (const file of files) {
    for (const match of file.content.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
      checked += 1
      const target = strip(match[1].trim().replace(/\\/g, '/'))
      if (!target) {
        dead += 1
        continue
      }
      const local = `${file.path.split('/').slice(0, -1).join('/')}/${target}`.replace(/^\//, '')
      const exact = paths.get(local) || paths.get(target)
      const alternatives = basenames.get(target.split('/').at(-1) || target) || []
      const resolved = exact || (alternatives.length === 1 ? alternatives[0] : '')
      if (!resolved) {
        if (alternatives.length > 1) ambiguous += 1
        else dead += 1
        continue
      }
      const key = [file.path, resolved].sort().join('\0')
      if (!unique.has(key) && file.path !== resolved) unique.set(key, { from: file.path, to: resolved })
    }
  }
  return { edges: [...unique.values()], checked, dead, ambiguous }
}
