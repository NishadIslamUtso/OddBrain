/**
 * exportPack.ts (main) — Mods Phase 3: publish, without a server.
 *
 * "Export as pack" turns things the machine really has — the engine's own
 * installed skills (read from disk, by name) and the app's current look —
 * into a pack folder plus a ready-made `index.json` entry beside it. The
 * folder can be sent to someone; adding it as an index (Phase 2) installs
 * from it with the checksum check. No account, no upload: sharing is a
 * folder.
 *
 * Every rule is the same one install enforces: a skill named here must
 * really exist in the engine's folder, the manifest must pass the same
 * normalizer, the destination is refused if it already exists, and the
 * digest written into the index is computed from the files that were
 * actually written.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { normalizePack, type Pack } from '../../shared/lib/packs'
import { cleanThemeAppearance, PACK_CSS_MAX } from './packs'
import { packDigest } from './storeIndex'

export type ExportInput = {
  name: string
  description: string
  author: string
  /** Names of skills the engine already has; each is read from disk. */
  skills: string[]
  /** The app's current look, as the renderer holds it; optional. */
  theme?: { appearance: Record<string, string>; css?: string } | Record<string, string> | null
}

export type ExportAnswer =
  | { ok: true; folder: string; index: string; entry: Record<string, unknown> }
  | { ok: false; answer: string }

const cap = (value: unknown, n: number): string => (typeof value === 'string' ? value.trim().slice(0, n) : '')

const idFromName = (name: string): string => {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return base.length >= 3 ? base : ''
}

export type SkillOnDisk = { name: string; description: string; body: string; source: string }

/** The skill file as a pack carries it: frontmatter, then the body. */
export function skillFileText(skill: SkillOnDisk): string {
  const lines = ['---', `name: ${skill.name}`]
  if (skill.description) lines.push(`description: ${skill.description.replace(/\s+/g, ' ').trim()}`)
  lines.push('---', '', skill.body.trim(), '')
  return lines.join('\n')
}

export function exportPack(
  input: ExportInput,
  /** The engine's real skills, as scanClaudeSkills found them. */
  available: SkillOnDisk[],
  /** The folder the export tree lives under; the pack lands at <root>/<id>. */
  root: string,
): ExportAnswer {
  const name = cap(input.name, 80)
  if (!name) return { ok: false, answer: 'Give the pack a name.' }
  const id = idFromName(name)
  if (!/^[a-z0-9][a-z0-9.-]{1,78}[a-z0-9]$/.test(id)) {
    return { ok: false, answer: 'That name does not make a usable folder id (lowercase letters, digits, dots, dashes).' }
  }
  const wanted = [...new Set(Array.isArray(input.skills) ? input.skills.slice(0, 30) : [])]
  const themeInput = input.theme && typeof input.theme === 'object' ? input.theme : null
  const themeAppearance =
    themeInput && 'appearance' in themeInput && typeof themeInput.appearance === 'object'
      ? (themeInput as { appearance: Record<string, string>; css?: string }).appearance
      : (themeInput as Record<string, string> | null)
  const themeCss = themeInput && 'css' in themeInput && typeof themeInput.css === 'string' ? themeInput.css.slice(0, PACK_CSS_MAX) : ''
  if (!wanted.length && !themeAppearance) {
    return { ok: false, answer: 'Pick at least one skill, or include the theme, an empty pack contributes nothing.' }
  }
  const contributions: Pack['contributes'] = { skills: [], prompts: [], themes: [] }
  const files: Record<string, string> = {}
  for (const skillName of wanted) {
    const found = available.find(skill => skill.name === skillName)
    if (!found) return { ok: false, answer: `"${skillName}" is not among the skills this engine really has.` }
    const relative = `skills/${skillName}/SKILL.md`
    files[relative] = skillFileText(found)
    contributions.skills.push(relative)
  }
  if (themeAppearance) {
    const theme = cleanThemeAppearance(themeAppearance)
    if (theme.problem || !theme.clean) return { ok: false, answer: theme.problem || 'The theme names a look the app does not offer.' }
    const themeName = cap(input.name, 60)
    files['themes/pack.json'] = JSON.stringify(
      { name: `${themeName} theme`, appearance: theme.clean, ...(themeCss ? { css: themeCss } : {}) },
      null,
      2,
    )
    contributions.themes.push('themes/pack.json')
  }

  const manifest = {
    id,
    name,
    version: '1.0.0',
    author: cap(input.author, 80) || 'unknown author',
    description: cap(input.description, 300),
    license: 'unspecified',
    permissions: { shell: false },
    contributes: contributions,
  }
  const { pack, problem } = normalizePack(manifest)
  if (problem) return { ok: false, answer: problem }

  const rootPath = resolve(root)
  const folder = join(rootPath, id)
  if (!rootPath || folder === rootPath || !folder.startsWith(rootPath + sep)) {
    return { ok: false, answer: 'The destination would leave the export folder.' }
  }
  if (existsSync(folder)) {
    return { ok: false, answer: `${folder} already exists, rename the pack or remove the old folder first.` }
  }

  // Write the pack: manifest first (so the folder always identifies itself),
  // then every contribution.
  try {
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
    for (const [relative, text] of Object.entries(files)) {
      const full = join(folder, relative)
      mkdirSync(resolve(full, '..'), { recursive: true })
      writeFileSync(full, text, 'utf8')
    }
  } catch {
    rmSync(folder, { recursive: true, force: true })
    return { ok: false, answer: 'The pack folder could not be written. Nothing is reported as exported.' }
  }

  // The digest from the files on disk, not from intent.
  const { digest, problem: digestProblem } = packDigest(folder)
  if (!digest) {
    rmSync(folder, { recursive: true, force: true })
    return { ok: false, answer: digestProblem || 'The exported folder could not be digested.' }
  }
  const entry = {
    id: pack.id,
    name: pack.name,
    version: pack.version,
    author: pack.author,
    description: pack.description,
    permissions: manifest.permissions,
    checksum: digest,
    source: id,
  }

  // The index beside it: this pack's entry replaces its own old one, keeps
  // everyone else's, and is written as whole JSON or not at all.
  const indexFile = join(rootPath, 'index.json')
  let index: { name: string; packs: unknown[] } = { name: 'My packs', packs: [] }
  if (existsSync(indexFile)) {
    try {
      const parsed = JSON.parse(readFileSync(indexFile, 'utf8'))
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.packs)) {
        index = { name: cap(parsed.name, 80) || 'My packs', packs: parsed.packs }
      }
    } catch {
      return {
        ok: false,
        answer: `The pack was written, but ${indexFile} is not a readable index, it was left untouched. Fix or move it, then export again.`,
      }
    }
  }
  index.packs = [...index.packs.filter(item => (item as { id?: string })?.id !== id), entry]
  try {
    writeFileSync(indexFile, JSON.stringify(index, null, 2), 'utf8')
  } catch {
    return { ok: false, answer: `The pack was written to ${folder}, but the index beside it could not be updated.` }
  }
  return { ok: true, folder, index: indexFile, entry }
}
