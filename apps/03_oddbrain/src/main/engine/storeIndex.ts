/**
 * storeIndex.ts (main) — Mods Phase 2: the pack index client.
 *
 * A store is an index file, not a service: a folder with an `index.json`
 * (a repo checkout, a USB stick) or an https URL answering the same JSON.
 * The index lists packs with a pinned sha-256 of the pack folder's contents;
 * browsing reads the index you added, and an install recomputes the digest
 * from the real files and refuses the copy when one byte differs.
 *
 * A URL entry is installable when the index lists its FILES: each file is
 * downloaded from beside the index, the folder's digest is recomputed and
 * compared with the pinned checksum, and only a byte-identical pack reaches
 * the normal installer. A URL entry without a file list stays listed but not
 * installable — a button that cannot prove what it would fetch is a lying
 * button, and this app does not ship those.
 */
import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { installPackFromFolder, type PackTargets } from './packs'
import { boundedResponse } from '../network/boundedResponse'
import { readRegularFileSync } from '../safeFile'

const MAX_INDEX_BYTES = 2_000_000
const FETCH_TIMEOUT_MS = 10_000
const MAX_FILE_BYTES = 2_000_000
const MAX_PACK_BYTES = 20_000_000
const MAX_FILES = 200

export type IndexEntry = {
  id: string
  name: string
  version: string
  author: string
  description: string
  permissions: Record<string, unknown>
  /** sha-256 over the pack folder, in the form packDigest() writes. */
  checksum: string
  /** Where the pack lives, relative to the index folder (folder indexes). */
  source: string
  /**
   * The pack's every file, relative — present only when the index can name
   * what a downloader must fetch (URL indexes need this to be installable;
   * folder indexes never need it, the disk is the listing).
   */
  files?: string[]
}

export type ReadIndexAnswer =
  | { ok: true; name: string; packs: Array<IndexEntry & { verified: boolean; downloadable?: boolean; problem: string }> }
  | { ok: false; problem: string }

export type IndexSource = { kind: 'folder'; path: string } | { kind: 'url'; url: string }

/**
 * Every regular file under the folder, relative and sorted. Local packs get
 * the same file/byte ceilings as downloaded packs, and links are refused: a
 * checksum must describe bytes physically inside the reviewed pack folder.
 */
function relativeFiles(
  root: string,
  dir = '',
  tally: { files: number; bytes: number; entries: number } = { files: 0, bytes: 0, entries: 0 },
  depth = 0,
): string[] {
  if (depth > 32) throw new Error('The pack folder tree is more than 32 levels deep.')
  const abs = dir ? join(root, dir) : root
  const out: string[] = []
  for (const name of readdirSync(abs).sort()) {
    if (name === '.installed.json') continue
    tally.entries += 1
    if (tally.entries > MAX_FILES * 2) throw new Error('The pack contains too many folders and files.')
    const rel = dir ? `${dir}/${name}` : name
    const info = lstatSync(join(abs, name))
    if (info.isSymbolicLink()) throw new Error(`The pack contains a symbolic link (${rel}); links are not installable.`)
    if (info.isDirectory()) out.push(...relativeFiles(root, rel, tally, depth + 1))
    else if (info.isFile()) {
      tally.files += 1
      tally.bytes += info.size
      if (tally.files > MAX_FILES) throw new Error(`The pack contains more than ${MAX_FILES} files.`)
      if (info.size > MAX_FILE_BYTES) throw new Error(`The pack contains a file larger than ${MAX_FILE_BYTES.toLocaleString()} bytes (${rel}).`)
      if (tally.bytes > MAX_PACK_BYTES) throw new Error(`The pack contains more than ${MAX_PACK_BYTES.toLocaleString()} bytes.`)
      out.push(rel)
    } else throw new Error(`The pack contains an unsupported filesystem entry (${rel}).`)
  }
  return out
}

/**
 * The pack's digest: each file's own sha-256, over the sorted relative
 * paths — so the number is stable across machines and edit-visible.
 */
export function packDigest(folder: string): { digest?: string; problem?: string } {
  if (!existsSync(folder)) return { problem: 'The pack folder is gone.' }
  let files: string[]
  try {
    files = relativeFiles(folder)
  } catch (error) {
    return { problem: error instanceof Error ? error.message : 'The pack folder cannot be read.' }
  }
  if (!files.length) return { problem: 'The pack folder is empty.' }
  try {
    const hash = createHash('sha256')
    for (const rel of files) {
      hash.update(rel)
      hash.update('\n')
      hash.update(createHash('sha256').update(readFileSync(join(folder, rel))).digest('hex'))
      hash.update('\n')
    }
    return { digest: hash.digest('hex') }
  } catch {
    return { problem: 'The pack changed or became unreadable while its checksum was being computed.' }
  }
}

const isHex64 = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)

const cleanText = (value: unknown, cap: number): string =>
  typeof value === 'string' ? value.trim().slice(0, cap) : ''

/** A rule violation inside the entry loop, converted to the index's honest problem. */
class Problem extends Error {}

/** Strict: a bad index is an honest error, never a partial list. */
export function parseIndex(raw: string): { name: string; packs: IndexEntry[] } | { problem: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { problem: 'The index is not valid JSON.' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { problem: 'The index is not an object.' }
  const record = parsed as Record<string, unknown>
  const name = cleanText(record['name'], 80)
  if (!name) return { problem: 'The index needs a name.' }
  const list = record['packs']
  if (!Array.isArray(list)) return { problem: 'The index needs a packs array.' }
  if (list.length > 500) return { problem: 'The index lists more than 500 packs.' }
  const packs: IndexEntry[] = []
  const ids = new Set<string>()
  try {
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { problem: 'A pack entry is not an object.' }
    const entry = item as Record<string, unknown>
    const id = cleanText(entry['id'], 80)
    if (!/^[a-z0-9][a-z0-9.-]{1,78}[a-z0-9]$/.test(id)) return { problem: `A pack entry needs a real id (got "${String(entry['id']).slice(0, 40)}").` }
    if (ids.has(id)) return { problem: `The index lists the pack "${id}" more than once.` }
    ids.add(id)
    const packName = cleanText(entry['name'], 80)
    if (!packName) return { problem: `The pack "${id}" needs a name.` }
    const version = cleanText(entry['version'], 20)
    if (!/^\d+\.\d+\.\d+$/.test(version)) return { problem: `The pack "${id}" needs a version like 1.0.0.` }
    if (!isHex64(entry['checksum'])) return { problem: `The pack "${id}" needs a sha-256 checksum (64 hex characters), an index that cannot prove its packs is not an index this app trusts.` }
    const source = cleanText(entry['source'], 300)
    if (!source) return { problem: `The pack "${id}" needs a source.` }
    const sourceParts = source.split('/')
    if (source.startsWith('/') || source.includes('\\') || source.includes('\0') || sourceParts.some(part => !part || part === '.' || part === '..')) {
      return { problem: `The pack "${id}" names a source outside the index folder.` }
    }
    packs.push({
      id,
      name: packName,
      version,
      author: cleanText(entry['author'], 80) || 'unknown author',
      description: cleanText(entry['description'], 300),
      permissions: entry['permissions'] && typeof entry['permissions'] === 'object' && !Array.isArray(entry['permissions'])
        ? (entry['permissions'] as Record<string, unknown>)
        : {},
      checksum: entry['checksum'],
      source,
      ...(() => {
        try {
          return entry['files'] !== undefined ? { files: cleanFileList(entry['files'], id) } : {}
        } catch (error) {
          throw new Problem(error instanceof Error ? error.message : 'The file list is malformed.')
        }
      })(),
    })
  }
  } catch (error) {
    if (error instanceof Problem) return { problem: error.message }
    throw error
  }
  return { name, packs }
}

/** An optional file list is validated when present: safe relative paths, bounded. */
const cleanFileList = (value: unknown, id: string): string[] => {
  if (!Array.isArray(value)) throw new Error(`The pack "${id}" has a files list that is not a list.`)
  if (value.length > MAX_FILES) throw new Error(`The pack "${id}" lists more than ${MAX_FILES} files.`)
  const seen = new Set<string>()
  return value.map(item => {
    const path = typeof item === 'string' ? item.trim() : ''
    if (!path || path.length > 300 || path.startsWith('/') || path.includes('\\') || path.includes('\0') || path.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new Error(`The pack "${id}" lists a file outside its folder ("${String(item).slice(0, 60)}").`)
    }
    if (seen.has(path)) throw new Error(`The pack "${id}" lists the file "${path}" more than once.`)
    seen.add(path)
    return path
  })
}

/** Fetches any URL to text; injectable so tests serve bytes without a network. */
export type RawLoader = (url: string) => Promise<string>

function safeIndexUrl(raw: string): { url?: URL; problem?: string } {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { problem: 'That is not a URL.' }
  }
  if (url.protocol !== 'https:') return { problem: 'Remote index URLs must use HTTPS.' }
  if (url.username || url.password || url.search || url.hash) return { problem: 'Remote index URLs cannot contain credentials, a query or a fragment.' }
  return { url }
}

function readIndexRaw(source: IndexSource, loader?: RawLoader): Promise<{ raw?: string; problem?: string }> {
  if (source.kind === 'folder') {
    const file = join(source.path, 'index.json')
    try {
      const { bytes } = readRegularFileSync(file, MAX_INDEX_BYTES)
      return Promise.resolve({ raw: bytes.toString('utf8') })
    } catch (error) {
      return Promise.resolve({ problem: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'That folder holds no index.json.' : 'That index.json could not be read as a regular file within the size limit.' })
    }
  }
  // Remote indexes are privileged-process requests: HTTPS only, no redirect,
  // and both time and bytes are bounded while the body is streaming.
  const checked = safeIndexUrl(source.url)
  if (!checked.url) return Promise.resolve({ problem: checked.problem })
  const parsed = checked.url
  if (loader) {
    // An injected loader (tests, or a future mirror) answers for the network.
    return loader(parsed.toString()).then(text => {
      if (Buffer.byteLength(text, 'utf8') > MAX_INDEX_BYTES) return { problem: 'That index is too large to read in full.' }
      return { raw: text }
    }).catch((error: unknown) => ({ problem: error instanceof Error ? error.message : 'The index could not be fetched.' }))
  }
  return import('electron').then(async ({ net }) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    try {
      const response = await net.fetch(parsed.toString(), { redirect: 'error', signal: controller.signal })
      if (!response.ok) throw new Error(`The index answered ${response.status}.`)
      const raw = await boundedResponse(response, MAX_INDEX_BYTES, 'That index is too large to read in full.')
      return { raw }
    } catch (error) {
      const problem = controller.signal.aborted
        ? 'The index did not answer within ten seconds.'
        : error instanceof Error ? error.message : 'The index could not be fetched.'
      return { problem }
    } finally {
      clearTimeout(timer)
    }
  })
}

export async function readIndex(source: IndexSource, loader?: RawLoader): Promise<ReadIndexAnswer> {
  const raw = await readIndexRaw(source, loader)
  if (raw.problem) return { ok: false, problem: raw.problem }
  const parsed = parseIndex(raw.raw ?? '')
  if ('problem' in parsed) return { ok: false, problem: parsed.problem }
  const root = source.kind === 'folder' ? resolve(source.path) : ''
  const packs = parsed.packs.map(entry => {
    if (source.kind === 'url') {
      // A URL entry is installable when the index names its files: the
      // download is digest-checked on arrival, so the checksum still governs.
      const downloadable = Array.isArray(entry.files) && entry.files.length > 0
      return {
        ...entry,
        verified: false,
        downloadable,
        problem: downloadable ? '' : 'This entry points at a download but lists no files, so nothing can be checked on arrival.',
      }
    }
    if (/^[a-z]+:\/\//.test(entry.source)) {
      return { ...entry, verified: false, problem: 'This entry points at a download; install it from a folder index you can verify.' }
    }
    const folder = join(root, entry.source)
    if (!inside(root, folder)) return { ...entry, verified: false, problem: 'Its source would leave the index folder.' }
    if (!existsSync(join(folder, 'manifest.json'))) {
      return { ...entry, verified: false, problem: 'Its folder holds no manifest.json.' }
    }
    const { digest, problem } = packDigest(folder)
    if (problem || digest !== entry.checksum) {
      return { ...entry, verified: false, problem: problem || 'Its files do not match the checksum the index pinned.' }
    }
    return { ...entry, verified: true, problem: '' }
  })
  return { ok: true, name: parsed.name, packs }
}

const inside = (root: string, target: string): boolean => {
  const rootPath = resolve(root)
  const targetPath = resolve(target)
  return targetPath === rootPath || targetPath.startsWith(rootPath + sep)
}

export type InstallFromIndexAnswer =
  | { ok: true; answer: string; written: string[]; folder: string }
  | { ok: false; answer: string }

/** Fetches one file over http(s). Injectable so tests can serve bytes. */
export type FileLoader = (url: string) => Promise<string>

const defaultLoader: FileLoader = async (raw): Promise<string> => {
  const checked = safeIndexUrl(raw)
  if (!checked.url) throw new Error(checked.problem)
  const { net } = await import('electron')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await net.fetch(checked.url.toString(), { redirect: 'error', signal: controller.signal })
    if (!response.ok) throw new Error(`The download answered ${response.status}.`)
    return await boundedResponse(response, MAX_FILE_BYTES, 'One of the pack\'s files is too large to fetch.')
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The download did not answer within fifteen seconds.')
    throw error instanceof Error ? error : new Error('The download failed.')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Install one entry of an index.
 *
 * A FOLDER entry is checked on disk and handed to the installer. A URL entry
 * is downloaded file by file from beside the index, staged in a temp folder,
 * digest-checked against the pinned checksum, and only then installed — the
 * same installer any friend's folder would take, and the same refusal when
 * one byte differs.
 */
export async function installFromIndex(
  source: IndexSource,
  id: string,
  targets: PackTargets,
  loader: FileLoader = defaultLoader,
): Promise<InstallFromIndexAnswer> {
  const index = await readIndex(source, source.kind === 'url' ? loader : undefined)
  if (!index.ok) return { ok: false, answer: index.problem }
  const entry = index.packs.find(pack => pack.id === id)
  if (!entry) return { ok: false, answer: `The index does not list "${id}".` }
  if (source.kind === 'folder') {
    if (!entry.verified) return { ok: false, answer: entry.problem || 'The pack did not pass the checksum check, so it is refused.' }
    const folder = join(resolve(source.path), entry.source)
    const stagingRoot = mkdtempSync(join(tmpdir(), 'ai-assistant-pack-'))
    const staged = join(stagingRoot, 'pack')
    try {
      // Copy first, then hash the exact immutable-by-us tree handed to the
      // installer. A source edited between browsing and approval cannot swap
      // unchecked bytes into the installed copy.
      cpSync(folder, staged, { recursive: true, errorOnExist: true, force: false })
      const stagedDigest = packDigest(staged)
      if (stagedDigest.problem || stagedDigest.digest !== entry.checksum) {
        return { ok: false, answer: stagedDigest.problem || 'The pack changed after it was reviewed; its staged files do not match the index checksum.' }
      }
      const result = installPackFromFolder(staged, targets, 'index')
      if (!result.ok) return { ok: false, answer: result.answer }
      return { ok: true, answer: `${result.pack.name} ${result.pack.version} installed from the index (checksum verified).`, written: result.written, folder: result.folder }
    } catch (error) {
      return { ok: false, answer: error instanceof Error ? error.message : 'The pack could not be staged safely.' }
    } finally {
      rmSync(stagingRoot, { recursive: true, force: true })
    }
  }
  // URL entry: download, stage, digest-check, install.
  const files = entry.files ?? []
  if (!files.length) return { ok: false, answer: entry.problem || 'This entry lists no files, so there is nothing to download and check.' }
  const checked = safeIndexUrl(source.url)
  if (!checked.url) return { ok: false, answer: checked.problem || 'The index URL is not safe.' }
  const base = checked.url
  if (!/\/index\.json$/.test(base.pathname)) return { ok: false, answer: 'The index URL does not end in index.json, so the packs beside it cannot be addressed.' }
  base.pathname = base.pathname.replace(/index\.json$/, '')
  const staging = join(mkdtempSync(join(tmpdir(), 'ai-assistant-pack-')))
  try {
    let total = 0
    const fetched: Array<{ relative: string; text: string }> = []
    for (const relative of files) {
      const fileUrl = new URL(base.toString())
      fileUrl.pathname = `${fileUrl.pathname.replace(/\/$/, '')}/${entry.source}/${relative}`
      let text: string
      try {
        text = await loader(fileUrl.toString())
      } catch (error) {
        return { ok: false, answer: error instanceof Error ? error.message : 'The download failed.' }
      }
      const bytes = Buffer.byteLength(text, 'utf8')
      if (bytes > MAX_FILE_BYTES) return { ok: false, answer: `The pack file "${relative}" is too large to download.` }
      total += bytes
      if (total > MAX_PACK_BYTES) return { ok: false, answer: 'The pack is too large to download.' }
      fetched.push({ relative, text })
    }
    for (const { relative, text } of fetched) {
      const full = join(staging, relative)
      if (!inside(staging, full)) return { ok: false, answer: 'A file name would land outside the staging folder.' }
      mkdirSync(join(full, '..'), { recursive: true })
      writeFileSync(full, text, 'utf8')
    }
    // A manifest must be among the fetched files, or the installer would be
    // asked to install a folder that cannot say what it is.
    if (!existsSync(join(staging, 'manifest.json'))) {
      return { ok: false, answer: 'The downloaded files hold no manifest.json, so the pack cannot be identified.' }
    }
    const { digest, problem } = packDigest(staging)
    if (problem || digest !== entry.checksum) {
      return { ok: false, answer: problem || 'The downloaded files do not match the checksum the index pinned, refused, nothing installed.' }
    }
    const result = installPackFromFolder(staging, targets, 'index')
    if (!result.ok) return { ok: false, answer: result.answer }
    return { ok: true, answer: `${result.pack.name} ${result.pack.version} installed from the store (downloaded, checksum verified).`, written: result.written, folder: result.folder }
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}
