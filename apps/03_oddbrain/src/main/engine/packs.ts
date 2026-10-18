/**
 * packs.ts (main) — installing and removing a mod pack, in one testable piece.
 *
 * The door in index.ts takes a folder the person picked; this module does the
 * work: the manifest is validated by the shared rules, every contributed file
 * is read from inside the pack folder (path-checked, size-capped), the whole
 * pack is copied to <userData>/extensions/<id>/ as the readable record, skills
 * deploy to every engine's own folder, and prompts/themes come back to the
 * renderer, which owns the slash menu and the appearance.
 *
 * An install record (.installed.json) lists every engine file an install
 * wrote, so removing a pack can undo exactly that and nothing else.
 */
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { normalizePack, type Pack } from '../../shared/lib/packs'
import { deploySkill, parseSkillMd, type VaultSkill } from './deploy'

const MAX_FILE_BYTES = 200_000

export type PackPrompt = { name: string; body: string }
export type PackTheme = {
  name: string
  appearance: Record<string, string>
  /**
   * The pack's own stylesheet, applied verbatim on top of the app's tokens —
   * the owner's ruling: a pack theme must carry the pack's ENTIRE style, not
   * a hand-picked subset of tokens the app already offered. Anything a
   * stylesheet can say, a pack theme can say.
   */
  css?: string
}

/** A pack stylesheet is real content; this is its ceiling, the same cap idea the vault uses. */
export const PACK_CSS_MAX = 200_000

export type InstallAnswer =
  | { ok: true; pack: Pack; folder: string; prompts: PackPrompt[]; themes: PackTheme[]; written: string[] }
  | { ok: false; answer: string }

const readCapped = (path: string): { text?: string; problem?: string } => {
  const size = statSync(path).size
  if (size > MAX_FILE_BYTES) return { problem: `${basename(path)} is too large for a pack file (over ${Math.floor(MAX_FILE_BYTES / 1000)} kB).` }
  return { text: readFileSync(path, 'utf8') }
}

/** Inside the pack folder, and only there — the check every read goes through. */
const inside = (root: string, relative: string): string => {
  const target = resolve(root, relative)
  const rootPath = resolve(root)
  if (target !== rootPath && !target.startsWith(rootPath + sep)) return ''
  return target
}

const THEME_KEYS = new Set(['accent', 'width', 'textSize', 'font', 'motion'])
const THEME_VALUES: Record<string, Set<string>> = {
  accent: new Set(['violet', 'blue', 'teal', 'amber', 'rose']),
  width: new Set(['focused', 'comfortable', 'wide']),
  textSize: new Set(['small', 'medium', 'large']),
  font: new Set(['sans', 'serif', 'anthropic-serif']),
  motion: new Set(['system', 'reduced']),
}

/** The look rules one validator, shared by pack themes and pack exports. */
export function cleanThemeAppearance(appearance: Record<string, unknown>): { clean?: Record<string, string>; problem?: string } {
  const clean: Record<string, string> = {}
  for (const [key, value] of Object.entries(appearance)) {
    if (!THEME_KEYS.has(key)) return { problem: `The theme sets "${key}", which is not a look this app knows.` }
    const allowed = THEME_VALUES[key]
    if (typeof value !== 'string' || !allowed?.has(value)) {
      return { problem: `The theme sets ${key} to something the app does not offer.` }
    }
    clean[key] = value
  }
  if (!Object.keys(clean).length) return { problem: 'The theme sets no look at all.' }
  return { clean }
}

const readTheme = (path: string): { theme?: PackTheme; problem?: string } => {
  const file = readCapped(path)
  if (file.problem) return { problem: file.problem }
  let parsed: unknown
  try {
    parsed = JSON.parse(file.text ?? '')
  } catch {
    return { problem: `${basename(path)} is not valid JSON.` }
  }
  const record = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>
  const appearance = (record['appearance'] && typeof record['appearance'] === 'object' ? record['appearance'] : {}) as Record<string, unknown>
  // The stylesheet rides beside the token block, optional but first-class.
  const css = typeof record['css'] === 'string' ? record['css'].slice(0, PACK_CSS_MAX) : ''
  const theme = cleanThemeAppearance(appearance)
  // A css-only theme is a valid theme now; tokens alone remain valid too.
  if (!css && (theme.problem || !theme.clean)) {
    return { problem: theme.problem?.replace('The theme', basename(path)) ?? `${basename(path)} sets no look at all.` }
  }
  if (css && theme.clean && Object.keys(theme.clean).length === 0) {
    // cleanThemeAppearance refuses an empty token block; with a stylesheet
    // present that refusal does not apply — the style IS the look.
  }
  const name = typeof record['name'] === 'string' ? record['name'].slice(0, 60) : basename(path, '.json')
  return { theme: { name, appearance: theme.clean ?? {}, ...(css ? { css } : {}) } }
}

export type PackTargets = {
  /** Where installed packs are kept as readable folders. */
  storeRoot: string
  /** The engine skill folders, as every other install path uses them. */
  claudeSkillsDir: string
  agySkillsDir: string
}

export function installPackFromFolder(folder: string, targets: PackTargets, via?: 'index' | 'starter'): InstallAnswer {
  const manifestPath = join(folder, 'manifest.json')
  if (!existsSync(manifestPath)) return { ok: false, answer: 'That folder has no manifest.json, a pack is a folder with one.' }
  const manifestFile = readCapped(manifestPath)
  if (manifestFile.problem) return { ok: false, answer: manifestFile.problem }
  let parsed: unknown
  try {
    parsed = JSON.parse(manifestFile.text ?? '')
  } catch {
    return { ok: false, answer: 'manifest.json is not valid JSON.' }
  }
  const { pack, problem } = normalizePack(parsed)
  if (problem) return { ok: false, answer: problem }

  // Read every contribution now, before anything is written.
  const skills: VaultSkill[] = []
  const prompts: PackPrompt[] = []
  const themes: PackTheme[] = []
  for (const relative of pack.contributes.skills) {
    const path = inside(folder, relative)
    if (!path || !existsSync(path)) return { ok: false, answer: `The pack's ${relative} is missing.` }
    const file = readCapped(path)
    if (file.problem) return { ok: false, answer: file.problem }
    const parsedSkill = parseSkillMd(file.text ?? '')
    if (!parsedSkill.name || !parsedSkill.body) return { ok: false, answer: `${relative} is not shaped like a skill.` }
    skills.push({ name: parsedSkill.name, description: parsedSkill.description, body: parsedSkill.body })
  }
  for (const relative of pack.contributes.prompts) {
    const path = inside(folder, relative)
    if (!path || !existsSync(path)) return { ok: false, answer: `The pack's ${relative} is missing.` }
    const file = readCapped(path)
    if (file.problem) return { ok: false, answer: file.problem }
    const body = (file.text ?? '').trim()
    if (!body) return { ok: false, answer: `${relative} is empty.` }
    const firstHeading = /^#\s+(.+)$/m.exec(body)
    prompts.push({ name: (firstHeading?.[1] ?? basename(relative, '.md')).slice(0, 40), body: body.slice(0, 4000) })
  }
  for (const relative of pack.contributes.themes) {
    const path = inside(folder, relative)
    if (!path || !existsSync(path)) return { ok: false, answer: `The pack's ${relative} is missing.` }
    const theme = readTheme(path)
    if (theme.problem || !theme.theme) return { ok: false, answer: theme.problem ?? `${relative} is not a theme.` }
    themes.push(theme.theme)
  }

  // The readable record, where the app said it would be.
  const destination = join(targets.storeRoot, pack.id)
  if (existsSync(destination)) return { ok: false, answer: `A pack with the id ${pack.id} is already installed. Remove it first.` }
  try {
    cpSync(folder, destination, { recursive: true })
  } catch {
    return { ok: false, answer: 'The pack folder could not be copied. Nothing was changed.' }
  }

  // Skills deploy to the engines; the record remembers exactly what was written.
  let written: string[] = []
  try {
    written = skills.map(skill => deploySkill(skill, { claudeSkillsDir: targets.claudeSkillsDir, agySkillsDir: targets.agySkillsDir })).flat()
  } catch {
    rmSync(destination, { recursive: true, force: true })
    return { ok: false, answer: 'Deploying the skills failed. The pack was not kept.' }
  }
  try {
    // How this arrived: an index means a checksum was verified against a
    // store's pin; 'starter' means the app shipped it. Absent = installed
    // straight from a folder the person picked — the badge says so.
    writeFileSync(join(destination, '.installed.json'), JSON.stringify({ written, installedAt: new Date().toISOString(), ...(via ? { via } : {}) }, null, 2), 'utf8')
  } catch {
    // The record is a convenience; the install itself stands.
  }
  return { ok: true, pack, folder: destination, prompts, themes, written }
}

/** What the Extensions list shows: every installed pack, as its manifest says it is. */
export function listPacks(storeRoot: string): Array<{ pack: Pack; folder: string; installedAt: string; via?: string }> {
  if (!existsSync(storeRoot)) return []
  const out: Array<{ pack: Pack; folder: string; installedAt: string; via?: string }> = []
  for (const entry of readdirSync(storeRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const folder = join(storeRoot, entry.name)
    const manifest = join(folder, 'manifest.json')
    if (!existsSync(manifest)) continue
    try {
      const { pack } = normalizePack(JSON.parse(readFileSync(manifest, 'utf8')))
      let installedAt = ''
      let via: string | undefined
      const record = join(folder, '.installed.json')
      if (existsSync(record)) {
        try {
          const parsed = JSON.parse(readFileSync(record, 'utf8')) as { installedAt?: string; via?: string }
          installedAt = String(parsed['installedAt'] ?? '')
          via = typeof parsed['via'] === 'string' ? parsed['via'] : undefined
        } catch {}
      }
      if (pack.id) out.push({ pack, folder, installedAt, via })
    } catch {
      // A damaged pack shows as nothing rather than breaking the list; the
      // folder remains for the person to delete by hand if they wish.
    }
  }
  return out.sort((a, b) => a.pack.name.localeCompare(b.pack.name))
}

/** Removing is undoing: the engine files the install record names, then the folder.
 *  Only files inside the two engine skill folders may be undone — the record
 *  cannot point anywhere else, and if it tries, those entries are skipped. */
export function removePack(
  id: string,
  storeRoot: string,
  targets: { claudeSkillsDir: string; agySkillsDir: string },
): { ok: boolean; answer: string } {
  const clean = String(id || '').replace(/[^a-z0-9._-]/g, '')
  if (!clean) return { ok: false, answer: 'That is not a pack id.' }
  const folder = join(storeRoot, clean)
  const resolved = resolve(folder)
  if (!resolved.startsWith(resolve(storeRoot) + sep)) return { ok: false, answer: 'That is not a pack id.' }
  if (!existsSync(resolved)) return { ok: false, answer: 'That pack is not installed.' }
  const undoable = [resolve(targets.claudeSkillsDir) + sep, resolve(targets.agySkillsDir) + sep]
  try {
    const record = join(resolved, '.installed.json')
    if (existsSync(record)) {
      const parsed = JSON.parse(readFileSync(record, 'utf8')) as { written?: string[] }
      for (const path of Array.isArray(parsed.written) ? parsed.written : []) {
        if (typeof path !== 'string') continue
        const target = resolve(path)
        const root = undoable.find(r => target.startsWith(r))
        if (!root) continue
        try {
          rmSync(target)
          // Prune the folders the deploy made, so no empty shell remains.
          let parent = dirname(target)
          while (parent.startsWith(root) && parent !== root) {
            if (existsSync(parent) && readdirSync(parent).length === 0) {
              rmdirSync(parent)
              parent = dirname(parent)
            } else break
          }
        } catch {}
      }
    }
    rmSync(resolved, { recursive: true, force: true })
    return { ok: true, answer: `${clean} removed.` }
  } catch {
    return { ok: false, answer: 'The pack folder would not delete. It is safe to remove by hand, see its path in the list.' }
  }
}
