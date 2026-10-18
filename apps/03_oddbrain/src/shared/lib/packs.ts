/**
 * packs.ts — mods, Phase 1 (his locked queue, "the mods plugin").
 *
 * A pack is a folder with a manifest.json and nothing hidden. Phase 1 kinds:
 *   skills   → markdown rulebooks, deployed to every engine's own folder
 *   prompts  → markdown templates for the composer's slash menu
 *   themes   → an appearance preset the Settings screen already knows
 * Agents and connectors are refused, in plain words, until those runtimes
 * exist — an extension system with nothing behind it is a worse lie than a
 * missing page.
 *
 * The one security rule of Phase 1: a pack is TEXT and COLOURS. A manifest
 * that asks to run commands, or asks for a permission this app does not
 * recognise, is refused at install — never "installed with warnings".
 */

/**
 * The community store rides WITH the app: a folder index shipped beside the
 * extension's resources (dev: the repo's own store/), real files the index
 * client can checksum straight from disk — no network, no account. A public
 * https mirror of the same index can be added like any other store the day
 * the repo goes public; until then no invented URL is offered.
 */
export const COMMUNITY_INDEX_SHIPPED = true

export type PackContributions = {
  skills: string[]
  prompts: string[]
  themes: string[]
}

export type PackPermissions = {
  /** The only known Phase-1 value is "read:vault" — shown, never hidden. */
  files?: string
  /** Domains a pack says it is about. Phase 1 grants no network access; this is labelling only. */
  web?: string[]
  /** Present only as an explicit `false`: a pack may say it runs no commands. True is refused outright. */
  shell?: false
}

export type Pack = {
  id: string
  name: string
  version: string
  author: string
  description: string
  license: string
  permissions: PackPermissions
  contributes: PackContributions
}

const MAX_FILES_PER_KIND = 20
const MAX_TOTAL_FILES = 40

const cleanText = (value: unknown, limit: number): string =>
  typeof value === 'string' ? value.trim().slice(0, limit) : ''

const cleanId = (value: unknown): string => {
  const id = cleanText(value, 64)
  // Lowercase, dotted or dashed, at least one letter somewhere — so a pack
  // id can never be only punctuation (or a path fragment).
  return /^[a-z0-9][a-z0-9._-]{2,63}$/.test(id) && /[a-z]/.test(id) ? id : ''
}

const cleanVersion = (value: unknown): string => {
  const version = cleanText(value, 20)
  return /^\d+\.\d+\.\d+$/.test(version) ? version : ''
}

const cleanDomain = (value: unknown): string => {
  const domain = cleanText(value, 100).toLowerCase()
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : ''
}

/** A contributed path: relative, inside the pack, the right extension, no tricks. */
const cleanContribution = (value: unknown, extension: '.md' | '.json'): string => {
  if (typeof value !== 'string') return ''
  const path = value.trim()
  if (!path || path.length > 200) return ''
  if (path.includes('..') || path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return ''
  if (!path.toLowerCase().endsWith(extension)) return ''
  return path
}

const cleanContributions = (value: unknown): { contributions: PackContributions; problem: string } => {
  const record = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const take = (kind: 'skills' | 'prompts' | 'themes', extension: '.md' | '.json'): { list: string[]; problem: string } => {
    const raw = record[kind]
    if (raw === undefined) return { list: [], problem: '' }
    if (!Array.isArray(raw)) return { list: [], problem: `${kind} must be a list of file paths.` }
    if (raw.length > MAX_FILES_PER_KIND) return { list: [], problem: `A pack carries at most ${MAX_FILES_PER_KIND} ${kind}.` }
    const list: string[] = []
    for (const entry of raw) {
      const clean = cleanContribution(entry, extension)
      if (!clean) return { list: [], problem: `"${String(entry).slice(0, 60)}" is not a usable ${kind} path.` }
      list.push(clean)
    }
    return { list, problem: '' }
  }
  const skills = take('skills', '.md')
  if (skills.problem) return { contributions: { skills: [], prompts: [], themes: [] }, problem: skills.problem }
  const prompts = take('prompts', '.md')
  if (prompts.problem) return { contributions: { skills: [], prompts: [], themes: [] }, problem: prompts.problem }
  const themes = take('themes', '.json')
  if (themes.problem) return { contributions: { skills: [], prompts: [], themes: [] }, problem: themes.problem }
  const total = skills.list.length + prompts.list.length + themes.list.length
  if (total > MAX_TOTAL_FILES) return { contributions: { skills: [], prompts: [], themes: [] }, problem: 'This pack is too large to read through in one sitting.' }
  if (total === 0) return { contributions: { skills: [], prompts: [], themes: [] }, problem: 'This pack contributes nothing, no skills, prompts or themes.' }
  return { contributions: { skills: skills.list, prompts: prompts.list, themes: themes.list }, problem: '' }
}

const cleanPermissions = (value: unknown): { permissions: PackPermissions; problem: string } => {
  if (value === undefined) return { permissions: {}, problem: '' }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { permissions: {}, problem: 'permissions must be an object.' }
  }
  const record = value as Record<string, unknown>
  const unknown = Object.keys(record).filter(key => key !== 'files' && key !== 'web' && key !== 'shell')
  if (unknown.length) {
    return { permissions: {}, problem: `This pack asks for "${unknown[0]}", which this app does not know. It is refused rather than installed with a warning.` }
  }
  if ('shell' in record) {
    const shell = record['shell']
    if (shell !== false && shell !== undefined) {
      return { permissions: {}, problem: 'This pack asks to run commands. This app does not install packs that run commands.' }
    }
  }
  if ('files' in record && record['files'] !== undefined) {
    if (record['files'] !== 'read:vault') {
      return { permissions: {}, problem: 'The only files permission a pack may ask for is "read:vault".' }
    }
  }
  let web: string[] = []
  if ('web' in record && record['web'] !== undefined) {
    if (!Array.isArray(record['web'])) return { permissions: {}, problem: 'The web permission must be a list of domains.' }
    if (record['web'].length > 20) return { permissions: {}, problem: 'A pack may name at most 20 domains.' }
    web = record['web'].map(cleanDomain).filter(Boolean)
    if (web.length !== record['web'].length) {
      return { permissions: {}, problem: 'One of the named domains is not a domain.' }
    }
  }
  return {
    permissions: {
      ...(record['files'] === 'read:vault' ? { files: 'read:vault' as const } : {}),
      ...(record['shell'] === false ? { shell: false as const } : {}),
      ...(web.length ? { web } : {}),
    },
    problem: '',
  }
}

/** Everything the install screen says before a pack lands, or why it cannot. */
export function normalizePack(value: unknown): { pack: Pack; problem: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { pack: refused(), problem: 'That manifest is not a manifest.' }
  }
  const record = value as Record<string, unknown>
  const id = cleanId(record['id'])
  if (!id) return { pack: refused(), problem: 'The manifest needs an id: lowercase letters, digits, dots or dashes.' }
  const name = cleanText(record['name'], 80)
  if (!name) return { pack: refused(), problem: 'The manifest needs a name.' }
  const version = cleanVersion(record['version'])
  if (!version) return { pack: refused(), problem: 'The manifest needs a version like 1.0.0.' }
  const kindProblem = Object.keys(record)
    .filter(key => !['id', 'name', 'version', 'author', 'description', 'license', 'permissions', 'contributes'].includes(key))
    .slice(0, 1)
  const { contributions, problem: contributesProblem } = cleanContributions(record['contributes'])
  if (contributesProblem) return { pack: refused(), problem: contributesProblem }
  const { permissions, problem: permissionsProblem } = cleanPermissions(record['permissions'])
  if (permissionsProblem) return { pack: refused(), problem: permissionsProblem }
  return {
    pack: {
      id,
      name,
      version,
      author: cleanText(record['author'], 80) || 'unknown author',
      description: cleanText(record['description'], 300),
      license: cleanText(record['license'], 40) || 'unspecified',
      permissions,
      contributes: contributions,
    },
    problem: kindProblem.length ? `The manifest carries a field this app does not know: "${kindProblem[0]}".` : '',
  }
}

function refused(): Pack {
  return { id: '', name: '', version: '', author: '', description: '', license: '', permissions: {}, contributes: { skills: [], prompts: [], themes: [] } }
}

/** The install screen's plain-words list. Nothing a pack may do goes unsaid. */
export function describePermissions(pack: Pack): string[] {
  const said: string[] = []
  said.push('Installs text: skills an engine reads, prompts you can type, or a look for the app. Nothing runs by itself.')
  if (pack.permissions.files === 'read:vault') {
    said.push('Says it works with your vault. When its skill asks the ENGINE to read a file, the engine\'s own permission card asks you first, the same Allow/Deny as always.')
  }
  for (const domain of pack.permissions.web ?? []) {
    said.push(`Names ${domain} as what it is about. Phase 1 packs get no network access from this app; this is a label, shown so you know what you are installing.`)
  }
  if (pack.permissions.shell === false || !('shell' in pack.permissions)) {
    said.push('Runs no commands.')
  }
  said.push('Installs as a folder you can read and delete; the app shows you where.')
  return said
}
