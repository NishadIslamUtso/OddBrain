import { noLinkedPath } from './configTransaction'
import { createFileReviewService } from './reviewedFileChange'
/**
 * Checkpoints: the file's old self, kept the moment before the engine changes
 * it. The idea is Replit's and Claude Code's (auto-snapshot before a risky
 * write, one way back), built app-side so it holds no matter which engine.
 * One file, one copy, honest names: the epoch the copy was taken, the file it
 * was taken FROM. Restore puts that copy back exactly where it came from.
 */
import { mkdir, readFile, readdir, writeFile, lstat, realpath, open, rename } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { join, basename, sep } from 'node:path'

export type Checkpoint = {
  /** Where the file lives in the workspace. */
  original: string
  /** The kept copy inside the checkpoints folder; empty for a ghost. */
  copy: string
  /** When it was kept, as the owner sees it. */
  at: string
  /** False when the file did not exist yet: restoring deletes it. */
  existed?: boolean
}

/** The file tools whose Allow is worth a checkpoint. Bash never gets one: a
 *  command can touch anything, and pretending otherwise would lie. */
const CHECKPOINT_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit', 'MultiEdit'])

export function checkpointWorthTaking(tool: string): boolean {
  return CHECKPOINT_TOOLS.has(tool)
}

/**
 * The name a copy carries: epoch, a short hash OF THE PATH (so two files with
 * the same basename in different folders can never collide), the basename.
 */
export function copyName(original: string, epochMs: number): string {
  const safe = basename(original).replace(/[^A-Za-z0-9._-]/g, '_').slice(-60)
  const hash = createHash('sha256').update(original).digest('hex').slice(0, 8)
  return `${epochMs}-${hash}-${safe}`
}

/**
 * Keep the file's current self. A file that does not exist yet is recorded
 * as a GHOST: nothing to keep, but restoring must delete what the engine
 * created. Returns null only when the path tells nothing at all.
 */
export async function snapshotFile(
  dir: string,
  original: string,
  epochMs = Date.now(),
): Promise<Checkpoint | null> {
  let before: Buffer
  try {
    before = await readFile(original)
  } catch (failure) {
    // Only a missing file is a ghost. A file we cannot READ is not "not
    // there" — pretending so would record a restore that deletes real work.
    if ((failure as NodeJS.ErrnoException).code !== 'ENOENT') throw failure
    return { original, copy: '', at: new Date(epochMs).toISOString(), existed: false }
  }
  await mkdir(dir, { recursive: true })
  const stem = copyName(original, epochMs)
  let copy = join(dir, stem)
  for (;;) {
    try {
      await writeFile(copy, before, { flag: 'wx' })
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      // Two edits can occur in the same millisecond. Keep both preimages.
      copy = join(dir, `${stem}-${randomUUID()}`)
    }
  }
  return { original, copy, at: new Date(epochMs).toISOString(), existed: true }
}

/**
 * Put a kept copy back, or delete a ghost the engine created. A ghost is
 * named by its ORIGINAL path — many files can be created in one turn, and
 * "the first ghost in the index" once deleted the wrong one of them.
 */
export async function restoreCheckpoint(_dir: string, _copy: string, _original = ''): Promise<{ ok: boolean; answer: string }> {
  return { ok: false, answer: 'Restore now requires an exact diff review and a one-use approval. Open Review restore and preview the exact change first; no files were changed.' }
}

/** Main-process singleton. Renderer supplies indexed identifiers only, never replacement bytes. */
export function createReviewedCheckpoints(dir: string) {
  const service = createFileReviewService()
  return {
    async preview(copy: string, original: string) {
      const entry = (await readIndex(dir)).find(row => copy ? row.copy === copy && row.original === original : row.existed === false && !row.copy && row.original === original)
      if (!entry) throw Error('Checkpoint not indexed for this exact file.')
      noLinkedPath(entry.original)
      let bytes: Buffer | null = null
      if (entry.existed !== false) {
        noLinkedPath(entry.copy)
        const info = await lstat(entry.copy), root = await realpath(dir), file = await realpath(entry.copy)
        if (!info.isFile() || !file.startsWith(root + sep) || info.size > 2_000_000) throw Error('Checkpoint is linked, outside its directory, or exceeds the review limit.')
        bytes = await readFile(file)
      }
      return service.prepare(entry.original, bytes, 'restore')
    },
    decide: service.decide,
    reviewedPath: service.reviewedPath,
  }
}

/** The checkpoints folder's own little index: one JSON line per copy. */
export type CheckpointRecord = { copy: string; original: string; at: string; existed?: boolean }

async function readIndex(dir: string): Promise<CheckpointRecord[]> {
  noLinkedPath(join(dir, 'index.json'))
  let text: string
  try { text = await readFile(join(dir, 'index.json'), 'utf8') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  const records: unknown = JSON.parse(text)
  if (!Array.isArray(records) || records.some(row => !row || typeof row.original !== 'string' || typeof row.copy !== 'string' || typeof row.at !== 'string' || (row.existed !== undefined && typeof row.existed !== 'boolean'))) throw Error('Checkpoint index damaged. Original records were not changed.')
  return records
}

export async function writeIndex(dir: string, records: CheckpointRecord[]): Promise<void> {
  if (records.length > 10_000) throw Error('Checkpoint index reached 10,000 entries. No older records were evicted.')
  noLinkedPath(dir)
  await mkdir(dir, { recursive: true })
  const temporary = join(dir, `index-${randomUUID()}.tmp`)
  await writeFile(temporary, JSON.stringify(records, null, 2), { flag: 'wx', mode: 0o600 })
  noLinkedPath(join(dir, 'index.json'))
  await rename(temporary, join(dir, 'index.json'))
}

/** One chain per checkpoints folder: index READ-modify-writes never interleave. */
const indexWrites = new Map<string, Promise<unknown>>()

/**
 * The whole read-mutate-write cycle runs as ONE queued unit, and it is the
 * ONLY way the index changes. Reading outside the chain is what lost records:
 * two concurrent checkpoints each read the same index, each appended its own,
 * and the second write erased the first. writeIndex itself chains nothing —
 * every caller here already holds the folder's turn.
 */
async function withIndex<T>(dir: string, mutate: (records: CheckpointRecord[]) => T): Promise<T> {
  const previous = indexWrites.get(dir) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(async () => {
    const records = await readIndex(dir)
    return await mutate(records)
  })
  indexWrites.set(dir, run as Promise<unknown>)
  try {
    return await run
  } finally {
    if (indexWrites.get(dir) === run) indexWrites.delete(dir)
  }
}

/**
 * The latest checkpoints, newest first, capped. Ghosts ride along — a ghost
 * records a file the engine was about to CREATE, and restoring it deletes
 * that file, so hiding ghosts hid half the guarantee.
 */
export async function listCheckpoints(dir: string, cap = 20): Promise<CheckpointRecord[]> {
  const records = await readIndex(dir)
  const known = new Set(await readdir(dir).catch(() => [] as string[]))
  return records
    .filter(record => record.existed === false || known.has(record.copy.split(/[\\/]/).pop() ?? ''))
    .reverse()
    .slice(0, cap)
}

/** Keep the file's self AND remember it, in one call. */
export async function takeCheckpoint(dir: string, original: string, epochMs = Date.now()): Promise<Checkpoint | null> {
  const kept = await snapshotFile(dir, original, epochMs)
  if (kept) await rememberCheckpoint(dir, kept)
  return kept
}

/**
 * Remember a snapshot in the folder's index: append, newest last, never
 * losing older records even when the write races a restart.
 */
export async function rememberCheckpoint(dir: string, record: Checkpoint): Promise<void> {
  await withIndex(dir, async (records) => {
    records.push(record)
    await writeIndex(dir, records)
  })
}

/** Only an indexed, real snapshot inside this app's checkpoint directory may
 * be inspected. Never turn the viewer into a general filesystem reader. */
export async function inspectCheckpoint(dir: string, copy: string): Promise<{ ok: boolean; content?: string; clipped?: boolean; answer?: string }> {
  try {
    if (!(await readIndex(dir)).some(item => item.copy === copy && !!copy)) return { ok: false, answer: 'That copy is not in the checkpoint index.' }
    const info = await lstat(copy), base = await realpath(dir), file = await realpath(copy)
    if (!info.isFile() || info.isSymbolicLink() || !file.startsWith(base + sep)) return { ok: false, answer: 'Snapshot links or paths outside the checkpoint directory are refused.' }
    const handle = await open(file, 'r')
    try { const bytes = Buffer.alloc(20001), result = await handle.read(bytes, 0, bytes.length, 0), body = bytes.subarray(0, Math.min(result.bytesRead, 20000)); if (body.includes(0)) return { ok: false, answer: 'This snapshot is binary. Its restore is still available.' }; return { ok: true, content: body.toString('utf8'), clipped: info.size > 20000 } } finally { await handle.close() }
  } catch { return { ok: false, answer: 'The snapshot could not be read.' } }
}
