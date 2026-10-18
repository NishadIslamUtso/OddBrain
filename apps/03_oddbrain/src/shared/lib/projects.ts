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
}

export const MAX_PROJECTS = 100

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
  return { id, name: name.trim().slice(0, 80) || 'New project', instruction: '', folder: '', createdAt: new Date().toISOString() }
}

/** The chats that belong to a project, newest activity first. */
export function chatsOf<T extends { projectId?: string | null; updatedAt?: number }>(chats: T[], projectId: string): T[] {
  return chats
    .filter((chat) => chat.projectId === projectId)
    .sort((first, second) => (second.updatedAt ?? 0) - (first.updatedAt ?? 0))
}
