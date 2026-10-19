import { toPosix } from '../vault/files'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, lstatSync, realpathSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * The artifact library on disk.
 *
 * An artifact that only exists inside the conversation that produced it is one
 * scroll away from being lost. This module is the record: every artifact the app
 * makes (or the person imports) is a folder of version files plus one row in an
 * index, and the Artifacts screen is a view over it.
 *
 * Three rules, each one taken from a decision already made elsewhere in the app:
 *
 *   1. **History is append-only.** A new version is a new file, `v1`, `v2`, ….
 *      Restoring an old version appends it back rather than deleting anything —
 *      exactly the rule `artifactEdits.ts` already follows in the renderer.
 *   2. **Nothing is half-written.** The index is written beside itself and
 *      renamed over the old file, so a crash cannot leave it truncated.
 *   3. **Nothing is destroyed.** Deleting moves the folder into `.trash/`, and
 *      the answer says where it went rather than claiming a deletion happened.
 *
 * A damaged index is not a lost library: the version files are the truth, and
 * the index is rebuilt from the folders when it cannot be read.
 */

export type ArtifactKind = 'html' | 'svg'

export type StoredVersion = {
  /** A file name inside the artifact's own folder, e.g. `v2.html`. */
  file: string
  savedAt: string
  /** Why this version exists, when a person or the app gave a reason. */
  note?: string
}

export type ArtifactRecord = {
  id: string
  title: string
  type: ArtifactKind
  createdAt: string
  updatedAt: string
  chatId?: string
  messageId?: string
  /** `chat` for one the model wrote, `import` for one brought in from a file. */
  origin: 'chat' | 'import'
  /** Index of the version being shown. 0-based, into `versions`. */
  current: number
  versions: StoredVersion[]
}

/** A record without its version history: what a grid of cards needs, nothing more. */
export type ArtifactSummary = Omit<ArtifactRecord, 'versions'> & {
  versionCount: number
  /** Size of the current version, in bytes. */
  bytes: number
}

export type ListAnswer =
  | { ok: true; items: ArtifactSummary[]; where: string }
  | { ok: false; error: string }

export type ReadAnswer =
  | { ok: true; item: ArtifactSummary; content: string; version: number }
  | { ok: false; error: string }

export type ItemAnswer = { ok: true; item: ArtifactSummary; unchanged?: boolean } | { ok: false; error: string }

export type RemoveAnswer = { ok: true; movedTo: string } | { ok: false; error: string }

export type SaveInput = {
  id?: string
  title?: string
  type?: ArtifactKind
  content: string
  chatId?: string
  messageId?: string
  origin?: 'chat' | 'import'
  note?: string
  /** Update the title of an existing artifact. Off by default, so a mirror of a
   *  chat cannot silently undo a rename the person made here. */
  retitle?: boolean
}

export type AdoptInput = {
  id: string
  title: string
  type: ArtifactKind
  content: string
  createdAt?: string
  updatedAt?: string
  chatId?: string
  messageId?: string
}

const INDEX_FILE = 'index.json'
const ITEMS_DIR = 'items'
const TRASH_DIR = '.trash'
/** Ids this app makes. Anything else is refused rather than turned into a path. */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const VERSION_FILE_PATTERN = /^v(\d+)\.(html|svg)$/
const MAX_CONTENT_BYTES = 4_000_000
const MAX_VERSIONS = 200
const MAX_TITLE = 120

type Index = { version: 1; items: ArtifactRecord[] }

const nowIso = (): string => new Date().toISOString()

function itemDir(root: string, id: string): string {
  return join(root, ITEMS_DIR, id)
}

function indexFile(root: string): string {
  return join(root, INDEX_FILE)
}

/** Refuse anything that could walk out of the library folder. */
export function validId(id: unknown): id is string {
  return typeof id === 'string' && ID_PATTERN.test(id)
}

function cleanTitle(value: unknown, fallback: string): string {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  return (text || fallback).slice(0, MAX_TITLE)
}

function isKind(value: unknown): value is ArtifactKind {
  return value === 'html' || value === 'svg'
}

function isoOr(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback
}

/**
 * A timestamp that is always newer than everything already in the library.
 *
 * Time can stand still — two writes inside one millisecond carry the same ISO
 * stamp — but order cannot: the screen says "newest first", and two documents
 * written in the same breath would then swap places depending on how the sort
 * happened to fall. So a stamp that is not strictly newer is moved forward a
 * hair. The dates people see are unaffected; the order is total.
 */
function nextStamp(items: ArtifactRecord[]): string {
  const now = Date.now()
  const newest = items.reduce((latest, item) => Math.max(latest, Date.parse(item.updatedAt) || 0), 0)
  return new Date(Math.max(now, newest + 1)).toISOString()
}

/** One record, validated field by field. Returns null for anything malformed. */
function normalizeRecord(raw: unknown): ArtifactRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Partial<ArtifactRecord>
  if (!validId(value.id)) return null
  if (!isKind(value.type)) return null

  const versions: StoredVersion[] = []
  for (const entry of Array.isArray(value.versions) ? value.versions : []) {
    const candidate = entry as Partial<StoredVersion>
    if (typeof candidate?.file !== 'string' || !VERSION_FILE_PATTERN.test(candidate.file)) continue
    versions.push({
      file: candidate.file,
      savedAt: isoOr(candidate.savedAt, nowIso()),
      ...(typeof candidate.note === 'string' && candidate.note ? { note: candidate.note.slice(0, 300) } : {}),
    })
  }
  // A record whose files all failed validation is not a record.
  if (!versions.length) return null

  const current = Number.isInteger(value.current) ? Math.min(Math.max(value.current as number, 0), versions.length - 1) : versions.length - 1
  const createdAt = isoOr(value.createdAt, nowIso())
  const record: ArtifactRecord = {
    id: value.id,
    title: cleanTitle(value.title, value.id),
    type: value.type,
    createdAt,
    updatedAt: isoOr(value.updatedAt, createdAt),
    origin: value.origin === 'import' ? 'import' : 'chat',
    current,
    versions,
  }
  if (typeof value.chatId === 'string' && value.chatId) record.chatId = value.chatId.slice(0, 64)
  if (typeof value.messageId === 'string') record.messageId = value.messageId.slice(0, 64)
  return record
}

/**
 * Rebuild a record's metadata from the files that are actually on disk.
 *
 * This is the recovery path: if the index cannot say what an artifact is, the
 * version files still can. The title becomes the id, because inventing one would
 * be worse than admitting we no longer know it.
 */
function recoverRecord(root: string, id: string, indexedFiles?: Set<string>): ArtifactRecord | null {
  if (!validId(id)) return null
  const folder = itemDir(root, id)
  let names: string[]
  try {
    // Recovery imports real library files only, never linked trees.
    if (lstatSync(join(root, ITEMS_DIR)).isSymbolicLink()) return null
    const info = lstatSync(folder)
    if (info.isSymbolicLink() || !info.isDirectory()) return null
    names = readdirSync(folder)
  } catch {
    return null
  }
  const versions: StoredVersion[] = []
  let type: ArtifactKind = 'html'
  for (const name of names.sort((a, b) => Number(a.slice(1).split('.')[0]) - Number(b.slice(1).split('.')[0]))) {
    const match = VERSION_FILE_PATTERN.exec(name)
    if (!match || indexedFiles?.has(name)) continue
    try {
      const stats = lstatSync(join(folder, name))
      if (!stats.isFile() || stats.isSymbolicLink()) continue
      versions.push({ file: name, savedAt: stats.mtime.toISOString() })
      type = match[2] === 'svg' ? 'svg' : 'html'
    } catch {
      // One disappearing/unreadable file must not hide the rest of the library.
    }
  }
  if (!versions.length) return null
  const first = Date.parse(versions[0].savedAt)
  const last = Date.parse(versions[versions.length - 1].savedAt)
  return {
    id,
    title: id,
    type,
    createdAt: new Date(first).toISOString(),
    updatedAt: new Date(last).toISOString(),
    origin: 'chat',
    current: versions.length - 1,
    versions,
  }
}

function readIndex(root: string): { index: Index; recovered: boolean } {
  let raw = ''
  let broken = false
  try {
    raw = readFileSync(indexFile(root), 'utf8')
  } catch {
    // No index at all. The folders are still the truth.
    broken = existsSync(join(root, ITEMS_DIR))
  }

  let parsed: unknown = null
  if (raw) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      broken = true
    }
  }

  const items: ArtifactRecord[] = []
  if (!broken && parsed && typeof parsed === 'object') {
    const rows = (parsed as { items?: unknown }).items
    if (Array.isArray(rows)) {
      const identities = new Set<string>()
      for (const row of rows) {
        const record = normalizeRecord(row)
        // A row that fails validation is dropped and the library is marked as
        // recovered: silently keeping a malformed row would hand the screen a
        // card it cannot open.
        if (record && !identities.has(record.id)) {
          items.push(record)
          identities.add(record.id)
        } else broken = true
      }
    } else {
      broken = true
    }
  }

  // Reconcile existing records as well as unknown folders: a crash between
  // writing a version and updating the index must not hide that version forever.
  const known = new Map(items.map(item => [item.id, item]))
  try {
    for (const name of readdirSync(join(root, ITEMS_DIR))) {
      const record = known.get(name)
      // Known versions need no extra stat calls on every read/list operation.
      const recovered = recoverRecord(root, name, record && new Set(record.versions.map(version => version.file)))
      if (!recovered) continue
      if (!record) {
        items.push(recovered)
        known.set(name, recovered)
        broken = true
        continue
      }
      const files = new Set(record.versions.map(version => version.file))
      for (const version of recovered.versions) {
        if (files.has(version.file)) continue
        // Append, rather than sort: public version numbers are array positions.
        // Preserve title, notes, provenance, and the explicitly selected version.
        record.versions.push(version)
        files.add(version.file)
        broken = true
      }
    }
  } catch {
    // No readable items folder: keep any valid indexed records available.
  }

  if (broken && items.length) {
    // The rebuild is itself a repair, so it is written back — the next launch
    // reads an index that matches the disk.
    const index = { version: 1 as const, items }
    try {
      writeIndex(root, index)
    } catch {
      // A read-only folder still gets a working session; it just stays recovered
      // every time, which is honest.
    }
    return { index, recovered: true }
  }

  return { index: { version: 1, items }, recovered: broken }
}

function writeIndex(root: string, index: Index): void {
  mkdirSync(root, { recursive: true })
  const file = indexFile(root)
  const temporary = `${file}.tmp`
  writeFileSync(temporary, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
  renameSync(temporary, file)
}

function versionPath(root: string, record: ArtifactRecord, version: number): string {
  return join(itemDir(root, record.id), record.versions[version].file)
}

function sizeOf(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

function summarize(root: string, record: ArtifactRecord): ArtifactSummary {
  const { versions, ...rest } = record
  const bytes = versions[record.current]
    ? sizeOf(join(itemDir(root, record.id), versions[record.current].file))
    : 0
  return { ...rest, versionCount: versions.length, bytes }
}

/** Everything in the library, newest first, without any document content. */
export function list(root: string): ListAnswer {
  const { index } = readIndex(root)
  const items = index.items
    .map(record => summarize(root, record))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  // `where` is the folder itself, so the screen can say where the files are
  // instead of leaving a person to guess.
  return { ok: true, items, where: root }
}

/** One artifact's document. `version` is 1-based, as it is shown to people. */
export function read(root: string, id: unknown, version?: unknown): ReadAnswer {
  if (!validId(id)) return { ok: false, error: 'That is not an id this app made.' }
  const { index } = readIndex(root)
  const record = index.items.find(item => item.id === id)
  if (!record) return { ok: false, error: 'That artifact is not in the library any more.' }
  const wanted = Number.isInteger(version) ? Math.min(Math.max((version as number) - 1, 0), record.versions.length - 1) : record.current
  try {
    const content = readFileSync(versionPath(root, record, wanted), 'utf8')
    return { ok: true, item: summarize(root, record), content, version: wanted + 1 }
  } catch {
    return { ok: false, error: `Version ${wanted + 1} of that artifact could not be read from disk.` }
  }
}

function writeVersion(root: string, record: ArtifactRecord, content: string, savedAt: string, note?: string): void {
  const folder = itemDir(root, record.id)
  mkdirSync(folder, { recursive: true })
  // A repaired index may contain gaps, and a crash can leave an unindexed
  // version on disk. History is append-only: neither may be overwritten.
  let next = 1
  for (const name of [...record.versions.map(version => version.file), ...readdirSync(folder)]) {
    const match = VERSION_FILE_PATTERN.exec(name)
    if (match) next = Math.max(next, Number(match[1]) + 1)
  }
  let file: string
  for (;;) {
    if (!Number.isSafeInteger(next)) throw Error('Artifact version number is outside the supported range.')
    file = `v${next}.${record.type}`
    try {
      writeFileSync(join(folder, file), content, { encoding: 'utf8', flag: 'wx' })
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      next++
    }
  }
  record.versions.push({ file, savedAt, ...(note ? { note: note.slice(0, 300) } : {}) })
  record.current = record.versions.length - 1
}

/**
 * Create an artifact, or append a version to an existing one.
 *
 * Saving identical content is not a change: it reports `unchanged` instead of
 * filling the history with versions that say nothing.
 */
export function save(root: string, input: SaveInput): ItemAnswer {
  if (!input || typeof input !== 'object' || typeof input.content !== 'string' || !input.content.trim()) {
    return { ok: false, error: 'There is nothing to save: the artifact is empty.' }
  }
  const bytes = Buffer.byteLength(input.content, 'utf8')
  if (bytes > MAX_CONTENT_BYTES) {
    return { ok: false, error: `That document is ${Math.round(bytes / 1_000_000)} MB, past the 4 MB a version may hold.` }
  }

  const { index } = readIndex(root)
  const at = nextStamp(index.items)
  const existing = validId(input.id) ? index.items.find(item => item.id === input.id) : undefined

  if (existing) {
    const currentFile = versionPath(root, existing, existing.current)
    let current = ''
    try {
      current = readFileSync(currentFile, 'utf8')
    } catch {
      current = ''
    }
    if (current === input.content) {
      return { ok: true, item: summarize(root, existing), unchanged: true }
    }
    if (existing.versions.length >= MAX_VERSIONS) {
      return { ok: false, error: `That artifact has ${MAX_VERSIONS} saved versions. Duplicate it to carry on from here.` }
    }
    writeVersion(root, existing, input.content, at, input.note)
    existing.updatedAt = at
    if (input.retitle && input.title) existing.title = cleanTitle(input.title, existing.title)
    writeIndex(root, index)
    return { ok: true, item: summarize(root, existing) }
  }

  // The id is the artifact's own; one from a chat is reused so a mirror of the
  // same artifact can never produce a second row.
  const id = validId(input.id) ? (input.id as string) : `art${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  if (index.items.some(item => item.id === id)) {
    return { ok: false, error: 'An artifact with that id already exists.' }
  }
  const record: ArtifactRecord = {
    id,
    title: cleanTitle(input.title, 'Untitled artifact'),
    type: isKind(input.type) ? input.type : 'html',
    createdAt: at,
    updatedAt: at,
    origin: input.origin === 'import' ? 'import' : 'chat',
    current: 0,
    versions: [],
  }
  if (typeof input.chatId === 'string' && input.chatId) record.chatId = input.chatId.slice(0, 64)
  if (typeof input.messageId === 'string' && input.messageId) record.messageId = input.messageId.slice(0, 64)
  writeVersion(root, record, input.content, at, input.note)
  index.items.push(record)
  writeIndex(root, index)
  return { ok: true, item: summarize(root, record) }
}

/** Append the version currently being viewed, so "restore" is also a change. */
export function restore(root: string, id: unknown, version: unknown): ItemAnswer {
  const found = read(root, id, version)
  if (!found.ok) return found
  return save(root, {
    id: found.item.id,
    content: found.content,
    note: `Restored from version ${found.version}`,
  })
}

export function rename(root: string, id: unknown, title: unknown): ItemAnswer {
  if (!validId(id)) return { ok: false, error: 'That is not an id this app made.' }
  const clean = typeof title === 'string' ? title.trim() : ''
  if (!clean) return { ok: false, error: 'A title cannot be empty.' }
  const { index } = readIndex(root)
  const record = index.items.find(item => item.id === id)
  if (!record) return { ok: false, error: 'That artifact is not in the library any more.' }
  record.title = cleanTitle(clean, record.title)
  record.updatedAt = nextStamp(index.items)
  writeIndex(root, index)
  return { ok: true, item: summarize(root, record) }
}

export function duplicate(root: string, id: unknown): ItemAnswer {
  const found = read(root, id)
  if (!found.ok) return found
  return save(root, {
    title: `${found.item.title} copy`,
    type: found.item.type,
    content: found.content,
    origin: found.item.origin,
    note: `Copied from ${found.item.title}`,
  })
}

/**
 * Take an artifact out of the library — by moving its folder, never by deleting
 * it. `movedTo` is reported so the interface can say where it went.
 */
export function remove(root: string, id: unknown): RemoveAnswer {
  if (!validId(id)) return { ok: false, error: 'That is not an id this app made.' }
  const { index } = readIndex(root)
  const record = index.items.find(item => item.id === id)
  if (!record) return { ok: false, error: 'That artifact is not in the library any more.' }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  // The key says where the files went, so it speaks the vault's dialect.
  const destination = toPosix(join(TRASH_DIR, `${id}-${stamp}`))
  try {
    mkdirSync(join(root, TRASH_DIR), { recursive: true })
    writeFileSync(join(itemDir(root, id), '.oddbrain-trash.json'), JSON.stringify(record), 'utf8')
    renameSync(itemDir(root, id), join(root, destination))
  } catch (error) {
    return { ok: false, error: `The files could not be moved aside: ${(error as Error).message}` }
  }
  index.items = index.items.filter(item => item.id !== id)
  writeIndex(root, index)
  return { ok: true, movedTo: destination }
}

/**
 * Bring artifacts found in existing conversations into the library.
 *
 * This is how the library starts non-empty for someone who has been using the
 * app: the artifacts are already in their chats, so they are written in once.
 * Running it again does nothing — adoption is by id, and an id that exists is
 * left exactly as it is.
 */
export function adopt(root: string, records: unknown): { ok: true; adopted: number; skipped: number; refused: number } {
  const { index } = readIndex(root)
  const known = new Set([...index.items.map(item => item.id), ...listTrash(root).items.map(item => item.originalId)])
  let adopted = 0
  let skipped = 0
  let refused = 0
  let touched = false

  for (const raw of Array.isArray(records) ? records : []) {
    const row = raw as Partial<AdoptInput>
    if (!validId(row?.id) || !isKind(row?.type) || typeof row.content !== 'string' || !row.content.trim()) {
      refused += 1
      continue
    }
    if (known.has(row.id)) {
      skipped += 1
      continue
    }
    if (Buffer.byteLength(row.content, 'utf8') > MAX_CONTENT_BYTES) {
      refused += 1
      continue
    }
    const createdAt = isoOr(row.createdAt, nowIso())
    const record: ArtifactRecord = {
      id: row.id,
      title: cleanTitle(row.title, 'Untitled artifact'),
      type: row.type,
      createdAt,
      updatedAt: isoOr(row.updatedAt, createdAt),
      origin: 'chat',
      current: 0,
      versions: [],
    }
    if (typeof row.chatId === 'string' && row.chatId) record.chatId = row.chatId.slice(0, 64)
    if (typeof row.messageId === 'string' && row.messageId) record.messageId = row.messageId.slice(0, 64)
    try {
      writeVersion(root, record, row.content, record.createdAt)
      index.items.push(record)
      known.add(record.id)
      adopted += 1
      touched = true
    } catch {
      refused += 1
    }
  }

  if (touched) writeIndex(root, index)
  return { ok: true, adopted, skipped, refused }
}

/** Where a folder that was taken out of the library goes. Shown, not hidden. */
export function trashDir(root: string): string {
  return join(root, TRASH_DIR)
}

/** The library folder itself — created on first write, never before. */
export function ensureRoot(root: string): void {
  mkdirSync(root, { recursive: true })
}

/** Only used by tests and repair scripts: drop the folder entirely. */
export function discardAll(root: string): void {
  rmSync(root, { recursive: true, force: true })
}


export type TrashItem = { key: string; originalId: string; title: string; type: ArtifactKind; removedAt: string; versionCount: number; recoveredMetadata: boolean }
const TRASH_KEY = /^[A-Za-z0-9_-]{1,180}$/
function checkedTrashFolder(root: string, key: unknown): string {
  if (typeof key !== 'string' || !TRASH_KEY.test(key)) throw Error('That is not a trash entry.')
  const base = join(root, TRASH_DIR), full = join(base, key)
  if (lstatSync(base).isSymbolicLink() || lstatSync(full).isSymbolicLink() || !lstatSync(full).isDirectory()) throw Error('Trash links are not followed.')
  if (!realpathSync(full).startsWith(realpathSync(base) + sep)) throw Error('The trash entry is outside the library.')
  return full
}
function trashRecord(folder: string, key: string): { record: ArtifactRecord; recovered: boolean } {
  let record: ArtifactRecord | null = null
  try { if (!lstatSync(join(folder, '.oddbrain-trash.json')).isSymbolicLink()) record = normalizeRecord(JSON.parse(readFileSync(join(folder, '.oddbrain-trash.json'), 'utf8'))) } catch {}
  let recovered = false
  if (!record) {
    recovered = true
    const files = readdirSync(folder).filter(f => VERSION_FILE_PATTERN.test(f)).sort((a, b) => Number(a.slice(1).split('.')[0]) - Number(b.slice(1).split('.')[0]))
    const id = /^(.*)-\d{4}-\d\d-\d\dT/.exec(key)?.[1] || ''
    if (!files.length || !validId(id)) throw Error('The old trash metadata could not be recovered.')
    const versions = files.map(file => ({ file, savedAt: statSync(join(folder, file)).mtime.toISOString() }))
    record = { id, title: id, type: files.at(-1)!.endsWith('.svg') ? 'svg' : 'html', createdAt: versions[0].savedAt, updatedAt: versions.at(-1)!.savedAt, origin: 'import', current: versions.length - 1, versions }
  }
  for (const version of record.versions) {
    const file = join(folder, version.file), info = lstatSync(file)
    if (!info.isFile() || info.isSymbolicLink() || !realpathSync(file).startsWith(realpathSync(folder) + sep)) throw Error('A trash version is not a real file inside its entry.')
  }
  return { record, recovered }
}
export function listTrash(root: string): { ok: boolean; items: TrashItem[]; error?: string } {
  const items: TrashItem[] = []
  if (!existsSync(join(root, TRASH_DIR))) return { ok: true, items }
  try {
    if (lstatSync(join(root, TRASH_DIR)).isSymbolicLink()) throw Error('Trash links are not followed.')
    for (const key of readdirSync(join(root, TRASH_DIR))) try {
      const folder = checkedTrashFolder(root, key), { record, recovered } = trashRecord(folder, key)
      items.push({ key, originalId: record.id, title: record.title, type: record.type, removedAt: statSync(folder).mtime.toISOString(), versionCount: record.versions.length, recoveredMetadata: recovered })
    } catch { /* Malformed/symlink entries never become usable paths. */ }
    items.sort((a, b) => b.removedAt.localeCompare(a.removedAt))
    return { ok: true, items }
  } catch { return { ok: false, items, error: 'The trash folder could not be read.' } }
}
export function restoreTrash(root: string, key: unknown): ItemAnswer {
  let folder = '', destination = ''
  try {
    folder = checkedTrashFolder(root, key)
    const { record } = trashRecord(folder, String(key)), { index } = readIndex(root)
    // Never overwrite a newer active artifact with the same id.
    if (index.items.some(item => item.id === record.id) || existsSync(itemDir(root, record.id))) record.id = randomUUID()
    record.updatedAt = nextStamp(index.items)
    if (existsSync(join(root, ITEMS_DIR)) && lstatSync(join(root, ITEMS_DIR)).isSymbolicLink()) throw Error('The active library is a symbolic link.')
    destination = itemDir(root, record.id); mkdirSync(join(root, ITEMS_DIR), { recursive: true })
    renameSync(folder, destination)
    index.items.push(record)
    try { writeIndex(root, index) } catch (error) { renameSync(destination, folder); throw error }
    return { ok: true, item: summarize(root, record) }
  } catch (error) { return { ok: false, error: `The artifact could not be recovered: ${(error as Error).message}` } }
}
