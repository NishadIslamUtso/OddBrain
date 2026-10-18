import { crc32 } from '../../shared/lib/zip'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { open, type ZipFile, type Entry } from 'yauzl'

export type ArchiveLimits = { files: number; perFile: number; totalUncompressed: number }
export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = { files: 200, perFile: 200 * 1024 ** 2, totalUncompressed: 400 * 1024 ** 2 }
// Specific to the official Windows runtime, not to imported packs/documents.
// The documented runtime has a 692 MB DLL and ~1.94 GB expanded contents.
export const OLLAMA_ARCHIVE_LIMITS: ArchiveLimits = { files: 200, perFile: 1024 ** 3, totalUncompressed: 3 * 1024 ** 3 }

export function safeArchivePath(name: string): boolean {
  return !!name && !name.includes('\\') && !name.includes('\0') && !name.includes(':') && !name.startsWith('/') && !name.split('/').some((part, index, parts) => part === '..' || part === '.' || (!part && index !== parts.length - 1) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
}

/** Extract sequentially into a NEW private staging directory; never an active runtime. */
export async function extractRuntimeArchive(file: string, destination: string, limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS): Promise<{ ok: boolean; answer: string }> {
  let zip: ZipFile | undefined
  try {
    zip = await new Promise<ZipFile>((resolve, reject) => open(file, { lazyEntries: true, autoClose: false, strictFileNames: true, validateEntrySizes: true }, (error, result) => error || !result ? reject(error ?? Error('not a zip')) : resolve(result)))
    const archive = zip
    if (archive.entryCount > limits.files) throw Error('too many files')
    let declared = 0, actual = 0, count = 0
    await new Promise<void>((resolve, reject) => {
      archive.on('error', reject)
      archive.on('end', resolve)
      archive.on('entry', (entry: Entry) => {
        void (async () => {
          if (!safeArchivePath(entry.fileName)) throw Error('unsafe path in archive')
          const mode = (entry.externalFileAttributes >>> 16) & 0xf000
          if (mode === 0xa000 || (mode !== 0 && mode !== 0x8000 && mode !== 0x4000)) throw Error('links and special files are not allowed')
          if (entry.isEncrypted()) throw Error('encrypted archive is not supported')
          if (![0, 8].includes(entry.compressionMethod)) throw Error('unsupported compression method')
          declared += entry.uncompressedSize
          if (entry.uncompressedSize > limits.perFile) throw Error('a file inside is too big')
          if (declared > limits.totalUncompressed) throw Error('the archive unpacks to more than the cap')
          const target = join(destination, entry.fileName)
          if (entry.fileName.endsWith('/')) await mkdir(target, { recursive: true })
          else {
            await mkdir(dirname(target), { recursive: true })
            const source = await new Promise<NodeJS.ReadableStream>((res, rej) => archive.openReadStream(entry, (error, stream) => error || !stream ? rej(error ?? Error('unreadable entry')) : res(stream)))
            let size = 0, checksum = 0
            const budget = new Transform({ transform(chunk: Buffer, _encoding, callback) {
              size += chunk.length; actual += chunk.length
              checksum = crc32(chunk, checksum)
              callback(size > limits.perFile || actual > limits.totalUncompressed ? Error('archive exceeds extraction cap') : null, chunk)
            } })
            await pipeline(source, budget, createWriteStream(target, { flags: 'wx', mode: 0o600 }))
            if (checksum !== entry.crc32) throw Error('archive entry checksum mismatch')
          }
          count += 1
          archive.readEntry()
        })().catch(reject)
      })
      archive.readEntry()
    })
    return { ok: true, answer: `${count} files` }
  } catch (error) {
    return { ok: false, answer: error instanceof Error ? error.message : 'damaged archive' }
  } finally { zip?.close() }
}
