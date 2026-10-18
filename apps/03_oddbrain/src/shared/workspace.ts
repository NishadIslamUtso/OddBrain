/* The UI-first workspace. Records here are local data, never model output. */
export type Message = { id: string; role: 'note'; text: string; at: string }
export type Chat = {
  id: string
  title: string
  projectId: string | null
  createdAt: string
  updatedAt: string
  messages: Message[]
}
export type Project = { id: string; name: string; createdAt: string }
export type ArtifactKind = 'html' | 'svg' | 'text'
export type ArtifactVersion = { content: string; at: string }
export type Artifact = {
  id: string
  title: string
  kind: ArtifactKind
  createdAt: string
  updatedAt: string
  versions: ArtifactVersion[]
}
export type Appearance = {
  theme: 'light' | 'dark' | 'system'
  accent: 'violet' | 'amber' | 'teal'
  motion: 'balanced' | 'still'
  width: 'focused' | 'comfortable' | 'wide'
}
export type Workspace = {
  version: 1
  chats: Chat[]
  projects: Project[]
  artifacts: Artifact[]
  trash: Artifact[]
  appearance: Appearance
}
export type WorkspaceReply =
  { ok: true; data: Workspace; revision: number; location: string } | { ok: false; error: string }

export const MAX_ARTIFACT_BYTES = 256 * 1024
export const MAX_WORKSPACE_BYTES = 4 * 1024 * 1024
export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'light',
  accent: 'violet',
  motion: 'balanced',
  width: 'comfortable',
}
export const emptyWorkspace = (): Workspace => ({
  version: 1,
  chats: [],
  projects: [],
  artifacts: [],
  trash: [],
  appearance: { ...DEFAULT_APPEARANCE },
})
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max
const iso = (value: unknown): value is string =>
  text(value, 35) &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value) &&
  !Number.isNaN(Date.parse(value))
const id = (value: unknown): value is string => text(value, 90) && /^[a-zA-Z0-9_-]+$/.test(value)
const oneOf = <T extends string>(value: unknown, items: readonly T[]): value is T =>
  items.includes(value as T)

/** Reject a damaged or unknown schema rather than replacing the owner's data. */
export function validateWorkspace(value: unknown): Workspace {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    !Array.isArray(value.chats) ||
    !Array.isArray(value.projects) ||
    !Array.isArray(value.artifacts) ||
    !Array.isArray(value.trash) ||
    !isObject(value.appearance)
  ) {
    throw new Error('This workspace cannot be read safely. Nothing was overwritten.')
  }
  const { chats, projects, artifacts, trash, appearance } = value
  if (chats.length > 1500 || projects.length > 500 || artifacts.length > 500 || trash.length > 500)
    throw new Error('The workspace exceeds its record limit.')
  if (
    !oneOf(appearance.theme, ['light', 'dark', 'system']) ||
    !oneOf(appearance.accent, ['violet', 'amber', 'teal']) ||
    !oneOf(appearance.motion, ['balanced', 'still']) ||
    !oneOf(appearance.width, ['focused', 'comfortable', 'wide'])
  )
    throw new Error('The workspace appearance is invalid.')
  const parsedChats: Chat[] = chats.map((entry: unknown) => {
    if (
      !isObject(entry) ||
      !id(entry.id) ||
      !text(entry.title, 120) ||
      !iso(entry.createdAt) ||
      !iso(entry.updatedAt) ||
      !(entry.projectId === null || id(entry.projectId)) ||
      !Array.isArray(entry.messages) ||
      entry.messages.length > 1000
    )
      throw new Error('A saved chat is damaged.')
    const messages: Message[] = entry.messages.map((message: unknown) => {
      if (
        !isObject(message) ||
        !id(message.id) ||
        message.role !== 'note' ||
        !text(message.text, 20000) ||
        !iso(message.at)
      )
        throw new Error('A saved note is damaged.')
      return { id: message.id, role: 'note', text: message.text, at: message.at }
    })
    return {
      id: entry.id,
      title: entry.title,
      projectId: entry.projectId,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      messages,
    }
  })
  const parsedProjects: Project[] = projects.map((entry: unknown) => {
    if (!isObject(entry) || !id(entry.id) || !text(entry.name, 80) || !iso(entry.createdAt))
      throw new Error('A saved project is damaged.')
    return { id: entry.id, name: entry.name, createdAt: entry.createdAt }
  })
  if (
    parsedChats.some(
      (chat) => chat.projectId && !parsedProjects.some((project) => project.id === chat.projectId),
    )
  )
    throw new Error('A chat refers to a missing project.')
  const parseArtifacts = (entries: unknown[]): Artifact[] =>
    entries.map((entry: unknown) => {
      if (
        !isObject(entry) ||
        !id(entry.id) ||
        !text(entry.title, 120) ||
        !oneOf(entry.kind, ['html', 'svg', 'text']) ||
        !iso(entry.createdAt) ||
        !iso(entry.updatedAt) ||
        !Array.isArray(entry.versions) ||
        entry.versions.length < 1 ||
        entry.versions.length > 25
      )
        throw new Error('A saved artifact is damaged.')
      const versions: ArtifactVersion[] = entry.versions.map((v: unknown) => {
        if (
          !isObject(v) ||
          !text(v.content, MAX_ARTIFACT_BYTES) ||
          new TextEncoder().encode(v.content).length > MAX_ARTIFACT_BYTES ||
          !iso(v.at)
        )
          throw new Error('An artifact version is damaged.')
        return { content: v.content, at: v.at }
      })
      return {
        id: entry.id,
        title: entry.title,
        kind: entry.kind,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        versions,
      }
    })
  const parsed = {
    version: 1 as const,
    chats: parsedChats,
    projects: parsedProjects,
    artifacts: parseArtifacts(artifacts),
    trash: parseArtifacts(trash),
    appearance: {
      theme: appearance.theme,
      accent: appearance.accent,
      motion: appearance.motion,
      width: appearance.width,
    },
  }
  const allIds = (items: Array<{ id: string }>): boolean =>
    new Set(items.map((item) => item.id)).size === items.length
  if (
    !allIds(parsed.chats) ||
    !allIds(parsed.projects) ||
    !allIds([...parsed.artifacts, ...parsed.trash]) ||
    parsed.chats.some((chat) => !allIds(chat.messages))
  )
    throw new Error('The workspace contains duplicate record IDs.')
  if (new TextEncoder().encode(JSON.stringify(parsed)).length > MAX_WORKSPACE_BYTES)
    throw new Error('The workspace exceeds its storage limit.')
  return parsed
}

const title = (raw: string, max: number): string => {
  const value = raw.trim().replace(/\s+/g, ' ').slice(0, max)
  if (!value) throw new Error('Give this item a name.')
  return value
}
export function newChat(
  data: Workspace,
  entryId: string,
  at: string,
  projectId: string | null = null,
): Workspace {
  if (projectId && !data.projects.some((project) => project.id === projectId))
    throw new Error('That project is no longer here.')
  return {
    ...data,
    chats: [
      { id: entryId, title: 'Untitled chat', projectId, createdAt: at, updatedAt: at, messages: [] },
      ...data.chats,
    ],
  }
}
export function renameChat(data: Workspace, entryId: string, name: string, at: string): Workspace {
  return {
    ...data,
    chats: data.chats.map((chat) =>
      chat.id === entryId ? { ...chat, title: title(name, 120), updatedAt: at } : chat,
    ),
  }
}
export function saveNote(
  data: Workspace,
  chatId: string,
  entryId: string,
  content: string,
  at: string,
): Workspace {
  const note = content.trim()
  if (!note || note.length > 20000) throw new Error('A note must contain up to 20,000 characters.')
  if (!data.chats.some((chat) => chat.id === chatId))
    throw new Error('Choose a real chat before saving a note.')
  return {
    ...data,
    chats: data.chats.map((chat) =>
      chat.id === chatId
        ? {
            ...chat,
            title: chat.title === 'Untitled chat' ? note.slice(0, 72) : chat.title,
            updatedAt: at,
            messages: [...chat.messages, { id: entryId, role: 'note', text: note, at }],
          }
        : chat,
    ),
  }
}
export function newProject(data: Workspace, entryId: string, name: string, at: string): Workspace {
  return { ...data, projects: [{ id: entryId, name: title(name, 80), createdAt: at }, ...data.projects] }
}
export function renameProject(data: Workspace, entryId: string, name: string): Workspace {
  if (!data.projects.some((project) => project.id === entryId))
    throw new Error('That project is no longer here.')
  return {
    ...data,
    projects: data.projects.map((project) =>
      project.id === entryId ? { ...project, name: title(name, 80) } : project,
    ),
  }
}
export function kindFromName(name: string): ArtifactKind | null {
  const ext = name.split('.').at(-1)?.toLowerCase()
  return ext === 'html' || ext === 'htm'
    ? 'html'
    : ext === 'svg'
      ? 'svg'
      : ext === 'txt' || ext === 'md'
        ? 'text'
        : null
}
export function importArtifact(
  data: Workspace,
  entryId: string,
  name: string,
  kind: ArtifactKind,
  content: string,
  at: string,
): Workspace {
  if (!content || new TextEncoder().encode(content).length > MAX_ARTIFACT_BYTES)
    throw new Error('Import a nonempty file smaller than 256 KB.')
  return {
    ...data,
    artifacts: [
      {
        id: entryId,
        title: title(name, 120),
        kind,
        createdAt: at,
        updatedAt: at,
        versions: [{ content, at }],
      },
      ...data.artifacts,
    ],
  }
}
export function reviseArtifact(data: Workspace, entryId: string, content: string, at: string): Workspace {
  const current = data.artifacts.find((artifact) => artifact.id === entryId)
  if (!current) throw new Error('That artifact is no longer here.')
  if (!content || new TextEncoder().encode(content).length > MAX_ARTIFACT_BYTES)
    throw new Error('A version must be nonempty and smaller than 256 KB.')
  if (current.versions.at(-1)?.content === content) throw new Error('This version has no changes to save.')
  if (current.versions.length >= 25)
    throw new Error('This artifact reached the 25-version limit. Export a copy before continuing.')
  return {
    ...data,
    artifacts: data.artifacts.map((item) =>
      item.id === entryId
        ? { ...item, updatedAt: at, versions: [...item.versions, { content, at }] }
        : item,
    ),
  }
}
export function removeArtifact(data: Workspace, entryId: string): Workspace {
  const item = data.artifacts.find((artifact) => artifact.id === entryId)
  if (!item) throw new Error('That artifact is no longer here.')
  return {
    ...data,
    artifacts: data.artifacts.filter((artifact) => artifact.id !== entryId),
    trash: [item, ...data.trash],
  }
}
export function restoreArtifact(data: Workspace, entryId: string, newId: string): Workspace {
  const item = data.trash.find((artifact) => artifact.id === entryId)
  if (!item) throw new Error('That item is no longer in Trash.')
  const conflict = data.artifacts.some((artifact) => artifact.id === item.id)
  if (conflict && (newId === item.id || data.artifacts.some((artifact) => artifact.id === newId)))
    throw new Error('Could not restore without overwriting an existing artifact.')
  return {
    ...data,
    artifacts: [{ ...item, id: conflict ? newId : item.id }, ...data.artifacts],
    trash: data.trash.filter((artifact) => artifact.id !== entryId),
  }
}
