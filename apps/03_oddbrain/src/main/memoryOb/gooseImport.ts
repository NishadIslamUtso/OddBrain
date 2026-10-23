/**
 * Goose-history import — the one-time migration that must run BEFORE the addon
 * switches Goose's stock memory off.
 *
 * Goose becomes a labelled raw-evidence source and nothing more: every
 * imported message keeps `origin: 'import'`, so the adapter and the app show
 * it as "Imported raw unconfirmed evidence" — never confirmed memory. This
 * code NEVER writes anything inside the Goose directories; they are read-only
 * sources. Everything written goes into the owner's brain folder through the
 * same store writers the app uses (chat store + Memory_OB catalogue).
 *
 * Sources (Goose v1.55 storage, verified against Goose source):
 *  - `<data>/sessions/sessions.db`      — SQLite: sessions + messages
 *  - `<data>/sessions/*.jsonl`          — legacy sessions (metadata line, then messages)
 *  - `<config>/memory/*.txt`            — stock global memory (one file per category)
 *  - `<working_dir>/.goose/memory/*.txt` — stock local memory for each session's working dir
 * Chat Recall is Goose's own search over these same sessions; importing the
 * sessions imports its memory. Nothing else is invented.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'
import type { Chat, Message } from '../../shared/types'
import { createChatStore } from '../chats/store'
import { createMemoryObStore } from './store'

const sha = (value: string): string => createHash('sha256').update(value).digest('hex')
const atIso = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value > 1e12 ? value : value * 1000).toISOString()
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString()
  return new Date().toISOString()
}

export type GooseImportOptions = {
  brainRoot: string
  gooseData: string
  gooseConfig: string
  apply: boolean
}

export type GooseImportReport = {
  ok: boolean
  preview: boolean
  goose: { data: string; config: string }
  found: { sessions: number; messages: number; toolTraffic: number; legacySessions: number; memoryFiles: number; memoryLines: number; memoryCategories: string[] }
  written: { chats: number; messages: number; memoryCopies: string[]; skipped: string[] }
  warnings: string[]
}

type GooseMessage = { id: string; role: string; content: string; at: string }

const textOfContent = (content: unknown): { text: string; toolOnly: boolean } => {
  if (typeof content === 'string') return { text: content, toolOnly: false }
  if (!Array.isArray(content)) return { text: '', toolOnly: false }
  const texts: string[] = []
  let sawText = false, sawTool = false
  for (const block of content) {
    if (block && typeof block === 'object') {
      const type = String((block as { type?: unknown }).type || '')
      if (type === 'text' && typeof (block as { text?: unknown }).text === 'string') { sawText = true; texts.push((block as { text: string }).text) }
      else if (type) sawTool = true
    } else if (typeof block === 'string') { sawText = true; texts.push(block) }
  }
  return { text: texts.join('\n\n'), toolOnly: !sawText && sawTool }
}

export function importGooseHistory(options: GooseImportOptions): GooseImportReport {
  const brainRoot = resolve(options.brainRoot)
  const gooseData = resolve(options.gooseData)
  const gooseConfig = resolve(options.gooseConfig)
  const warnings: string[] = []
  const report: GooseImportReport = {
    ok: false, preview: !options.apply,
    goose: { data: gooseData, config: gooseConfig },
    found: { sessions: 0, messages: 0, toolTraffic: 0, legacySessions: 0, memoryFiles: 0, memoryLines: 0, memoryCategories: [] },
    written: { chats: 0, messages: 0, memoryCopies: [], skipped: [] },
    warnings,
  }
  if (brainRoot === gooseData || brainRoot.startsWith(gooseData + '/') || gooseData.startsWith(brainRoot + '/')) {
    throw Error('The brain folder and the Goose folder must be different folders. Nothing was read or written.')
  }

  const chats: Chat[] = []
  const memoryBuckets = new Map<string, MemoryBucket>()
  const chatIdFor = (source: string): string => `goose-${sha(source).slice(0, 16)}`
  const addChat = (id: string, title: string, date: string, messages: GooseMessage[]): void => {
    if (!messages.length) return
    chats.push({
      id, title: title || 'Imported Goose session', date, projectId: null, lifecycle: 'active',
      messages: messages.map((message, index) => ({
        id: message.id || `m${index + 1}`, role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content, at: message.at,
        origin: 'import',
      })) as Message[],
    } as Chat)
  }

  // ---------- sessions.db ----------
  const dbPath = join(gooseData, 'sessions', 'sessions.db')
  if (existsSync(dbPath)) {
    try {
      // node:sqlite ships with Node 22.5+/24 (the owner's runtime). Read-only:
      // the migration source is never changed.
      const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => any }
      const db = new DatabaseSync(dbPath, { readOnly: true })
      try {
        const sessions = db.prepare('SELECT id, name, description, working_dir, created_at, updated_at, archived_at FROM sessions').all() as Array<Record<string, unknown>>
        for (const session of sessions) {
          const rows = db.prepare('SELECT message_id, role, content_json, created_timestamp FROM messages WHERE session_id = ? ORDER BY id').all(String(session.id)) as Array<Record<string, unknown>>
          const messages: GooseMessage[] = []
          for (const row of rows) {
            let content: unknown = []
            try { content = JSON.parse(String(row.content_json || '[]')) } catch { content = String(row.content_json || '') }
            const { text, toolOnly } = textOfContent(content)
            if (toolOnly) { report.found.toolTraffic += 1; continue }
            if (!text.trim()) continue
            messages.push({ id: String(row.message_id || `m${messages.length + 1}`), role: String(row.role || 'user'), content: text, at: atIso(row.created_timestamp) })
          }
          report.found.sessions += 1
          addChat(chatIdFor(`session:${session.id}`), String(session.name || session.description || 'Imported Goose session'), atIso(session.created_at), messages)
          report.found.messages += messages.length
          // Local stock memory inside this session's working dir.
          const working = typeof session.working_dir === 'string' && session.working_dir ? resolve(session.working_dir) : ''
          if (working) collectMemory(join(working, '.goose', 'memory'), `working-dir ${basename(working)}`, report, warnings, memoryBuckets)
        }
      } finally { db.close() }
    } catch (error) {
      warnings.push(`sessions.db could not be read (${(error as Error).message}). Its history was not imported; legacy .jsonl files still are.`)
    }
  }

  // ---------- legacy sessions/*.jsonl ----------
  const sessionsDir = join(gooseData, 'sessions')
  if (existsSync(sessionsDir)) {
    const { readdirSync } = createRequire(import.meta.url)('node:fs') as typeof import('node:fs')
    for (const name of readdirSync(sessionsDir)) {
      if (!name.endsWith('.jsonl')) continue
      try {
        const lines = readFileSync(join(sessionsDir, name), 'utf8').split('\n').filter(line => line.trim())
        const messages: GooseMessage[] = []
        let title = name.replace(/\.jsonl$/, '')
        for (const line of lines) {
          let row: Record<string, unknown>
          try { row = JSON.parse(line) as Record<string, unknown> } catch { continue }
          if (typeof row.role !== 'string') continue // the metadata line
          if (row.name && !title) title = String(row.name)
          const { text, toolOnly } = textOfContent(row.content)
          if (toolOnly) { report.found.toolTraffic += 1; continue }
          if (!text.trim()) continue
          messages.push({ id: String(row.id || `m${messages.length + 1}`), role: row.role, content: text, at: atIso(row.created || row.timestamp) })
        }
        report.found.legacySessions += 1
        addChat(chatIdFor(`legacy:${name}`), `Imported Goose session · ${title}`, new Date().toISOString().slice(0, 10), messages)
        report.found.messages += messages.length
      } catch (error) {
        warnings.push(`Legacy session ${name} could not be read (${(error as Error).message}); it was left untouched.`)
      }
    }
  }

  // ---------- stock memory files ----------
  collectMemory(join(gooseConfig, 'memory'), 'global memory', report, warnings, memoryBuckets)
  for (const [key, bucket] of memoryBuckets) {
    const id = chatIdFor(`memory:${key}`)
    addChat(id, `Goose memory · ${bucket.label}`, new Date().toISOString().slice(0, 10), [{ id: 'm1', role: 'user', content: bucket.text, at: bucket.at }])
    report.found.memoryFiles += 1
  }

  // ---------- write (only into the brain) ----------
  if (!options.apply) return report
  mkdirSync(join(brainRoot, 'chats'), { recursive: true })
  mkdirSync(join(brainRoot, 'store'), { recursive: true })

  // Byte-preserving copies of stock memory categories live in the brain's
  // source area: the original words, kept as evidence.
  const memoryCopyRoot = join(brainRoot, '02 Sources', 'Conversations', 'Goose Memory')
  for (const bucket of memoryBuckets.values()) {
    const target = join(memoryCopyRoot, bucket.file)
    if (existsSync(target)) continue
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, bucket.raw, { encoding: 'utf8', flag: 'wx' })
    report.written.memoryCopies.push(target)
  }

  const chatStore = createChatStore(join(brainRoot, 'chats'))
  const snapshot = chatStore.read()
  const existing = new Map(snapshot.chats.map(chat => [chat.id, chat]))
  const upserts: Record<string, Chat> = {}
  for (const chat of chats) {
    const previous = existing.get(chat.id)
    if (previous && previous.messages.length === chat.messages.length) { report.written.skipped.push(chat.id); continue }
    upserts[chat.id] = chat
    report.written.chats += 1
    report.written.messages += chat.messages.length
  }
  let after = snapshot
  if (!snapshot.initialized) {
    // A never-used conversation store: migrate() is its guarded initializer —
    // it refuses to touch a store that already holds the owner's chats, so
    // nothing can be replaced here. After that, merges use write().
    if (snapshot.chats.length) throw Error('Conversation storage is unreadable. Nothing was written.')
    const initial = chats
    after = chatStore.migrate({ chats: initial, currentChat: initial[0]?.id ?? '', rawChats: JSON.stringify(initial), rawCurrentChat: JSON.stringify(initial[0]?.id ?? '') }).snapshot
  } else {
    const order = [...snapshot.chats.map(chat => chat.id), ...chats.map(chat => chat.id).filter(id => !existing.has(id))]
    if (Object.keys(upserts).length) after = chatStore.write({ order, upserts, currentChat: snapshot.currentChat, expectedRevision: snapshot.revision })
  }
  createMemoryObStore(join(brainRoot, 'store')).syncChats(after.chats, after.revision)
  report.ok = true
  return report
}

type MemoryBucket = { label: string; file: string; text: string; raw: string; at: string }

function collectMemory(dir: string, label: string, report: GooseImportReport, warnings: string[], buckets: Map<string, MemoryBucket>): void {
  if (!existsSync(dir)) return
  const { readdirSync } = createRequire(import.meta.url)('node:fs') as typeof import('node:fs')
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.txt')) continue
    try {
      const raw = readFileSync(join(dir, name), 'utf8')
      const key = `${label}:${name}`
      const lines = raw.split('\n').filter(line => line.trim())
      report.found.memoryLines += lines.length
      report.found.memoryCategories.push(`${label}/${name.replace(/\.txt$/, '')}`)
      buckets.set(key, { label: `${label} · ${name.replace(/\.txt$/, '')}`, file: name, text: raw.trim(), raw, at: new Date().toISOString() })
    } catch (error) {
      warnings.push(`Memory file ${join(dir, name)} could not be read (${(error as Error).message}); the original was left untouched.`)
    }
  }
}
