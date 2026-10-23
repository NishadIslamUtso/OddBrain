import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readlinkSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { executionConfigRisk } from '../../shared/lib/executionConfig'

export type SymlinkObservation = {
  path: string
  target: string
  resolvedTarget: string
  outsideWorkspace: boolean
  executionSensitive: boolean
}
export type SymlinkCensus = {
  links: SymlinkObservation[]
  observedLinks: number
  visitedEntries: number
  skippedDirectories: number
  errors: number
  truncated: boolean
  digest: string
  notice: string
}

const SKIP = new Set(['node_modules', '.cache', '.next', '.nuxt', '.output', '.parcel-cache', '.svelte-kit', '.tox', '.venv', '.vite', 'build', 'coverage', 'dist', 'out', 'target'])
const sensitiveTarget = (path: string) => executionConfigRisk(path) || /(^|[/\\])\.(?:claude|gemini|agents)([/\\]|$)|(^|[/\\])\.mcp\.json$/i.test(path)

/**
 * Point-in-time, bounded visibility for app-owned command review. It never
 * follows links and therefore is not confinement: a command can leave the
 * folder directly or create a new link after launch.
 */
export function censusWorkspaceSymlinks(root: string, limits: { entries?: number; links?: number; depth?: number } = {}): SymlinkCensus {
  const canonicalRoot = resolve(root), maxEntries = limits.entries ?? 10_000, maxLinks = limits.links ?? 100, maxDepth = limits.depth ?? 12
  const links: SymlinkObservation[] = []
  let visitedEntries = 0, observedLinks = 0, skippedDirectories = 0, errors = 0, truncated = false
  const observations: string[] = []
  const inside = (path: string) => {
    const rel = relative(canonicalRoot, path)
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  }
  const walk = (directory: string, depth: number) => {
    if (truncated) return
    let names: string[]
    try { names = readdirSync(directory).sort() } catch { errors++; observations.push(`error:${relative(canonicalRoot, directory)}`); return }
    for (const name of names) {
      if (visitedEntries >= maxEntries) { truncated = true; break }
      const path = resolve(directory, name), shown = relative(canonicalRoot, path) || '.'
      visitedEntries++
      let stat
      try { stat = lstatSync(path) } catch { errors++; observations.push(`error:${shown}`); continue }
      if (stat.isSymbolicLink()) {
        observedLinks++
        let target = ''
        try { target = readlinkSync(path) } catch { errors++; observations.push(`link-error:${shown}`); continue }
        const resolvedTarget = resolve(directory, target), outsideWorkspace = !inside(resolvedTarget), executionSensitive = !!sensitiveTarget(resolvedTarget)
        observations.push(JSON.stringify([shown, target, outsideWorkspace, executionSensitive, stat.dev, stat.ino, stat.mtimeMs, stat.ctimeMs]))
        if (links.length < maxLinks) links.push({ path: shown, target, resolvedTarget, outsideWorkspace, executionSensitive })
        else truncated = true
        continue
      }
      if (!stat.isDirectory()) continue
      const rel = relative(canonicalRoot, path).replaceAll('\\', '/')
      if (SKIP.has(name) || rel === '.git/objects' || rel === '.git/refs' || rel === '.git/logs' || depth >= maxDepth) { skippedDirectories++; continue }
      walk(path, depth + 1)
      if (truncated) break
    }
  }
  walk(canonicalRoot, 0)
  const risky = links.filter(link => link.outsideWorkspace || link.executionSensitive)
  const coverage = `${visitedEntries.toLocaleString()} entries checked without following links; ${skippedDirectories.toLocaleString()} heavy or deep directories skipped`
  const notice = observedLinks
    ? `Symlink review: ${observedLinks.toLocaleString()} link${observedLinks === 1 ? '' : 's'} observed (${risky.length.toLocaleString()} shown as outside the folder or execution-sensitive). ${coverage}.${truncated ? ' The bounded scan is incomplete.' : ''} This is visibility only, not confinement; the command can access other paths or create links after launch.`
    : `Symlink review: no links observed. ${coverage}.${truncated ? ' The bounded scan is incomplete.' : ''} This is visibility only, not proof the command stays in the folder.`
  return { links, observedLinks, visitedEntries, skippedDirectories, errors, truncated, digest: createHash('sha256').update(JSON.stringify([observations, observedLinks, errors, truncated])).digest('hex'), notice }
}

export function symlinkCensusDetails(census: SymlinkCensus): string {
  const shown = census.links.filter(link => link.outsideWorkspace || link.executionSensitive).slice(0, 12)
    .map(link => `${link.path} → ${link.target}${link.outsideWorkspace ? ' [outside folder]' : ''}${link.executionSensitive ? ' [engine/execution configuration]' : ''}`)
  const omitted = census.observedLinks - census.links.length
  return [census.notice, ...shown, ...(omitted > 0 ? [`${omitted.toLocaleString()} additional link(s) were not listed because of the display cap.`] : []), ...(census.errors ? [`${census.errors.toLocaleString()} entries could not be inspected.`] : [])].join('\n')
}
