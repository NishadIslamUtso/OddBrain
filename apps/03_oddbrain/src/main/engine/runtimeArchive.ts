/** Runtime-only ZIP extraction. Pack import keeps its smaller independent limits. */
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { open, type Entry, type ZipFile } from 'yauzl'

export const RUNTIME_ZIP_LIMITS = Object.freeze({ files: 512, perFile: 1.5 * 1024 ** 3, totalUncompressed: 4 * 1024 ** 3 })
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1
  return n >>> 0
})
export function runtimeEntryName(name: string): string {
  if (!name || name.length > 512 || /[\\\x00-\x1f:]/.test(name) || name.startsWith('/')) throw Error('unsafe path in archive')
  const parts = name.replace(/\/$/, '').split('/')
  if (parts.some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p))) throw Error('unsafe path in archive')
  return name
}

/** Extract into a fresh sibling, then swap. A failure never damages an installed runtime. */
export async function unpackRuntime(
  archive: string,
  destination: string,
  onProgress: (got: number, total: number) => void = () => undefined,
  limits = RUNTIME_ZIP_LIMITS,
): Promise<{ ok: boolean; answer: string }> {
  const staging = destination + '.extract-' + randomUUID()
  const backup = destination + '.previous-' + randomUUID()
  let zip: ZipFile | undefined
  let backedUp = false
  try {
    await mkdir(staging, { recursive: true })
    zip = await new Promise<ZipFile>((resolve, reject) => open(archive, { lazyEntries: true, autoClose: false, strictFileNames: true }, (error, value) => error || !value ? reject(error || Error('not a zip')) : resolve(value)))
    if (!zip.entryCount || zip.entryCount > limits.files) throw Error('empty archive or too many files')
    const entries: Entry[] = []
    let declared = 0
    const names = new Set<string>()
    await new Promise<void>((resolve, reject) => {
      const z = zip!
      z.on('error', reject)
      z.on('end', resolve)
      z.on('entry', (entry: Entry) => {
        try {
          const name = runtimeEntryName(entry.fileName)
          const normalized = name.replace(/\/$/, '').toLowerCase()
          if (names.has(normalized)) throw Error('duplicate path in archive')
          names.add(normalized)
          const mode = (entry.externalFileAttributes >>> 16) & 0xf000
          if (mode && mode !== 0x8000 && mode !== 0x4000) throw Error('links and special files are not allowed')
          if (entry.generalPurposeBitFlag & 1) throw Error('encrypted archive is not supported')
          if (![0, 8].includes(entry.compressionMethod)) throw Error('unsupported compression method')
          if (entry.uncompressedSize > limits.perFile) throw Error('a file inside is too big')
          if (name.endsWith('/') && entry.uncompressedSize !== 0) throw Error('a directory contains unexpected data')
          declared += entry.uncompressedSize
          if (declared > limits.totalUncompressed) throw Error('the archive unpacks to more than the cap')
          entries.push(entry)
          z.readEntry()
        } catch (error) { reject(error) }
      })
      z.readEntry()
    })
    let total = 0
    for (const entry of entries) {
      const target = join(staging, entry.fileName)
      if (entry.fileName.endsWith('/')) { await mkdir(target, { recursive: true }); continue }
      await mkdir(dirname(target), { recursive: true })
      const stream = await new Promise<import('node:stream').Readable>((resolve, reject) => zip!.openReadStream(entry, (error, value) => error || !value ? reject(error || Error('unreadable entry')) : resolve(value)))
      let measured = 0, crc = 0xffffffff
      const check = new Transform({ transform(chunk: Buffer, _encoding, callback) {
        measured += chunk.length; total += chunk.length
        if (measured > limits.perFile || total > limits.totalUncompressed) { callback(Error('measured archive size exceeds the cap')); return }
        for (const byte of chunk) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
        onProgress(total, declared)
        callback(null, chunk)
      } })
      await pipeline(stream, check, createWriteStream(target, { flags: 'wx' }))
      if (measured !== entry.uncompressedSize || ((crc ^ 0xffffffff) >>> 0) !== entry.crc32) throw Error('archive entry size or checksum is damaged')
    }
    zip.close(); zip = undefined
    try { await rename(destination, backup); backedUp = true } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    try { await rename(staging, destination) } catch (error) {
      if (backedUp) { await rename(backup, destination); backedUp = false }
      throw error
    }
    // A locked old runtime on Windows can be cleaned on a later manual removal;
    // it must not turn a successful installation into a false failure.
    if (backedUp) await rm(backup, { recursive: true, force: true }).catch(() => undefined)
    return { ok: true, answer: `${entries.length} entries extracted and checked` }
  } catch (error) {
    return { ok: false, answer: (error as Error).message }
  } finally {
    zip?.close()
    await rm(staging, { recursive: true, force: true }).catch(() => undefined)
  }
}
