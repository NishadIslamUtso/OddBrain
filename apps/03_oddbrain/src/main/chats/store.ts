import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { normalizeChats } from '../../shared/lib/storage'
import type {
  ChatStoreMigration,
  ChatStoreSnapshot,
  ChatStoreWrite,
} from '../../shared/lib/chatStore'
import type { Chat } from '../../shared/types'
import { noLinkedPath } from '../engine/configTransaction'
import { readRegularFileSync } from '../safeFile'

const FORMAT = 'oddbrain-chats'
const VERSION = 1
const INDEX_LIMIT = 8_000_000
export const CHAT_LIMIT = 64_000_000
export const CHAT_TOTAL_LIMIT = 512_000_000
export const CHAT_COUNT_LIMIT = 20_000
const ID_LIMIT = 1_024
const ITEM_FILE = /^[a-f0-9]{64}-[a-f0-9]{64}\.json$/

type IndexItem = { id: string; file: string; sha256: string; bytes: number }
type ChatIndex = {
  format: typeof FORMAT
  version: typeof VERSION
  revision: number
  currentChat: string
  items: IndexItem[]
}

type Loaded = { snapshot: ChatStoreSnapshot; index: ChatIndex | null; recovered: boolean }
type Prepared = { chats: Chat[]; currentChat: string; serialized: Array<{ chat: Chat; text: string; bytes: number }> }

const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= ID_LIMIT && !/[\u0000-\u001f]/.test(value)

function atomicWrite(file: string, value: string): void {
  noLinkedPath(file)
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${randomUUID()}.tmp`
  const descriptor = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(descriptor, value, 'utf8')
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  try {
    renameSync(temporary, file)
  } catch (error) {
    try { rmSync(temporary, { force: true }) } catch { /* the untouched temporary is not the record */ }
    throw error
  }
}

function parseIndex(bytes: Buffer): ChatIndex {
  const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Partial<ChatIndex>
  if (raw.format !== FORMAT || raw.version !== VERSION || !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1) {
    throw Error('The conversation index has an unsupported or damaged header.')
  }
  if (typeof raw.currentChat !== 'string' || raw.currentChat.length > ID_LIMIT) throw Error('The conversation index has an invalid current chat.')
  if (!Array.isArray(raw.items) || raw.items.length > CHAT_COUNT_LIMIT) throw Error('The conversation index exceeds its safe item limit.')
  const items: IndexItem[] = []
  const ids = new Set<string>(), files = new Set<string>()
  for (const candidate of raw.items) {
    if (!candidate || !validId(candidate.id) || typeof candidate.file !== 'string' || !ITEM_FILE.test(candidate.file) || typeof candidate.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(candidate.sha256) || !Number.isSafeInteger(candidate.bytes) || candidate.bytes < 0 || candidate.bytes > CHAT_LIMIT) {
      throw Error('The conversation index contains an invalid item.')
    }
    if (ids.has(candidate.id) || files.has(candidate.file)) throw Error('The conversation index contains a duplicate item.')
    ids.add(candidate.id); files.add(candidate.file)
    items.push({ id: candidate.id, file: candidate.file, sha256: candidate.sha256, bytes: candidate.bytes })
  }
  return { format: FORMAT, version: VERSION, revision: raw.revision as number, currentChat: raw.currentChat, items }
}

function prepare(chatsInput: unknown, currentInput: unknown): Prepared {
  const chats = normalizeChats(chatsInput)
  if (chats.length > CHAT_COUNT_LIMIT) throw Error(`Conversation storage accepts at most ${CHAT_COUNT_LIMIT.toLocaleString()} chats. Nothing was replaced.`)
  const ids = new Set<string>()
  let total = 0
  const serialized = chats.map(chat => {
    if (!validId(chat.id) || ids.has(chat.id)) throw Error('Conversation identifiers must be unique, non-empty text. Nothing was replaced.')
    ids.add(chat.id)
    const text = JSON.stringify(chat)
    const bytes = Buffer.byteLength(text)
    if (bytes > CHAT_LIMIT) throw Error('One conversation exceeds the 64 MB safety limit. Nothing was shortened or replaced.')
    total += bytes
    if (total > CHAT_TOTAL_LIMIT) throw Error('Conversation history exceeds the 512 MB migration limit. Nothing was shortened or replaced.')
    return { chat, text, bytes }
  })
  if (typeof currentInput !== 'string' || currentInput.length > ID_LIMIT) throw Error('The current conversation identifier is invalid. Nothing was replaced.')
  const currentChat = ids.has(currentInput) ? currentInput : ''
  return { chats, currentChat, serialized }
}

export function createChatStore(root: string) {
  const indexFile = join(root, 'index.json')
  const previousFile = join(root, 'index.previous.json')
  const itemsRoot = join(root, 'items')
  const recoveryRoot = join(root, 'recovery')
  const migrationRoot = join(root, 'migration')
  const migrationFile = join(migrationRoot, 'legacy-local-storage.json')
  const itemPath = (name: string): string => join(itemsRoot, name)
  let cached: Loaded | null = null

  const readFrom = (file: string): { snapshot: ChatStoreSnapshot; index: ChatIndex } => {
    noLinkedPath(root)
    const index = parseIndex(readRegularFileSync(file, INDEX_LIMIT).bytes)
    const chats: Chat[] = []
    let total = 0
    for (const item of index.items) {
      const bytes = readRegularFileSync(itemPath(item.file), CHAT_LIMIT).bytes
      total += bytes.length
      if (total > CHAT_TOTAL_LIMIT) throw Error('Conversation history exceeds the 512 MB read limit. Original files are unchanged.')
      if (bytes.length !== item.bytes || digest(bytes) !== item.sha256) throw Error('A saved conversation no longer matches its index. Original files are unchanged.')
      const [chat] = normalizeChats([JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))])
      if (!chat || chat.id !== item.id) throw Error('A saved conversation has the wrong identity. Original files are unchanged.')
      chats.push(chat)
    }
    return {
      index,
      snapshot: {
        initialized: true,
        revision: index.revision,
        chats,
        currentChat: chats.some(chat => chat.id === index.currentChat) ? index.currentChat : '',
      },
    }
  }

  const load = (): Loaded => {
    noLinkedPath(root)
    if (!existsSync(indexFile) && !existsSync(previousFile)) {
      return { index: null, recovered: false, snapshot: { initialized: false, revision: 0, chats: [], currentChat: '' } }
    }
    try {
      const current = readFrom(indexFile)
      return { ...current, recovered: false }
    } catch (currentError) {
      try {
        const previous = readFrom(previousFile)
        return {
          ...previous,
          recovered: true,
          snapshot: {
            ...previous.snapshot,
            notice: `The newest conversation index could not be read (${(currentError as Error).message}) The previous complete index is open; the damaged files have not been changed.`,
          },
        }
      } catch (previousError) {
        throw Error(`Conversation storage could not be read. Current: ${(currentError as Error).message} Previous: ${(previousError as Error).message} Original files are unchanged.`)
      }
    }
  }

  const prepareUpdate = (input: ChatStoreWrite, before: Loaded): Prepared => {
    if (!Array.isArray(input?.order) || input.order.length > CHAT_COUNT_LIMIT || input.order.some(id => !validId(id))) {
      throw Error('The conversation order is invalid. Nothing was replaced.')
    }
    const order = input.order as string[], ordered = new Set(order)
    if (ordered.size !== order.length) throw Error('The conversation order contains duplicate identifiers. Nothing was replaced.')
    const upserts = normalizeChats(input.upserts)
    const changed = new Map<string, Chat>()
    for (const chat of upserts) {
      if (!validId(chat.id) || changed.has(chat.id) || !ordered.has(chat.id)) throw Error('A changed conversation is not uniquely present in the index. Nothing was replaced.')
      changed.set(chat.id, chat)
    }
    const existing = new Map(before.snapshot.chats.map(chat => [chat.id, chat]))
    const existingItems = new Map((before.index?.items || []).map(item => [item.id, item]))
    const chats: Chat[] = [], serialized: Prepared['serialized'] = []
    let total = 0
    for (const id of order) {
      const replacement = changed.get(id), chat = replacement || existing.get(id)
      if (!chat) throw Error('The conversation update omitted data required by its index. Nothing was replaced.')
      chats.push(chat)
      if (replacement) {
        const text = JSON.stringify(replacement), bytes = Buffer.byteLength(text)
        if (bytes > CHAT_LIMIT) throw Error('One conversation exceeds the 64 MB safety limit. Nothing was shortened or replaced.')
        total += bytes; serialized.push({ chat: replacement, text, bytes })
      } else {
        const item = existingItems.get(id)
        if (!item) throw Error('The conversation index could not account for an unchanged chat. Nothing was replaced.')
        total += item.bytes
      }
      if (total > CHAT_TOTAL_LIMIT) throw Error('Conversation history exceeds the 512 MB migration limit. Nothing was shortened or replaced.')
    }
    if (typeof input.currentChat !== 'string' || input.currentChat.length > ID_LIMIT) throw Error('The current conversation identifier is invalid. Nothing was replaced.')
    return { chats, serialized, currentChat: ordered.has(input.currentChat) ? input.currentChat : '' }
  }

  const preserveDamagedIndex = (): void => {
    if (!existsSync(indexFile)) return
    noLinkedPath(indexFile)
    mkdirSync(recoveryRoot, { recursive: true, mode: 0o700 })
    const destination = join(recoveryRoot, `index-damaged-${Date.now()}-${randomUUID()}.json`)
    const bytes = readRegularFileSync(indexFile, INDEX_LIMIT).bytes
    writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 })
  }

  const commit = (prepared: Prepared, before: Loaded): Loaded => {
    noLinkedPath(root)
    mkdirSync(itemsRoot, { recursive: true, mode: 0o700 })
    const items: IndexItem[] = []
    const previousItems = new Map((before.index?.items || []).map(item => [item.id, item]))
    const changes = new Map(prepared.serialized.map(entry => [entry.chat.id, entry]))
    for (const chat of prepared.chats) {
      const entry = changes.get(chat.id), previous = previousItems.get(chat.id)
      // An unchanged chat keeps its already-verified immutable file. Streaming
      // one answer therefore does not serialize, reread or rewrite every other conversation.
      if (!entry) {
        if (!previous) throw Error('The conversation index lost an unchanged chat. Nothing was replaced.')
        items.push(previous); continue
      }
      const contentHash = digest(entry.text)
      if (previous?.sha256 === contentHash) { items.push(previous); continue }
      const file = `${digest(entry.chat.id)}-${contentHash}.json`
      const path = itemPath(file)
      // The content-addressed item is immutable. Stage and rename it before the
      // index can mention it, so a power loss can leave only an unreferenced temp
      // file, never a half-written chat at its final name.
      if (!existsSync(path)) atomicWrite(path, entry.text)
      const saved = readRegularFileSync(path, CHAT_LIMIT).bytes
      if (saved.length !== entry.bytes || digest(saved) !== contentHash) throw Error('A conversation file could not be verified. The active index was not replaced.')
      items.push({ id: entry.chat.id, file, sha256: contentHash, bytes: entry.bytes })
    }
    const index: ChatIndex = {
      format: FORMAT,
      version: VERSION,
      revision: before.snapshot.revision + 1,
      currentChat: prepared.currentChat,
      items,
    }
    const text = `${JSON.stringify(index, null, 2)}\n`
    if (Buffer.byteLength(text) > INDEX_LIMIT) throw Error('The conversation index exceeds its safe size. The active index was not replaced.')

    if (before.recovered) preserveDamagedIndex()
    else if (existsSync(indexFile)) {
      const current = readRegularFileSync(indexFile, INDEX_LIMIT).bytes.toString('utf8')
      atomicWrite(previousFile, current)
    } else {
      // The first migration gets a complete fallback too. If power is lost
      // between these renames, startup can still open this verified snapshot.
      atomicWrite(previousFile, text)
    }
    atomicWrite(indexFile, text)
    const verifiedIndex = parseIndex(readRegularFileSync(indexFile, INDEX_LIMIT).bytes)
    if (JSON.stringify(verifiedIndex) !== JSON.stringify(index)) throw Error('Conversation storage verification failed. The previous index remains available.')
    const verified: ChatStoreSnapshot = {
      initialized: true,
      revision: index.revision,
      chats: prepared.chats,
      currentChat: prepared.currentChat,
    }

    // Keep every file named by either atomic index. Other immutable generations
    // are incomplete staging or superseded streaming snapshots, not chat history.
    if (!before.recovered) {
      const keep = new Set(index.items.map(item => item.file))
      try {
        const previous = parseIndex(readRegularFileSync(previousFile, INDEX_LIMIT).bytes)
        for (const item of previous.items) keep.add(item.file)
      } catch { /* a first write has no previous index */ }
      try {
        for (const name of readdirSync(itemsRoot)) {
          if (!ITEM_FILE.test(name) || keep.has(name)) continue
          const path = itemPath(name)
          if (lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink()) rmSync(path)
        }
      } catch { /* cleanup cannot turn a verified save into a reported failure */ }
    }
    return { snapshot: verified, index, recovered: false }
  }

  const backupMigration = (input: ChatStoreMigration): void => {
    const record = `${JSON.stringify({
      format: 'oddbrain-local-storage-recovery',
      version: 1,
      savedAt: new Date().toISOString(),
      rawChats: input.rawChats,
      rawCurrentChat: input.rawCurrentChat,
    }, null, 2)}\n`
    const limit = CHAT_TOTAL_LIMIT + 2_000_000
    if (Buffer.byteLength(record) > limit) throw Error('The legacy recovery copy exceeds the migration limit. Nothing was moved.')
    let destination = migrationFile
    if (existsSync(migrationFile)) {
      try {
        const previous = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readRegularFileSync(migrationFile, limit).bytes)) as Partial<ChatStoreMigration>
        if (previous.rawChats === input.rawChats && previous.rawCurrentChat === input.rawCurrentChat) return
      } catch { /* preserve the unreadable first recovery and write beside it */ }
      destination = join(migrationRoot, `legacy-local-storage-${Date.now()}-${randomUUID()}.json`)
    }
    atomicWrite(destination, record)
  }

  return {
    read(): ChatStoreSnapshot {
      cached = load()
      return cached.snapshot
    },
    migrate(input: ChatStoreMigration): { snapshot: ChatStoreSnapshot; migrated: boolean } {
      const before = cached || load()
      if (before.snapshot.initialized) { cached = before; return { snapshot: before.snapshot, migrated: false } }
      const prepared = prepare(input?.chats, input?.currentChat)
      if (!(input.rawChats === null || typeof input.rawChats === 'string') || !(input.rawCurrentChat === null || typeof input.rawCurrentChat === 'string')) {
        throw Error('The legacy recovery values are invalid. Nothing was moved.')
      }
      if (typeof input.rawChats === 'string') {
        if (Buffer.byteLength(input.rawChats) > CHAT_TOTAL_LIMIT) throw Error('Legacy chat storage exceeds the 512 MB migration limit. Nothing was moved.')
        const rawChats = normalizeChats(JSON.parse(input.rawChats))
        if (JSON.stringify(rawChats) !== JSON.stringify(prepared.chats)) throw Error('Legacy chat storage changed during migration. Nothing was moved.')
      } else if (prepared.chats.length) throw Error('Legacy chat storage disappeared during migration. Nothing was moved.')
      if (typeof input.rawCurrentChat === 'string') {
        if (Buffer.byteLength(input.rawCurrentChat) > ID_LIMIT + 16) throw Error('The legacy current-chat value exceeds its migration limit. Nothing was moved.')
        const rawCurrent: unknown = JSON.parse(input.rawCurrentChat)
        if (typeof rawCurrent !== 'string' || (prepared.currentChat !== rawCurrent && prepared.currentChat !== '')) throw Error('The current chat changed during migration. Nothing was moved.')
      }
      backupMigration(input)
      cached = commit(prepared, before)
      return { snapshot: cached.snapshot, migrated: true }
    },
    write(input: ChatStoreWrite): ChatStoreSnapshot {
      const before = cached || load()
      if (!before.snapshot.initialized) throw Error('Conversation storage has not been migrated yet. Nothing was replaced.')
      if (!Number.isSafeInteger(input?.expectedRevision) || input.expectedRevision !== before.snapshot.revision) {
        const error = new Error('Conversation storage changed in another window. Nothing was replaced.') as Error & { snapshot?: ChatStoreSnapshot }
        error.snapshot = before.snapshot
        throw error
      }
      const prepared = prepareUpdate(input, before)
      const beforeIds = before.snapshot.chats.map(chat => chat.id)
      const sameOrder = beforeIds.length === (input.order as string[]).length && beforeIds.every((id, index) => id === (input.order as string[])[index])
      const beforeById = new Map(before.snapshot.chats.map(chat => [chat.id, chat]))
      const upserts = normalizeChats(input.upserts)
      const sameUpserts = upserts.every(chat => JSON.stringify(chat) === JSON.stringify(beforeById.get(chat.id)))
      const same = sameOrder && sameUpserts && prepared.currentChat === before.snapshot.currentChat
      if (same) { cached = before; return before.snapshot }
      cached = commit(prepared, before)
      return cached.snapshot
    },
  }
}

export type ChatStore = ReturnType<typeof createChatStore>
