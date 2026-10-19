import { noLinkedPath } from './configTransaction'
import { boundedResponse } from '../network/boundedResponse'
import { lstatSync, copyFileSync, constants, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fromBuffer, type Entry, type ZipFile } from 'yauzl'
import type { CatalogSkill } from '../../shared/lib/skillCatalog'
import { parseSkillMd, type VaultSkill } from './deploy'

const MAX_ARCHIVE_BYTES = 10_000_000
const MAX_FILES = 200
const MAX_FILE_BYTES = 2_000_000
const MAX_EXPANDED_BYTES = 8_000_000
const REVISION = /^[0-9a-f]{40}$/

export type SkillBundle = {
  revision: string
  files: Map<string, Buffer>
}

const safeRelative = (value: string): boolean =>
  Boolean(value) &&
  !value.startsWith('/') &&
  !value.includes('\\') &&
  !/[:\u0000-\u001f]/.test(value) &&
  !value.split('/').some(part => /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) &&
  !value.split('/').some(part => !part || part === '.' || part === '..')

async function cappedBytes(response: Response): Promise<Buffer> {
  if (!response.ok) throw Error(`GitHub returned ${response.status} while downloading the skill collection.`)
  const declared = Number(response.headers.get('content-length') || '0')
  if (declared > MAX_ARCHIVE_BYTES) { await response.body?.cancel(); throw Error('The skill collection archive exceeds the download limit.') }
  if (!response.body) throw Error('The skill collection archive is empty.')
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_ARCHIVE_BYTES) {
        await reader.cancel()
        throw Error('The skill collection archive exceeds the download limit.')
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  if (!size) throw Error('The skill collection archive is empty.')
  return Buffer.concat(chunks, size)
}

/**
 * Extract one allowlisted skill directory from Anthropic's repository archive.
 * Every path, count and expanded byte is bounded before it can reach disk.
 */
export async function extractSkillBundle(archive: Buffer, skill: string, revision: string): Promise<SkillBundle> {
  if (!REVISION.test(revision)) throw Error('The skill collection revision is invalid.')
  if (!archive.length || archive.length > MAX_ARCHIVE_BYTES) throw Error('The skill collection archive is empty or exceeds the download limit.')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill)) throw Error('The skill name is invalid.')
  const marker = `/skills/${skill}/`
  const zip = await new Promise<ZipFile>((resolveZip, reject) =>
    fromBuffer(archive, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, opened) =>
      error || !opened ? reject(error || Error('The skill collection is not a readable ZIP archive.')) : resolveZip(opened),
    ),
  )
  const files = new Map<string, Buffer>()
  let expanded = 0
  let settled = false
  return new Promise((resolveBundle, reject) => {
    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      zip.close()
      reject(error instanceof Error ? error : Error('The skill collection could not be unpacked.'))
    }
    zip.on('error', fail)
    zip.on('end', () => {
      if (settled) return
      settled = true
      if (!files.has('SKILL.md')) {
        reject(Error('The downloaded skill directory contains no SKILL.md.'))
        return
      }
      resolveBundle({ revision, files })
    })
    zip.on('entry', (entry: Entry) => {
      const mode = (entry.externalFileAttributes >>> 16) & 0o170000
      if (mode && mode !== 0o100000 && mode !== 0o040000) { fail(Error('Linked or special archive entries are not installable.')); return }
      const at = entry.fileName.indexOf(marker)
      if (at < 0) {
        zip.readEntry()
        return
      }
      const relative = entry.fileName.slice(at + marker.length)
      if (!relative || relative.endsWith('/')) {
        zip.readEntry()
        return
      }
      if (!safeRelative(relative)) {
        fail(Error('The downloaded skill contains a path outside its own folder.'))
        return
      }
      if (files.has(relative) || files.size >= MAX_FILES) {
        fail(Error('The downloaded skill has duplicate or too many files.'))
        return
      }
      if (entry.uncompressedSize > MAX_FILE_BYTES || expanded + entry.uncompressedSize > MAX_EXPANDED_BYTES) {
        fail(Error('The downloaded skill exceeds the expanded size limit.'))
        return
      }
      zip.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          fail(error || Error('A skill file could not be read from the archive.'))
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        stream.on('error', fail)
        stream.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_FILE_BYTES || expanded + size > MAX_EXPANDED_BYTES) {
            stream.destroy()
            fail(Error('The downloaded skill exceeds the expanded size limit.'))
          } else {
            chunks.push(chunk)
          }
        })
        stream.on('end', () => {
          if (settled) return
          const bytes = Buffer.concat(chunks)
          expanded += bytes.length
          files.set(relative, bytes)
          zip.readEntry()
        })
      })
    })
    zip.readEntry()
  })
}

/** Resolve `main` once, then download an immutable commit archive. */
export async function downloadSkillBundle(entry: CatalogSkill, fetchImpl: typeof fetch = fetch): Promise<SkillBundle> {
  const commitResponse = await fetchImpl(`https://api.github.com/repos/${entry.repo}/commits/main`, {
    headers: { Accept: 'application/vnd.github+json' },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  })
  if (!commitResponse.ok) throw Error(`GitHub returned ${commitResponse.status} while resolving the skill collection revision.`)
  const commit = (JSON.parse(await boundedResponse(commitResponse, 64_000))) as { sha?: unknown }
  const revision = typeof commit.sha === 'string' && REVISION.test(commit.sha) ? commit.sha : ''
  if (!revision) throw Error('GitHub did not return an immutable skill collection revision.')
  const archiveResponse = await fetchImpl(`https://codeload.github.com/${entry.repo}/zip/${revision}`, {
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  return extractSkillBundle(await cappedBytes(archiveResponse), entry.name, revision)
}

const absent = (path: string): void => {
  noLinkedPath(path)
  try { lstatSync(path) } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; throw e }
  throw Error(`An engine skill already exists at ${path}. Nothing was overwritten.`)
}
/** Install a full, pinned bundle without replacing either engine's own skills.
 * All destination conflicts are checked before writing. Failures roll back only
 * the new paths owned by this call, never a pre-existing skill directory. */
export function deploySkillBundle(entry: CatalogSkill, bundle: SkillBundle, targets: { claudeSkillsDir: string; agySkillsDir: string }): { skill: VaultSkill; written: string[] } {
  const parsed = parseSkillMd(bundle.files.get('SKILL.md')?.toString('utf8') || '')
  if (!parsed.name || !parsed.body || !REVISION.test(bundle.revision)) throw Error('The downloaded SKILL.md is not shaped like a pinned skill.')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name)) throw Error('Invalid skill name.')
  let size = 0
  if (bundle.files.size > MAX_FILES) throw Error('Too many skill files.')
  for (const [path, bytes] of bundle.files) {
    size += bytes.length
    if (!safeRelative(path) || bytes.length > MAX_FILE_BYTES || size > MAX_EXPANDED_BYTES) throw Error('A skill file is unsafe or exceeds the size limit.')
  }
  const skill: VaultSkill = { name: parsed.name === entry.name ? parsed.name : `${entry.name} (${parsed.name})`, description: parsed.description || entry.what, body: parsed.body }
  const roots = [join(targets.claudeSkillsDir, entry.name), join(targets.agySkillsDir, entry.name)]
  if (new Set(roots.map(p => resolve(p).toLowerCase())).size !== 2) throw Error('Engine skill destinations overlap.')
  for (const path of roots) absent(path)
  const owned: string[] = [], staging: string[] = [], written: string[] = []
  try {
    for (const destination of roots) {
      noLinkedPath(destination); mkdirSync(dirname(destination), { recursive: true })
      const stage = mkdtempSync(join(dirname(destination), '.oddbrain-skill-')); staging.push(stage)
      for (const [relative, bytes] of bundle.files) {
        const target = resolve(stage, relative)
        if (!target.startsWith(resolve(stage) + sep)) throw Error('A skill file would leave its destination.')
        mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes, { flag: 'wx' })
      }
    }
    for (let index = 0; index < roots.length; index++) {
      absent(roots[index]); mkdirSync(roots[index]); owned.push(roots[index])
      for (const relative of bundle.files.keys()) {
        const target = join(roots[index], relative); mkdirSync(dirname(target), { recursive: true })
        copyFileSync(join(staging[index], relative), target, constants.COPYFILE_EXCL)
      }
      written.push(...[...bundle.files.keys()].map(relative => join(roots[index], relative)))
    }
    if (!readFileSync(join(roots[0], 'SKILL.md')).length) throw Error('The installed skill is empty.')
    return { skill, written }
  } catch (error) {
    const failed: string[] = []
    for (const path of owned) { try { rmSync(path, { recursive: true, force: true }) } catch { failed.push(path) } }
    if (failed.length) throw Error(`Skill install failed and cleanup needs attention: ${failed.join(', ')}`)
    throw error
  } finally { for (const path of staging) rmSync(path, { recursive: true, force: true }) }
}
