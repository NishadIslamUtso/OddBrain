/**
 * Memmory_OB is intentionally spelled with two m's: this is the stable product
 * and storage identity selected by the owner. It is the catalogue/authority over
 * sources that may remain in their safer native stores; it is not a second copy
 * of every large chat or attachment.
 */
export const MEMMORY_OB_FORMAT = 'oddbrain-memmory-ob'
export const MEMMORY_OB_VERSION = 1 as const

export type MemmoryObjectKind =
  | 'app-chat'
  | 'native-transcript'
  | 'imported-conversation'
  | 'project'
  | 'working-note'
  | 'branch'
  | 'raw-source'
  | 'attachment'
  | 'interpretation'
  | 'memory'
  | 'person'
  | 'journal'
  | 'life-story'
  | 'capsule'
  | 'artifact'
  | 'job'
  | 'receipt'

export type MemmoryAuthority = 'raw' | 'draft' | 'pending' | 'confirmed' | 'rejected' | 'stale'
export type MemmoryLifecycle = 'active' | 'archived' | 'trash'
export type MemmoryScope =
  | { kind: 'global' }
  | { kind: 'project'; projectId: string }
  | { kind: 'chat'; chatId: string }
  | { kind: 'unscoped' }

export type MemmorySourceIdentity = {
  domain: 'app-chat' | 'native-transcript' | 'vault' | 'brain-memory' | 'browser' | 'mobile' | 'import' | 'project' | 'attachment-center' | 'generated'
  externalId: string
  /** A local locator for the owning adapter, never filesystem authority for an AI. */
  locator?: string
  provider?: string
  account?: string
  device?: string
  conversation?: string
  message?: string
  speaker?: string
  role?: string
}

export type MemmoryTrashState = {
  at: string
  by: 'owner' | 'ai'
  reason: string
  previous: Exclude<MemmoryLifecycle, 'trash'>
}

export type MemmoryObject = {
  id: string
  kind: MemmoryObjectKind
  title: string
  scope: MemmoryScope
  authority: MemmoryAuthority
  lifecycle: MemmoryLifecycle
  source: MemmorySourceIdentity
  projectIds: string[]
  relationshipIds: string[]
  attachmentIds: string[]
  createdAt: string
  updatedAt: string
  revision: number
  contentHash: string
  summary: {
    messages?: number
    characters?: number
    references?: number
    chats?: number
  }
  sensitivity: 'ordinary' | 'sensitive' | 'local-only'
  neverSend: boolean
  useCount: number
  lastUsedAt?: string
  trash?: MemmoryTrashState
  /** Small confirmed/pending memory text only. Raw conversations remain in their owning store. */
  text?: string
}

export type MemmoryRelationshipKind =
  | 'belongs-to-project'
  | 'source-of'
  | 'supports'
  | 'contradicts'
  | 'corrects'
  | 'supersedes'
  | 'derived-from'
  | 'branch-of'
  | 'attachment-of'
  | 'related'

export type MemmoryRelationship = {
  id: string
  from: string
  to: string
  kind: MemmoryRelationshipKind
  state: 'active' | 'uncertain' | 'rejected'
  sourceIds: string[]
  createdAt: string
  updatedAt: string
  revision: number
}

export type MemmoryManifest = {
  format: typeof MEMMORY_OB_FORMAT
  version: typeof MEMMORY_OB_VERSION
  revision: number
  createdAt: string
  updatedAt: string
  records: number
  relationships: number
  lastChatStoreRevision: number
}

export type MemmoryProjectView = {
  projectId: string
  revision: number
  sources: number
  chats: number
  messages: number
  confirmed: number
  pending: number
  conflicts: number
  trash: number
  notice: string
}

export type MemmorySearchHit = {
  recordId: string
  kind: MemmoryObjectKind
  /** Authority label shown with the hit. Confirmed memory is owner fact only within stated uncertainty; raw and draft material is evidence, never authority. */
  authority: 'confirmed-owner-memory' | 'raw-unconfirmed-evidence' | 'draft-working-note'
  title: string
  projectId: string | null
  chatId?: string
  messageId?: string
  role?: string
  speaker?: string
  text: string
  start: number
  end: number
  totalCharacters: number
  sha256: string
  coverage: string
  score: number
}

export type MemmoryReadView = {
  manifest: MemmoryManifest
  records: MemmoryObject[]
  relationships: MemmoryRelationship[]
  notice: string
  root: string
}

export type MemmoryAdapterReview = { token: string; expiresAt: number; changes: Array<{ path: string; diff: string }>; explanation: string }

export type MemmoryObBridge = {
  read: (input?: { lifecycle?: MemmoryLifecycle; projectId?: string; limit?: number }) => Promise<{ ok: boolean; view?: MemmoryReadView; error?: string }>
  project: (projectId: string) => Promise<{ ok: boolean; view?: MemmoryProjectView; error?: string }>
  search: (input: { query: string; projectId?: string; currentChatId?: string; limit?: number }) => Promise<{ ok: boolean; hits?: MemmorySearchHit[]; revision?: number; error?: string }>
  goosePreview: () => Promise<{ ok: boolean; review?: MemmoryAdapterReview; canceled?: boolean; answer?: string }>
  gooseDecide: (token: string, decision: 'allow' | 'deny') => Promise<{ ok: boolean; answer: string }>
}

const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 1_024 && !/[\u0000-\u001f]/.test(value)
const iso = (value: unknown): value is string => typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value))
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)

/** Strict validation for independently stored object files. Unknown fields survive JSON round trips but cannot weaken read rules. */
export function normalizeMemmoryObject(value: unknown): MemmoryObject {
  if (!value || typeof value !== 'object') throw Error('A Memmory_OB object is unreadable.')
  const row = value as MemmoryObject
  const kinds: MemmoryObjectKind[] = ['app-chat','native-transcript','imported-conversation','project','working-note','branch','raw-source','attachment','interpretation','memory','person','journal','life-story','capsule','artifact','job','receipt']
  const authorities: MemmoryAuthority[] = ['raw','draft','pending','confirmed','rejected','stale']
  const lifecycles: MemmoryLifecycle[] = ['active','archived','trash']
  if (!id(row.id) || !kinds.includes(row.kind) || !id(row.title) || !authorities.includes(row.authority) || !lifecycles.includes(row.lifecycle)) throw Error('A Memmory_OB object has an invalid identity or state.')
  if (!row.scope || !['global','project','chat','unscoped'].includes(row.scope.kind) || (row.scope.kind === 'project' && !id(row.scope.projectId)) || (row.scope.kind === 'chat' && !id(row.scope.chatId))) throw Error('A Memmory_OB object has an invalid scope.')
  if (!row.source || !id(row.source.domain) || !id(row.source.externalId)) throw Error('A Memmory_OB object has no source identity.')
  if (!Array.isArray(row.projectIds) || row.projectIds.some(value => !id(value)) || !Array.isArray(row.relationshipIds) || row.relationshipIds.some(value => !id(value)) || !Array.isArray(row.attachmentIds) || row.attachmentIds.some(value => !id(value))) throw Error('A Memmory_OB object has invalid links.')
  if (!iso(row.createdAt) || !iso(row.updatedAt) || !Number.isSafeInteger(row.revision) || row.revision < 1 || !hash(row.contentHash)) throw Error('A Memmory_OB object has invalid revision evidence.')
  if (!row.summary || Object.values(row.summary).some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 0))) throw Error('A Memmory_OB object has invalid coverage counts.')
  if (!['ordinary','sensitive','local-only'].includes(row.sensitivity) || typeof row.neverSend !== 'boolean' || !Number.isSafeInteger(row.useCount) || row.useCount < 0 || (row.lastUsedAt !== undefined && !iso(row.lastUsedAt))) throw Error('A Memmory_OB object has invalid access metadata.')
  if (row.lifecycle === 'trash') {
    if (!row.trash || !iso(row.trash.at) || !['owner','ai'].includes(row.trash.by) || !id(row.trash.reason) || !['active','archived'].includes(row.trash.previous)) throw Error('A trashed Memmory_OB object has no recovery state.')
  } else if (row.trash !== undefined) throw Error('An active Memmory_OB object has stale Trash metadata.')
  if (row.text !== undefined && (typeof row.text !== 'string' || row.text.length > 64_000)) throw Error('A Memmory_OB interpretation exceeds its object limit.')
  return structuredClone(row)
}

export function normalizeMemmoryRelationship(value: unknown): MemmoryRelationship {
  if (!value || typeof value !== 'object') throw Error('A Memmory_OB relationship is unreadable.')
  const row = value as MemmoryRelationship
  const kinds: MemmoryRelationshipKind[] = ['belongs-to-project','source-of','supports','contradicts','corrects','supersedes','derived-from','branch-of','attachment-of','related']
  if (!id(row.id) || !id(row.from) || !id(row.to) || row.from === row.to || !kinds.includes(row.kind) || !['active','uncertain','rejected'].includes(row.state) || !Array.isArray(row.sourceIds) || row.sourceIds.some(value => !id(value)) || !iso(row.createdAt) || !iso(row.updatedAt) || !Number.isSafeInteger(row.revision) || row.revision < 1) throw Error('A Memmory_OB relationship has invalid identity, evidence, or state.')
  return structuredClone(row)
}
