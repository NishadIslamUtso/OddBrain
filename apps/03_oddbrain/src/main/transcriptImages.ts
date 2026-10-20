/**
 * The exact picture bytes a turn sent to an engine.
 *
 * The turn record kept a count and said, honestly, that the bytes were not
 * stored. This keeps them: written before dispatch, next to the record, with a
 * digest so a download can be checked byte-for-byte against what the engine
 * received.
 *
 * Rules:
 *   - the same validator the IPC boundary uses decides what is even a picture
 *     (PNG/JPEG/WebP, at most four, at most 2 MB each);
 *   - a turn's saved pictures share one 8 MB budget, refused rather than
 *     truncated when exceeded;
 *   - files are created exclusively and flushed through a writable descriptor,
 *     so a half-written picture is never presented as saved;
 *   - links are refused on the folder and every file;
 *   - a failed write removes only files this attempt created;
 *   - reading re-checks size and digest. A mismatch is an error, never the
 *     returned picture.
 */
import { createHash } from 'node:crypto'
import { closeSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, rmdirSync, unlinkSync, writeSync, fsyncSync } from 'node:fs'
import { join } from 'node:path'
import { engineImages, MAX_ENGINE_ATTACHMENTS, MAX_ENGINE_IMAGE_BYTES } from '../shared/lib/media'
import { validPictureRecords, type TranscriptPicture } from '../shared/lib/transcripts'
import { noLinkedPath } from './engine/configTransaction'

export const PICTURE_TOTAL_BYTES = 8 * 1024 * 1024
const EXTENSION: Record<TranscriptPicture['mime'], string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export const pictureFolder = (root: string, id: string): string => join(root, `${id}.pictures`)
const picturePath = (root: string, id: string, record: TranscriptPicture): string =>
  join(pictureFolder(root, id), `${record.index}.${EXTENSION[record.mime]}`)

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

/**
 * Validate and write every picture for one turn.
 *
 * Returns the records the header carries. Throws without leaving a partial
 * folder behind when the input is not exactly four-or-fewer real pictures.
 */
export function savePictures(root: string, id: string, input: unknown, totalLimit = PICTURE_TOTAL_BYTES): TranscriptPicture[] {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input) || input.length === 0) return []
  const checked = engineImages(input)
  if (!checked.ok) throw Error(/Nothing was sent\.$/.test(checked.answer) ? checked.answer : `${checked.answer} Nothing was sent.`)
  if (checked.images.length > MAX_ENGINE_ATTACHMENTS) throw Error('Too many pictures for one turn. Nothing was sent.')
  const decoded = checked.images.map(image => Buffer.from(image.data, 'base64'))
  const total = decoded.reduce((size, bytes) => size + bytes.length, 0)
  if (decoded.some(bytes => bytes.length === 0 || bytes.length > MAX_ENGINE_IMAGE_BYTES) || total > totalLimit) {
    throw Error('The pictures exceed the saved-attachment limit for one turn. Nothing was sent and nothing was saved.')
  }
  const folder = pictureFolder(root, id)
  noLinkedPath(folder)
  const records: TranscriptPicture[] = []
  const created: string[] = []
  try {
    mkdirSync(folder, { recursive: true, mode: 0o700 })
    for (const [index, image] of checked.images.entries()) {
      const record: TranscriptPicture = { index, mime: image.mime, bytes: decoded[index].length, sha256: sha256(decoded[index]) }
      const file = picturePath(root, id, record)
      noLinkedPath(file)
      const fd = openSync(file, 'wx', 0o600)
      try {
        writeSync(fd, decoded[index])
        // Flushed through the same writable descriptor; Windows refuses fsync
        // on a read-only handle, and a reopened handle is not the same write.
        fsyncSync(fd)
      } finally {
        closeSync(fd)
      }
      created.push(file)
      records.push(record)
    }
  } catch (error) {
    for (const file of created) {
      try { unlinkSync(file) } catch { /* only files this attempt created are removed */ }
    }
    try { unlinkSync(folder) } catch { /* the folder is empty when nothing was written */ }
    throw error instanceof Error ? error : Error('The pictures could not be saved. Nothing was sent.')
  }
  if (!validPictureRecords(records, checked.images.length)) throw Error('The saved picture records are not valid. Nothing was sent.')
  return records
}

/** Read one saved picture, refusing anything that no longer matches its record. */
export function readPicture(root: string, id: string, records: readonly TranscriptPicture[], index: number): { record: TranscriptPicture; bytes: Buffer } {
  const record = records[index]
  if (!record || record.index !== index) throw Error('No saved picture has that number.')
  const file = picturePath(root, id, record)
  noLinkedPath(file)
  let info: ReturnType<typeof lstatSync>
  try {
    info = lstatSync(file)
  } catch {
    throw Error('The saved picture file is missing. It was not replaced or regenerated.')
  }
  if (info.isSymbolicLink()) throw Error('The saved picture is a link; links are not read.')
  if (!info.isFile() || info.size !== record.bytes) throw Error('The saved picture does not match its recorded size. Nothing is shown.')
  const bytes = readFileSync(file)
  if (sha256(bytes) !== record.sha256) throw Error('The saved picture does not match its recorded digest. Nothing is shown; the original file is unchanged.')
  return { record, bytes }
}

/** Remove the pictures this app saved for one turn (only its own file names). */
export function removePictures(root: string, id: string): void {
  const folder = pictureFolder(root, id)
  noLinkedPath(folder)
  try {
    for (const name of readdirSync(folder)) {
      if (/^\d+\.(png|jpg|webp)$/.test(name)) unlinkSync(join(folder, name))
    }
    rmdirSync(folder)
  } catch {
    // Missing or not empty is fine: nothing else is touched.
  }
}
