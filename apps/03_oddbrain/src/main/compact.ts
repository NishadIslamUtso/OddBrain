/**
 * The brief folder: compaction's receipts. When a conversation is poured
 * into a brief and its session ended, the brief is saved here as one plain
 * markdown file — the record of what carried over, readable, versionable,
 * shareable. Nothing else lives here; anything that is not exactly that is
 * refused with the reason said out loud.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { briefFileContent, compactFileName } from '../shared/lib/compact'

export type CompactSave = { ok: boolean; answer: string; file?: string }

const MAX_BRIEF_CHARS = 20_000

export function createCompactManager(dir: string) {
  const save = async (input: { brief?: string; workspace?: string; at?: string }): Promise<CompactSave> => {
    const brief = typeof input?.brief === 'string' ? input.brief : ''
    if (!brief.trim()) return { ok: false, answer: 'An empty brief carries nothing; nothing was saved.' }
    if (brief.length > MAX_BRIEF_CHARS) return { ok: false, answer: `The brief is ${brief.length} characters; the honest cap is ${MAX_BRIEF_CHARS}.` }
    const workspace = typeof input?.workspace === 'string' ? input.workspace : ''
    const at = typeof input?.at === 'string' && input.at ? input.at : new Date().toISOString()
    try {
      await mkdir(dir, { recursive: true })
      const file = join(dir, compactFileName(Date.now()))
      await writeFile(file, briefFileContent(brief, workspace, at), 'utf8')
      return { ok: true, answer: `Brief saved: ${file}`, file }
    } catch (failure) {
      return { ok: false, answer: `Could not save the brief: ${(failure as Error).message}` }
    }
  }
  return { save }
}

export type CompactManager = ReturnType<typeof createCompactManager>
