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
import { mergeChatRecovery, type ChatRecoveryDocument, type ChatRecoveryMerge } from './recovery'

const FORMAT = 'oddbrain-chats'
const VERSION = 2
const LEGACY_VERSION = 1
const DELTA_FORMAT = 'oddbrain-chat-text-delta'
const DELTA_VERSION = 1
const INDEX_LIMIT = 8_000_000
export const CHAT_LIMIT = 64_000_000
export const CHAT_TOTAL_LIMIT = 512_000_000
export const CHAT_COUNT_LIMIT = 20_000
const CHAT_STORED_TOTAL_LIMIT = CHAT_TOTAL_LIMIT * 2
const DELTA_DEPTH_LIMIT = 64
const DELTA_EXTRA_LIMIT = 16_000_000
const ID_LIMIT = 1_024
const SNAPSHOT_FILE = /^([a-f0-9]{64})-([a-f0-9]{64})\.json$/
const DELTA_FILE = /^([a-f0-9]{64})-([a-f0-9]{64})\.delta\.json$/
const ITEM_FILE = /^(?:[a-f0-9]{64}-[a-f0-9]{64}\.json|[a-f0-9]{64}-[a-f0-9]{64}\.delta\.json)$/

type RecordRef = {
  file: string
  fileSha256: string
  fileBytes: number
  depth: number
  sha256: string
  bytes: number
}
type IndexItem = RecordRef & { id: string }
type ChatIndex = {
  format: typeof FORMAT
  version: typeof LEGACY_VERSION | typeof VERSION
  revision: number
  currentChat: string
  items: IndexItem[]
}
type DeltaDocument = {
  format: typeof DELTA_FORMAT
  version: typeof DELTA_VERSION
  previous: RecordRef
  result: { sha256: string; bytes: number }
  prefix: number
  remove: number
  insert: string
}
type StoredChat = { text?: string; files: Set<string>; storedBytes: number }
type Loaded = { snapshot: ChatStoreSnapshot; index: ChatIndex | null; recovered: boolean; records: Map<string, StoredChat> }
type Prepared = { chats: Chat[]; currentChat: string; serialized: Array<{ chat: Chat; text: string; bytes: number }> }
export type ChatRecoveryImportPlan = {
  prepared: Prepared
  merge: ChatRecoveryMerge
  repair: boolean
  expectedInitialized: boolean
  expectedRevision: number
  storageToken: string
  storageProblem?: string
}

const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex')
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= ID_LIMIT && !/[\u0000-\u001f]/.test(value)

function syncDirectory(file: string): void {
  let descriptor: number | undefined
  try { descriptor = openSync(dirname(file), 'r'); fsyncSync(descriptor) }
  catch { /* Windows cannot always fsync directory handles; file fsync still completed. */ }
  finally { if (descriptor !== undefined) try { closeSync(descriptor) } catch { /* best effort */ } }
}

function atomicWrite(file: string, value: string): void {
  noLinkedPath(file)
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    const descriptor = openSync(temporary, 'wx', 0o600)
    try {
      writeFileSync(descriptor, value, 'utf8')
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    renameSync(temporary, file)
    syncDirectory(file)
  } catch (error) {
    try { rmSync(temporary, { force: true }) } catch { /* the untouched temporary is not the record */ }
    throw error
  }
}

const validHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const validStoredNumber = (value: unknown, maximum: number): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum

function validRecordRef(value: unknown): value is RecordRef {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RecordRef>
  if (typeof candidate.file !== 'string' || !ITEM_FILE.test(candidate.file) || !validHash(candidate.fileSha256) || !validStoredNumber(candidate.fileBytes, CHAT_LIMIT) || !validStoredNumber(candidate.depth, DELTA_DEPTH_LIMIT) || !validHash(candidate.sha256) || !validStoredNumber(candidate.bytes, CHAT_LIMIT)) return false
  const match = candidate.depth === 0 ? SNAPSHOT_FILE.exec(candidate.file) : DELTA_FILE.exec(candidate.file)
  return !!match && match[2] === candidate.fileSha256 && (candidate.depth !== 0 || (candidate.fileSha256 === candidate.sha256 && candidate.fileBytes === candidate.bytes))
}

function parseIndex(bytes: Buffer): ChatIndex {
  const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as { format?: unknown; version?: unknown; revision?: unknown; currentChat?: unknown; items?: unknown }
  if (raw.format !== FORMAT || (raw.version !== LEGACY_VERSION && raw.version !== VERSION) || !Number.isSafeInteger(raw.revision) || (raw.revision as number) < 1) {
    throw Error('The conversation index has an unsupported or damaged header.')
  }
  if (typeof raw.currentChat !== 'string' || raw.currentChat.length > ID_LIMIT) throw Error('The conversation index has an invalid current chat.')
  if (!Array.isArray(raw.items) || raw.items.length > CHAT_COUNT_LIMIT) throw Error('The conversation index exceeds its safe item limit.')
  const items: IndexItem[] = []
  const ids = new Set<string>(), files = new Set<string>()
  for (const rawItem of raw.items) {
    const candidate = rawItem as Partial<IndexItem>
    if (!candidate || !validId(candidate.id) || typeof candidate.file !== 'string' || !validHash(candidate.sha256) || !validStoredNumber(candidate.bytes, CHAT_LIMIT)) {
      throw Error('The conversation index contains an invalid item.')
    }
    const item: IndexItem = raw.version === LEGACY_VERSION
      ? { id: candidate.id, file: candidate.file, fileSha256: candidate.sha256, fileBytes: candidate.bytes, depth: 0, sha256: candidate.sha256, bytes: candidate.bytes }
      : { id: candidate.id, file: candidate.file, fileSha256: candidate.fileSha256 as string, fileBytes: candidate.fileBytes as number, depth: candidate.depth as number, sha256: candidate.sha256, bytes: candidate.bytes }
    if (!validRecordRef(item) || !item.file.startsWith(`${digest(item.id)}-`)) throw Error('The conversation index contains an invalid item record.')
    if (ids.has(item.id) || files.has(item.file)) throw Error('The conversation index contains a duplicate item.')
    ids.add(item.id); files.add(item.file); items.push(item)
  }
  return { format: FORMAT, version: raw.version, revision: raw.revision as number, currentChat: raw.currentChat, items }
}

const recordRef = (item: IndexItem): RecordRef => ({
  file: item.file,
  fileSha256: item.fileSha256,
  fileBytes: item.fileBytes,
  depth: item.depth,
  sha256: item.sha256,
  bytes: item.bytes,
})

function deltaDocument(previous: IndexItem, before: string, after: string, afterHash: string, afterBytes: number): string {
  let prefix = 0
  const shared = Math.min(before.length, after.length)
  while (prefix < shared && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix++
  let suffix = 0
  while (suffix < shared - prefix && before.charCodeAt(before.length - suffix - 1) === after.charCodeAt(after.length - suffix - 1)) suffix++
  const document: DeltaDocument = {
    format: DELTA_FORMAT,
    version: DELTA_VERSION,
    previous: recordRef(previous),
    result: { sha256: afterHash, bytes: afterBytes },
    prefix,
    remove: before.length - prefix - suffix,
    insert: after.slice(prefix, after.length - suffix),
  }
  return JSON.stringify(document)
}

function parseDelta(bytes: Buffer, current: RecordRef, id: string): DeltaDocument {
  const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Partial<DeltaDocument>
  if (raw.format !== DELTA_FORMAT || raw.version !== DELTA_VERSION || !validRecordRef(raw.previous) || raw.previous.depth !== current.depth - 1 || !raw.previous.file.startsWith(`${digest(id)}-`)) {
    throw Error('A conversation delta has an invalid predecessor.')
  }
  if (!raw.result || raw.result.sha256 !== current.sha256 || raw.result.bytes !== current.bytes || !validHash(raw.result.sha256) || !validStoredNumber(raw.result.bytes, CHAT_LIMIT)) {
    throw Error('A conversation delta has an invalid result identity.')
  }
  if (!Number.isSafeInteger(raw.prefix) || (raw.prefix as number) < 0 || !Number.isSafeInteger(raw.remove) || (raw.remove as number) < 0 || typeof raw.insert !== 'string') {
    throw Error('A conversation delta has invalid text bounds.')
  }
  return raw as DeltaDocument
}

function applyDelta(before: string, delta: DeltaDocument): string {
  if (delta.prefix > before.length || delta.remove > before.length - delta.prefix) throw Error('A conversation delta does not fit its immutable predecessor.')
  const after = `${before.slice(0, delta.prefix)}${delta.insert}${before.slice(delta.prefix + delta.remove)}`
  // Character length is an allocation guard; the exact UTF-8 length and SHA-256
  // are verified once on the final reconstruction below. The authenticated
  // predecessor links make re-hashing every large intermediate unnecessary.
  if (after.length > CHAT_LIMIT) throw Error('A conversation delta exceeds its reconstruction limit.')
  return after
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
    if (bytes > CHAT_LIMIT) throw Error(`“${chat.title.trim().slice(0, 80) || chat.id}” is ${(bytes / 1_000_000).toFixed(1)} MB; one app chat can be at most 64 MB. Remove large embedded content or branch before retrying. Nothing was shortened or replaced.`)
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

  const storageToken = (): string => digest([indexFile, previousFile].map(file => {
    if (!existsSync(file)) return 'missing'
    const bytes = readRegularFileSync(file, INDEX_LIMIT).bytes
    return `${bytes.length}:${digest(bytes)}`
  }).join('|'))

  const quarantineIndexes = (): Array<{ source: string; recovery: string }> => {
    mkdirSync(recoveryRoot, { recursive: true, mode: 0o700 })
    const moved: Array<{ source: string; recovery: string }> = []
    try {
      for (const [source, label] of [[indexFile, 'current'], [previousFile, 'previous']] as const) {
        if (!existsSync(source)) continue
        // Verify a bounded regular file before moving it. Linked or enormous
        // indexes require manual inspection and are never silently replaced.
        readRegularFileSync(source, INDEX_LIMIT)
        const recovery = join(recoveryRoot, `index-before-import-${label}-${Date.now()}-${randomUUID()}.json`)
        renameSync(source, recovery); moved.push({ source, recovery })
      }
      return moved
    } catch (error) {
      for (const entry of [...moved].reverse()) {
        try { renameSync(entry.recovery, entry.source) } catch { /* original error remains authoritative */ }
      }
      throw error
    }
  }

  const restoreQuarantinedIndexes = (moved: Array<{ source: string; recovery: string }>): void => {
    try { rmSync(indexFile, { force: true }); rmSync(previousFile, { force: true }) } catch { /* best effort before exact names are restored */ }
    for (const entry of [...moved].reverse()) renameSync(entry.recovery, entry.source)
  }

  const readItem = (item: IndexItem): { chat: Chat; record: StoredChat } => {
    let current = recordRef(item), storedBytes = 0
    const files = new Set<string>(), deltas: DeltaDocument[] = []
    let text = ''
    for (;;) {
      if (files.has(current.file)) throw Error('A conversation record chain contains a cycle.')
      const bytes = readRegularFileSync(itemPath(current.file), CHAT_LIMIT).bytes
      if (bytes.length !== current.fileBytes || digest(bytes) !== current.fileSha256) throw Error('A saved conversation record no longer matches its immutable reference.')
      files.add(current.file); storedBytes += bytes.length
      if (storedBytes > CHAT_LIMIT + DELTA_EXTRA_LIMIT) throw Error('A conversation record chain exceeds its bounded read budget.')
      if (current.depth === 0) {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        if (Buffer.byteLength(text) !== current.bytes || digest(text) !== current.sha256) throw Error('A saved conversation snapshot does not match its recorded content.')
        break
      }
      const delta = parseDelta(bytes, current, item.id)
      deltas.push(delta); current = delta.previous
    }
    for (let index = deltas.length - 1; index >= 0; index--) text = applyDelta(text, deltas[index])
    if (Buffer.byteLength(text) !== item.bytes || digest(text) !== item.sha256) throw Error('A saved conversation chain does not match its index.')
    const [chat] = normalizeChats([JSON.parse(text)])
    if (!chat || chat.id !== item.id) throw Error('A saved conversation has the wrong identity. Original files are unchanged.')
    return { chat, record: { text, files, storedBytes } }
  }

  const readFrom = (file: string): { snapshot: ChatStoreSnapshot; index: ChatIndex; records: Map<string, StoredChat> } => {
    noLinkedPath(root)
    const index = parseIndex(readRegularFileSync(file, INDEX_LIMIT).bytes)
    const chats: Chat[] = [], records = new Map<string, StoredChat>()
    let total = 0, storedTotal = 0
    for (const item of index.items) {
      const loaded = readItem(item)
      total += item.bytes; storedTotal += loaded.record.storedBytes
      if (total > CHAT_TOTAL_LIMIT) throw Error('Conversation history exceeds the 512 MB read limit. Original files are unchanged.')
      if (storedTotal > CHAT_STORED_TOTAL_LIMIT) throw Error('Conversation record chains exceed their bounded read budget. Original files are unchanged.')
      chats.push(loaded.chat)
      records.set(item.id, item.id === index.currentChat ? loaded.record : { files: loaded.record.files, storedBytes: loaded.record.storedBytes })
    }
    return {
      index,
      records,
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
      return { index: null, recovered: false, records: new Map(), snapshot: { initialized: false, revision: 0, chats: [], currentChat: '' } }
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
        if (bytes > CHAT_LIMIT) throw Error(`“${replacement.title.trim().slice(0, 80) || replacement.id}” is ${(bytes / 1_000_000).toFixed(1)} MB; one app chat can be at most 64 MB. Remove large embedded content or branch before retrying. Nothing was shortened or replaced.`)
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
    const items: IndexItem[] = [], records = new Map<string, StoredChat>()
    const previousItems = new Map((before.index?.items || []).map(item => [item.id, item]))
    const previousChats = new Map(before.snapshot.chats.map(chat => [chat.id, chat]))
    const changes = new Map(prepared.serialized.map(entry => [entry.chat.id, entry]))
    let plannedStoredTotal = prepared.chats.reduce((sum, chat) => sum + (before.records.get(chat.id)?.storedBytes || 0), 0)
    const retainedRecord = (chat: Chat, item: IndexItem, saved: StoredChat): StoredChat => {
      if (chat.id !== prepared.currentChat) return { files: saved.files, storedBytes: saved.storedBytes }
      if (saved.text) return saved
      const text = JSON.stringify(chat)
      return Buffer.byteLength(text) === item.bytes && digest(text) === item.sha256 ? { ...saved, text } : saved
    }
    for (const chat of prepared.chats) {
      const entry = changes.get(chat.id), previous = previousItems.get(chat.id), previousRecord = before.records.get(chat.id)
      // An unchanged chat keeps its already-verified immutable record chain.
      if (!entry) {
        if (!previous || !previousRecord) throw Error('The conversation index lost an unchanged chat. Nothing was replaced.')
        items.push(previous); records.set(chat.id, retainedRecord(chat, previous, previousRecord)); continue
      }
      const contentHash = digest(entry.text)
      if (previous?.sha256 === contentHash) {
        if (!previousRecord) throw Error('The conversation index lost an unchanged chat record. Nothing was replaced.')
        items.push(previous); records.set(chat.id, retainedRecord(chat, previous, previousRecord)); continue
      }

      let item: IndexItem | null = null, record: StoredChat | null = null
      if (previous && previousRecord && previous.depth < DELTA_DEPTH_LIMIT) {
        const previousChat = previousChats.get(chat.id)
        const previousText = previousRecord.text || (previousChat ? JSON.stringify(previousChat) : '')
        // A legacy snapshot that normalizes differently is compacted once rather
        // than using a delta against bytes the renderer never saw.
        if (Buffer.byteLength(previousText) === previous.bytes && digest(previousText) === previous.sha256) {
          const delta = deltaDocument(previous, previousText, entry.text, contentHash, entry.bytes)
          const deltaBytes = Buffer.byteLength(delta)
          const candidateStored = previousRecord.storedBytes + deltaBytes
          const extraBudget = Math.min(DELTA_EXTRA_LIMIT, Math.max(1_000_000, entry.bytes))
          const chainBudget = Math.min(CHAT_LIMIT + DELTA_EXTRA_LIMIT, entry.bytes + extraBudget)
          const candidateTotal = plannedStoredTotal - previousRecord.storedBytes + candidateStored
          // Small immutable deltas are worthwhile; large rewrites and bounded-chain
          // compaction become one fresh full snapshot instead.
          if (deltaBytes < entry.bytes && candidateStored <= chainBudget && candidateTotal <= CHAT_STORED_TOTAL_LIMIT) {
            const fileHash = digest(delta), file = `${digest(entry.chat.id)}-${fileHash}.delta.json`, path = itemPath(file)
            if (!existsSync(path)) atomicWrite(path, delta)
            const saved = readRegularFileSync(path, CHAT_LIMIT).bytes
            if (saved.length !== deltaBytes || digest(saved) !== fileHash) throw Error('A conversation delta could not be verified. The active index was not replaced.')
            item = { id: entry.chat.id, file, fileSha256: fileHash, fileBytes: deltaBytes, depth: previous.depth + 1, sha256: contentHash, bytes: entry.bytes }
            record = { ...(chat.id === prepared.currentChat ? { text: entry.text } : {}), files: new Set([...previousRecord.files, file]), storedBytes: candidateStored }
          }
        }
      }
      if (!item || !record) {
        const file = `${digest(entry.chat.id)}-${contentHash}.json`, path = itemPath(file)
        // A full snapshot is still content-addressed and immutable. It is used for
        // new chats, large edits, and bounded compaction—not each streaming tick.
        if (!existsSync(path)) atomicWrite(path, entry.text)
        const saved = readRegularFileSync(path, CHAT_LIMIT).bytes
        if (saved.length !== entry.bytes || digest(saved) !== contentHash) throw Error('A conversation snapshot could not be verified. The active index was not replaced.')
        item = { id: entry.chat.id, file, fileSha256: contentHash, fileBytes: entry.bytes, depth: 0, sha256: contentHash, bytes: entry.bytes }
        record = { ...(chat.id === prepared.currentChat ? { text: entry.text } : {}), files: new Set([file]), storedBytes: entry.bytes }
      }
      if (previousRecord) plannedStoredTotal -= previousRecord.storedBytes
      plannedStoredTotal += record.storedBytes
      items.push(item); records.set(chat.id, record)
    }
    const index: ChatIndex = {
      format: FORMAT,
      version: VERSION,
      revision: before.snapshot.revision + 1,
      currentChat: prepared.currentChat,
      items,
    }
    // The private index is compact so the 20,000-chat bound remains real even
    // with authenticated delta-head metadata.
    const text = `${JSON.stringify(index)}\n`
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

    // Keep every immutable record reachable from either complete atomic index.
    // A crash during cleanup can therefore remove only already-unreferenced data.
    if (!before.recovered && before.index) {
      const keep = new Set<string>()
      for (const saved of records.values()) for (const file of saved.files) keep.add(file)
      for (const saved of before.records.values()) for (const file of saved.files) keep.add(file)
      try {
        for (const name of readdirSync(itemsRoot)) {
          if (!ITEM_FILE.test(name) || keep.has(name)) continue
          const path = itemPath(name), stat = lstatSync(path)
          if (stat.isFile() && !stat.isSymbolicLink()) rmSync(path)
        }
      } catch { /* cleanup cannot turn a verified save into a reported failure */ }
    }
    return { snapshot: verified, index, recovered: false, records }
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
    previewRecovery(document: ChatRecoveryDocument): ChatRecoveryImportPlan {
      let before: Loaded
      let repair = false, storageProblem = ''
      try {
        before = load(); cached = before
      } catch (error) {
        repair = true; cached = null; storageProblem = (error as Error).message
        before = { index: null, recovered: false, records: new Map(), snapshot: { initialized: false, revision: 0, chats: [], currentChat: '' } }
      }
      const merge = mergeChatRecovery(before.snapshot.chats, before.snapshot.currentChat, before.snapshot.initialized, document)
      const prepared = prepare(merge.chats, merge.currentChat)
      return {
        prepared,
        merge,
        repair,
        expectedInitialized: before.snapshot.initialized,
        expectedRevision: before.snapshot.revision,
        storageToken: storageToken(),
        ...(storageProblem ? { storageProblem } : {}),
      }
    },
    importRecovery(plan: ChatRecoveryImportPlan): ChatStoreSnapshot {
      if (storageToken() !== plan.storageToken) throw Error('Conversation storage changed while the recovery import was being reviewed. Nothing was imported; review it again.')
      if (!plan.repair) {
        const before = load()
        if (before.snapshot.initialized !== plan.expectedInitialized || before.snapshot.revision !== plan.expectedRevision) {
          throw Error('Conversation storage changed while the recovery import was being reviewed. Nothing was imported; review it again.')
        }
        cached = commit(plan.prepared, before)
        return cached.snapshot
      }

      let becameReadable = false
      try { load(); becameReadable = true } catch { /* the reviewed repair path remains necessary */ }
      if (becameReadable) throw Error('Conversation storage became readable while the recovery import was being reviewed. Nothing was imported; review it again.')
      const moved = quarantineIndexes()
      const before: Loaded = { index: null, recovered: false, records: new Map(), snapshot: { initialized: false, revision: 0, chats: [], currentChat: '' } }
      try {
        cached = commit(plan.prepared, before)
        return cached.snapshot
      } catch (error) {
        cached = null
        try { restoreQuarantinedIndexes(moved) }
        catch { throw Error(`Recovery import failed and the previous index names could not be restored automatically. Their exact copies remain in the recovery folder. ${(error as Error).message}`) }
        throw Error(`${(error as Error).message} The previous damaged indexes were restored; nothing was imported.`)
      }
    },
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
