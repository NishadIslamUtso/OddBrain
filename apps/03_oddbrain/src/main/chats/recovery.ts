import { createHash, randomUUID } from 'node:crypto'
import { normalizeChats } from '../../shared/lib/storage'
import type { ChatStoreMigration } from '../../shared/lib/chatStore'
import type { Chat } from '../../shared/types'

export const CHAT_RECOVERY_FORMAT = 'oddbrain-chat-recovery-export'
export const CHAT_RECOVERY_VERSION = 1
export const CHAT_RECOVERY_FILE_LIMIT = 768_000_000
const RECOVERY_CHAT_LIMIT = 21_000
const ID_LIMIT = 1_024

export type ChatRecoveryDocument = {
  format: typeof CHAT_RECOVERY_FORMAT
  version: typeof CHAT_RECOVERY_VERSION
  exportedAt: string
  currentChat: string
  chats: Chat[]
  legacy: { rawChats: string | null; rawCurrentChat: string | null }
}

export type ChatRecoveryMerge = {
  chats: Chat[]
  currentChat: string
  imported: number
  identical: number
  conflicts: number
}

const digest = (value: string): string => createHash('sha256').update(value).digest('hex')
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= ID_LIMIT && !/[\u0000-\u001f]/.test(value)

/** A user-requested portable rescue copy. It does not replace or repair the live store. */
export function chatRecoveryDocument(input: ChatStoreMigration): string {
  // Recovery deliberately has a wider envelope than live storage: exceeding a
  // live limit is one reason the owner may need this export in the first place.
  if (!Array.isArray(input?.chats) || input.chats.length > RECOVERY_CHAT_LIMIT) throw Error(`The chat recovery export exceeds its ${RECOVERY_CHAT_LIMIT.toLocaleString()}-chat safety limit. Nothing was exported.`)
  const chats = normalizeChats(input.chats)
  if (typeof input?.currentChat !== 'string') throw Error('The current chat recovery value is invalid. Nothing was exported.')
  if (!(input?.rawChats === null || typeof input?.rawChats === 'string') || !(input?.rawCurrentChat === null || typeof input?.rawCurrentChat === 'string')) {
    throw Error('The original browser recovery values are invalid. Nothing was exported.')
  }
  // A damaged selection must not make otherwise valid chat contents impossible
  // to rescue. Its exact old value is still retained in legacy evidence.
  const currentChat = input.currentChat === '' || validId(input.currentChat) ? input.currentChat : ''
  const document = `${JSON.stringify({
    format: CHAT_RECOVERY_FORMAT,
    version: CHAT_RECOVERY_VERSION,
    exportedAt: new Date().toISOString(),
    currentChat,
    chats,
    legacy: { rawChats: input.rawChats, rawCurrentChat: input.rawCurrentChat },
  }, null, 2)}\n`
  if (Buffer.byteLength(document) > CHAT_RECOVERY_FILE_LIMIT) throw Error(`The chat recovery export exceeds its ${(CHAT_RECOVERY_FILE_LIMIT / 1_000_000).toFixed(0)} MB safety limit. Nothing was exported.`)
  return document
}

/** Parse only the app-owned recovery format. No legacy or arbitrary JSON shape is accepted. */
export function parseChatRecoveryDocument(bytes: Buffer): ChatRecoveryDocument {
  if (bytes.length > CHAT_RECOVERY_FILE_LIMIT) throw Error('The selected recovery file exceeds the 768 MB import limit. Nothing was imported.')
  const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Partial<ChatRecoveryDocument>
  if (raw.format !== CHAT_RECOVERY_FORMAT || raw.version !== CHAT_RECOVERY_VERSION) {
    throw Error('The selected file is not a supported OddBrain chat recovery export. Nothing was imported.')
  }
  const exportedAt = typeof raw.exportedAt === 'string' ? Date.parse(raw.exportedAt) : Number.NaN
  if (typeof raw.exportedAt !== 'string' || raw.exportedAt.length > 64 || !Number.isFinite(exportedAt) || new Date(exportedAt).toISOString() !== raw.exportedAt) {
    throw Error('The recovery export has an invalid export date. Nothing was imported.')
  }
  if (raw.currentChat !== '' && !validId(raw.currentChat)) {
    throw Error('The recovery export has an invalid current-chat value. Nothing was imported.')
  }
  if (!Array.isArray(raw.chats) || raw.chats.length > RECOVERY_CHAT_LIMIT) {
    throw Error(`The recovery export exceeds the ${RECOVERY_CHAT_LIMIT.toLocaleString()}-chat import limit. Nothing was imported.`)
  }
  const chats = normalizeChats(raw.chats), ids = new Set<string>()
  for (const chat of chats) {
    if (!validId(chat.id) || ids.has(chat.id)) throw Error('The recovery export contains invalid or duplicate chat identifiers. Nothing was imported.')
    ids.add(chat.id)
  }
  const legacy = raw.legacy
  if (!legacy || !(legacy.rawChats === null || typeof legacy.rawChats === 'string') || !(legacy.rawCurrentChat === null || typeof legacy.rawCurrentChat === 'string')) {
    throw Error('The recovery export has invalid legacy evidence. Nothing was imported.')
  }
  return {
    format: CHAT_RECOVERY_FORMAT,
    version: CHAT_RECOVERY_VERSION,
    exportedAt: raw.exportedAt,
    currentChat: raw.currentChat,
    chats,
    legacy: { rawChats: legacy.rawChats, rawCurrentChat: legacy.rawCurrentChat },
  }
}

/**
 * Merge without replacing an existing chat. Exact repeats are skipped. An ID
 * collision keeps both versions under a fresh ID and records export provenance.
 */
export function mergeChatRecovery(existing: Chat[], existingCurrent: string, initialized: boolean, document: ChatRecoveryDocument): ChatRecoveryMerge {
  const existingById = new Map(existing.map(chat => [chat.id, chat]))
  const existingRecovery = new Map<string, string>()
  for (const chat of existing) {
    const source = chat.recoveredFrom
    if (source) existingRecovery.set(`${source.exportedAt}\u0000${source.originalChatId}\u0000${source.sha256}`, chat.id)
  }
  const used = new Set(existingById.keys()), mapped = new Map<string, string>()
  const pending: Array<{ chat: Chat; id: string; hash: string }> = []
  let identical = 0, conflicts = 0

  for (const chat of document.chats) {
    const text = JSON.stringify(chat), hash = digest(text)
    const priorImport = existingRecovery.get(`${document.exportedAt}\u0000${chat.id}\u0000${hash}`)
    if (priorImport) { mapped.set(chat.id, priorImport); identical++; continue }
    const sameId = existingById.get(chat.id)
    if (sameId && JSON.stringify(sameId) === text) { mapped.set(chat.id, chat.id); identical++; continue }
    let id = chat.id
    if (used.has(id)) {
      conflicts++
      do { id = `recovered-${randomUUID()}` } while (used.has(id))
    }
    used.add(id); mapped.set(chat.id, id); pending.push({ chat, id, hash })
  }

  const imported = pending.map(({ chat, id, hash }): Chat => ({
    ...chat,
    id,
    ...(chat.branchOf ? { branchOf: mapped.get(chat.branchOf) || chat.branchOf } : {}),
    ...(chat.branchedFrom ? { branchedFrom: { ...chat.branchedFrom, chatId: mapped.get(chat.branchedFrom.chatId) || chat.branchedFrom.chatId } } : {}),
    recoveredFrom: { exportedAt: document.exportedAt, originalChatId: chat.id, sha256: hash },
  }))
  const importedCurrent = mapped.get(document.currentChat) || ''
  return {
    chats: [...existing, ...imported],
    currentChat: initialized ? existingCurrent : importedCurrent,
    imported: imported.length,
    identical,
    conflicts,
  }
}
