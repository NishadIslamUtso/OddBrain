import { createHash } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MAX_ENGINE_ATTACHMENTS, MAX_ENGINE_IMAGE_BYTES, type EngineImage } from '../shared/lib/media'
import { TRANSCRIPT_ID, validTranscriptMedia, type TranscriptMedia, type TranscriptMediaFile } from '../shared/lib/transcripts'
import { noLinkedPath } from './engine/configTransaction'

const EXTENSION = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' } as const

export type TurnMediaLimits = { files: number; bytes: number }

/**
 * The exact picture bytes that rode with one recorded turn.
 *
 * These are app-owned copies written before dispatch, not the engine's own
 * attachment store, not the vault and not a claim that a model accepted or
 * understood them. Every file is addressed by the record identifier plus its
 * ordered position, and every read is checked against the size and SHA-256
 * digest that were recorded with the turn.
 */
export function createTurnMedia(root: string, limits: TurnMediaLimits = { files: MAX_ENGINE_ATTACHMENTS, bytes: MAX_ENGINE_IMAGE_BYTES }) {
  const folder = (id: string) => {
    if (!TRANSCRIPT_ID.test(id)) throw Error('Invalid transcript identifier.')
    noLinkedPath(root)
    const dir = join(root, id)
    noLinkedPath(dir)
    return dir
  }
  return {
    /** Write every picture, or none. A partial attempt removes only the folder it created. */
    save(id: string, images: EngineImage[]): TranscriptMedia {
      if (!images.length) throw Error('There is nothing to preserve.')
      if (images.length > limits.files) throw Error(`At most ${limits.files} pictures can be preserved with one record.`)
      const dir = folder(id)
      mkdirSync(root, { recursive: true, mode: 0o700 })
      mkdirSync(dir, { mode: 0o700 })
      const files: TranscriptMediaFile[] = []
      let total = 0
      try {
        for (const [index, image] of images.entries()) {
          const bytes = Buffer.from(image.data, 'base64')
          if (!bytes.length || bytes.length > limits.bytes) throw Error('One of the pictures is outside the saved picture size limit.')
          const sha256 = createHash('sha256').update(bytes).digest('hex')
          writeFileSync(join(dir, index + EXTENSION[image.mime]), bytes, { flag: 'wx', mode: 0o600 })
          files.push({ index, mime: image.mime, bytes: bytes.length, sha256 })
          total += bytes.length
        }
      } catch (error) {
        try { rmSync(dir, { recursive: true, force: true }) } catch { /* the original failure is what matters */ }
        throw error
      }
      return { files, bytes: total }
    },
    /** Remove the folder written by this turn when its text header could not be saved. */
    discard(id: string): void {
      rmSync(folder(id), { recursive: true, force: true })
    },
    /** Read one picture back only if it still matches the record's own size and digest. */
    read(id: string, index: number, expected: TranscriptMediaFile): { base64: string; mime: string; name: string; bytes: number; sha256: string } {
      if (!Number.isSafeInteger(index) || index < 0 || index >= limits.files || index !== expected.index) throw Error('That saved picture position is not part of this record.')
      const described = validTranscriptMedia({ files: [{ ...expected, index: 0 }], bytes: expected.bytes })
      if (!described || !(expected.mime in EXTENSION)) throw Error('The saved picture description is damaged. Nothing was downloaded.')
      const file = join(folder(id), index + EXTENSION[expected.mime])
      let bytes: Buffer
      try {
        const info = lstatSync(file)
        if (!info.isFile() || info.size > limits.bytes || info.size !== expected.bytes) throw Error('The saved picture is missing or does not match its recorded size. Nothing was downloaded.')
        bytes = readFileSync(file)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ENOTDIR') throw Error('The saved picture is missing. The record is unchanged.')
        throw error
      }
      if (bytes.length !== expected.bytes) throw Error('The saved picture changed size. Nothing was downloaded.')
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      if (sha256 !== expected.sha256) throw Error('The saved picture does not match its recorded digest. Nothing was downloaded.')
      return { base64: bytes.toString('base64'), mime: expected.mime, name: `turn-${id}-picture-${index + 1}${EXTENSION[expected.mime]}`, bytes: bytes.length, sha256 }
    },
  }
}
