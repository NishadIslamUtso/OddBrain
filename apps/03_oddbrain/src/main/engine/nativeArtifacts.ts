import { readdirSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { configBytes, noLinkedPath } from './configTransaction'
import { save } from '../artifacts/store'
import type { NativeArtifactLink } from '../../shared/lib/nativeArtifacts'
type Snapshot = { ok: boolean; files: Map<string, { digest: string; content?: string; type: 'html' | 'svg' }>; notice: string }
const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex')
/** Read only the explicit artifacts output folder. No links, recursive workspace
 * sweep, external resources, code execution or claim about which actor wrote it. */
export function snapshotNativeArtifacts(workspace: string, contents = false): Snapshot {
  const root = join(workspace, 'artifacts'), files: Snapshot['files'] = new Map()
  let entries = 0, bytes = 0
  const walk = (folder: string, depth: number) => {
    if (depth > 3) throw Error('Artifact output exceeds the supported directory depth.')
    noLinkedPath(folder)
    let list
    try { list = readdirSync(folder, { withFileTypes: true }) }
    catch (error) { if (folder === root && (error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
    for (const entry of list) {
      if (++entries > 200) throw Error('Artifact output exceeds 200 directory entries.')
      if (/[\x00-\x1f]/.test(entry.name)) throw Error('Artifact names with control characters require manual inspection.')
      const file = join(folder, entry.name)
      if (entry.isSymbolicLink()) throw Error('Artifact output contains a link; automatic import was refused.')
      if (entry.isDirectory()) { walk(file, depth + 1); continue }
      const ext = extname(entry.name).toLowerCase()
      if (!['.html', '.htm', '.svg'].includes(ext)) continue
      const data = configBytes(file)
      if (!data) throw Error('An artifact disappeared while reading.')
      bytes += data.length; if (bytes > 16_000_000) throw Error('Artifact output exceeds the 16 MB automatic inspection limit.')
      const text = new TextDecoder('utf-8', { fatal: true }).decode(data)
      if (!(ext === '.svg' ? /<\s*svg\b/i : /<\s*(!doctype\s+html|html|body|div|section|main|table|canvas)\b/i).test(text)) throw Error('An output file is not a recognizable standalone page or drawing.')
      files.set(relative(root, file), { digest: hash(data), type: ext === '.svg' ? 'svg' : 'html', ...(contents ? { content: text } : {}) })
    }
  }
  try { walk(root, 0); return { ok: true, files, notice: '' } }
  catch (error) { return { ok: false, files: new Map(), notice: `Automatic artifact inspection refused: ${(error as Error).message} Original files remain in the working folder.` } }
}
export function collectNativeArtifacts(library: string, workspace: string, before: Snapshot, chatId?: string): { links: NativeArtifactLink[]; notices: string[] } {
  if (!before.ok) return { links: [], notices: [before.notice] }
  const after = snapshotNativeArtifacts(workspace, true), links: NativeArtifactLink[] = [], notices: string[] = []
  if (!after.ok) return { links, notices: [after.notice] }
  for (const [source, file] of after.files) {
    if (before.files.get(source)?.digest === file.digest) continue
    const id = 'native-' + hash(JSON.stringify([chatId || null, workspace, source])).slice(0, 48)
    const result = save(library, { id, title: basename(source, extname(source)), type: file.type, content: file.content!, chatId, origin: 'chat', note: `Observed changed after a native turn: artifacts/${source}. This is file evidence, not proof of engine authorship or successful validation.` })
    if (!result.ok) { notices.push(`${source}: could not be added to the artifact library. ${result.error} Original remains in the working folder.`); continue }
    links.push({ id, title: result.item.title, version: result.item.current + 1, type: file.type, source: `artifacts/${source}`, digest: file.digest })
  }
  return { links, notices }
}
