import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { configBytes, noLinkedPath } from './configTransaction'
import { parse as parseYaml } from 'yaml'
import { createFileReviewService } from './reviewedFileChange'
import type { SkillDraft, SkillInventory, SkillFile } from '../../shared/lib/installedSkills'
import type { EngineId } from '../../shared/lib/engine'
export type SkillRoot = { engine: EngineId; path: string }
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
export function readInstalledSkills(roots: SkillRoot[]): SkillInventory {
  const report: SkillInventory = { entries: [], notices: [] }
  let scanned = 0, totalBytes = 0
  for (const root of roots) {
    try {
      noLinkedPath(root.path)
      if (!existsSync(root.path)) { report.notices.push(`${root.path}: folder not present.`); continue }
      const entries = readdirSync(root.path, { withFileTypes: true })
      scanned += entries.length
      if (entries.length > 500 || scanned > 1000) throw Error('Inventory exceeds 1,000 entries. Nothing was silently clipped; inspect a smaller scope.')
      for (const entry of entries) {
        if (entry.isSymbolicLink()) { report.notices.push(`${entry.name}: linked item not read.`); continue }
        const format = entry.isDirectory() ? 'skill-folder' : 'legacy-flat'
        if (!entry.isDirectory() && !entry.name.endsWith('.md')) continue
        const path = entry.isDirectory() ? join(root.path, entry.name, 'SKILL.md') : join(root.path, entry.name)
        try {
          const bytes = configBytes(path)
          if (!bytes) { report.notices.push(`${entry.name}: no SKILL.md manifest.`); continue }
          totalBytes += bytes.length
          if (totalBytes > 16_000_000) { report.notices.push('Inventory read limit reached. Only the entries already inspected are listed; no files were changed.'); return report }
          const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes), front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
          if (front && front[1].length > 16_000) throw Error('Skill metadata is too large for inspection.')
          const parsed = front ? parseYaml(front[1], { maxAliasCount: 0 }) : null
          if (!parsed || typeof parsed.name !== 'string' || !parsed.name || typeof parsed.description !== 'string' || !parsed.description) { report.notices.push(`${entry.name}: missing or invalid skill metadata; no load claim.`); continue }
          if (parsed.description.length > 4000) { report.notices.push(`${entry.name}: description exceeds the inventory display limit; source file unchanged.`); continue }
          report.entries.push({ id: digest(JSON.stringify([root.engine, resolve(path)])), engine: root.engine, name: parsed.name, description: parsed.description, path, digest: digest(bytes), format,
            states: { installed: 'observed', enabled: 'unknown', loaded: 'unknown', authenticated: 'unknown', used: 'unknown' } })
        } catch { report.notices.push(`${entry.name}: manifest unreadable or linked; original unchanged.`) }
      }
    } catch (error) { report.notices.push((error as Error).message) }
  }
  report.notices.push('Read-only directory inventory. Native include/exclude configuration, plugin-provided skills and server-side skills may add or override entries. Presence is not activation, authentication, successful use or a portability test.')
  return report
}
export function skillDraftText(value: SkillDraft): string {
  if (!value || !['claude-code', 'agy'].includes(value.engine) || !/^[a-z0-9][a-z0-9-]{0,59}$/.test(value.name)) throw Error('Use a skill name with lowercase letters, digits and hyphens, up to 60 characters.')
  if (typeof value.description !== 'string' || !value.description.trim() || value.description.length > 2000 || typeof value.body !== 'string' || !value.body.trim() || typeof value.requirements !== 'string' || value.requirements.length > 4000 || typeof value.replaceExisting !== 'boolean') throw Error('Provide a description, instructions and explicit replacement choice.')
  const text = `---\nname: ${JSON.stringify(value.name)}\ndescription: ${JSON.stringify(value.description)}\n${value.requirements ? `compatibility: ${JSON.stringify(value.requirements)}\n` : ''}---\n${value.body}`
  if (Buffer.byteLength(text) > 24_000) throw Error('Skill exceeds the 24 KB native-format limit. Nothing was shortened.')
  return text
}
/** Per window. Parent directories are created only AFTER explicit approval. */
export function createSkillAuthoring(rootFor: (engine: EngineId) => string, authority: () => string) {
  const service = createFileReviewService(), tickets = new Map<string, { root: string; engine: EngineId; path: string; authority: string; expiresAt: number }>()
  return {
    preview(draft: SkillDraft) {
      for (const [id, ticket] of tickets) if (ticket.expiresAt <= Date.now()) tickets.delete(id)
      const text = skillDraftText(draft), scope = authority(), root = resolve(rootFor(draft.engine)), path = join(root, draft.name, 'SKILL.md')
      noLinkedPath(path)
      if (configBytes(path) && !draft.replaceExisting) throw Error('This skill already exists. Enable replacement to review its exact diff; no files changed.')
      const review = service.prepare(path, Buffer.from(text), 'skill')
      tickets.set(review.token, { root, engine: draft.engine, path, authority: scope, expiresAt: review.expiresAt }); return review
    },
    decide(token: string, decision: 'allow' | 'deny') {
      const ticket = tickets.get(token); tickets.delete(token)
      if (!ticket) return { ok: false, answer: 'Unknown skill review in this window.' }
      if (decision === 'deny') return service.decide(token, decision)
      let created = false
      try {
        if (decision !== 'allow' || authority() !== ticket.authority || resolve(rootFor(ticket.engine)) !== ticket.root) throw Error('Working folder, engine or permission state changed. Review again; nothing was installed.')
        service.reviewedPath(token); noLinkedPath(ticket.path)
        const parent = dirname(ticket.path); created = !existsSync(parent)
        mkdirSync(parent, { recursive: true, mode: 0o700 })
        const result = service.decide(token, decision)
        if (!result.ok && created) { try { rmdirSync(parent) } catch { /* never remove nonempty work */ } }
        return result.ok ? { ...result, answer: 'Reviewed SKILL.md saved. No scripts were run. Loaded, authenticated and used states remain unverified; refresh the inventory and inspect the native engine.' } : result
      } catch (error) { service.decide(token, 'deny'); return { ok: false, answer: (error as Error).message } }
    },
  }
}
export function inspectInstalledSkill(id: string, roots: SkillRoot[]): SkillFile & { content: string } {
  const entry = readInstalledSkills(roots).entries.find(entry => entry.id === id)
  if (!entry) throw Error('This skill is no longer in the current inventory. Refresh first.')
  const bytes = configBytes(entry.path)
  if (!bytes || digest(bytes) !== entry.digest) throw Error('Skill changed during inspection; read it again.')
  return { ...entry, content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
}
