/**
 * projects.ts — projects, as the design's 04 screen means them.
 *
 * A project is a named home for related work: the chats that belong to it,
 * the instruction that shapes answers for it, and the folder on disk it
 * works in. Nothing here is decorative: the instruction is real text the
 * owner wrote, the folder is a real path the engine can be pointed at, and
 * a chat's `projectId` is the one link between the two sides. All storage
 * goes through the app's doors — the window never writes a file itself.
 */

export type Project = {
  id: string
  name: string
  /** The instruction the owner wrote for this project's work. */
  instruction: string
  /** Where the engine works for this project. Empty = the vault. */
  folder: string
  createdAt: string
  /** What this project is trying to achieve, in the owner's words. Optional. */
  goals: string[]
  /** Reference files/knowledge the owner attached to this project. */
  references: ProjectReference[]
}

/**
 * One reference the owner attached to a project. The original file stays
 * exactly where it is — the project keeps the path and the owner's choice
 * about context, never a copy and never an upload. Whether its text may
 * travel into a chat is decided per reference (`includeInContext`), and
 * what actually travels is described by the project-context resolver
 * (projectContext.ts), never assumed here.
 */
export type ProjectReference = {
  id: string
  /** Absolute path of the original file on this machine. */
  path: string
  /** Display name; defaults to the file's own name. */
  label: string
  addedAt: string
  /** The owner's explicit choice: may extracted text join a chat's context? */
  includeInContext: boolean
}

export const MAX_PROJECTS = 100
export const MAX_PROJECT_GOALS = 12
export const MAX_PROJECT_REFERENCES = 40

const cleanId = (value: unknown): string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{6,64}$/.test(value) ? value : ''

const cleanText = (value: unknown, limit: number): string =>
  typeof value === 'string' ? value.replace(/\s+$/g, '').slice(0, limit) : ''

const cleanFolder = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  // A folder is a path, not a sentence: refuse anything that looks like a
  // flag, a URL, or a newline smuggler.
  if (/[\n\r]|\bhttps?:\/\//.test(trimmed)) return ''
  return trimmed.slice(0, 4096)
}

const cleanGoals = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value.slice(0, MAX_PROJECT_GOALS)) {
    const goal = cleanText(entry, 240).trim()
    if (goal) out.push(goal)
  }
  return out
}

const cleanReference = (value: unknown): ProjectReference | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = cleanId(record.id)
  const path = cleanFolder(record.path)
  if (!id || !path) return null
  const fallback = path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
  return {
    id,
    path,
    label: cleanText(record.label, 120).trim() || fallback,
    addedAt:
      typeof record.addedAt === 'string' && !Number.isNaN(new Date(record.addedAt).getTime())
        ? record.addedAt
        : new Date().toISOString(),
    // Absent or damaged means NOT included: a reference joins context only
    // by the owner's explicit yes, never by a default.
    includeInContext: record.includeInContext === true,
  }
}

const cleanReferences = (value: unknown): ProjectReference[] => {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: ProjectReference[] = []
  for (const entry of value.slice(0, MAX_PROJECT_REFERENCES)) {
    const reference = cleanReference(entry)
    if (reference && !seen.has(reference.id)) {
      seen.add(reference.id)
      out.push(reference)
    }
  }
  return out
}

/** A project as stored, rebuilt strictly. Damaged entries are dropped. */
export function normalizeProject(value: unknown): Project | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = cleanId(record.id)
  const name = cleanText(record.name, 80).trim()
  if (!id || !name) return null
  return {
    id,
    name,
    instruction: cleanText(record.instruction, 4000),
    folder: cleanFolder(record.folder),
    createdAt:
      typeof record.createdAt === 'string' && !Number.isNaN(new Date(record.createdAt).getTime())
        ? record.createdAt
        : new Date().toISOString(),
    // Older stored projects have neither field; they gain empty lists,
    // which is the truth — nothing was attached, nothing is invented.
    goals: cleanGoals(record.goals),
    references: cleanReferences(record.references),
  }
}

export function normalizeProjects(value: unknown): Project[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: Project[] = []
  for (const entry of value.slice(0, MAX_PROJECTS)) {
    const project = normalizeProject(entry)
    if (project && !seen.has(project.id)) {
      seen.add(project.id)
      out.push(project)
    }
  }
  return out
}

/** A brand-new project, ready to store. */
export function newProject(name: string): Project {
  const id =
    globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 24) ??
    `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  return { id, name: name.trim().slice(0, 80) || 'New project', instruction: '', folder: '', createdAt: new Date().toISOString(), goals: [], references: [] }
}

/** A fresh reference id, same shape as a project id. */
export function newReferenceId(): string {
  return (
    globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 24) ??
    `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  )
}

/** The chats that belong to a project, newest activity first. */
export function chatsOf<T extends { projectId?: string | null; updatedAt?: number }>(chats: T[], projectId: string): T[] {
  return chats
    .filter((chat) => chat.projectId === projectId)
    .sort((first, second) => (second.updatedAt ?? 0) - (first.updatedAt ?? 0))
}
