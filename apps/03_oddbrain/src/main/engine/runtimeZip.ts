import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, open, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { PassThrough, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { crc32, createInflateRaw } from 'node:zlib'

/** Only for the official Ollama runtime, never for untrusted mod packs or
 * attachments. The measured Windows archive is ~1.47 GB compressed / ~1.94 GB
 * unpacked, with one ~692 MB file. These caps admit it without allowing an
 * unlimited inflate. This reader refuses ZIP64 rather than guessing offsets. */
export const RUNTIME_ZIP_LIMITS = Object.freeze({
  files: 512,
  perFile: 1_536 * 1024 * 1024,
  totalUncompressed: 4 * 1024 * 1024 * 1024,
})
export type RuntimeZipLimits = typeof RUNTIME_ZIP_LIMITS
export type RuntimeZipProgress = { files: number; totalFiles: number; got: number; total: number }
type Entry = { name: string; method: number; flags: number; crc: number; compressed: number; size: number; local: number; directory: boolean }

const decoder = new TextDecoder('utf-8', { fatal: true })
const MAX_DIRECTORY_BYTES = 8 * 1024 * 1024

/** Zip entries use forward slashes. Windows also treats trailing dots/spaces,
 * colons, device names and case collisions specially; refuse them up front. */
function safeName(name: string): boolean {
  if (!name || name.length > 1024 || name.startsWith('/') || name.includes('\\') || /[\0-\x1f:]/.test(name)) return false
  const parts = name.endsWith('/') ? name.slice(0, -1).split('/') : name.split('/')
  return parts.every(part => Boolean(part) && part !== '.' && part !== '..' && !/[. ]$/.test(part) && !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(part))
}

/** Destination must not exist: the caller passes an app-owned temporary folder.
 * No old runtime can be overwritten on a failed download/unpack. Every byte is
 * streamed and checked against both the declared limits and the measured ones. */
export async function unzipRuntimeZip(
  archive: string,
  destination: string,
  onProgress: (progress: RuntimeZipProgress) => void = () => undefined,
  limits: RuntimeZipLimits = RUNTIME_ZIP_LIMITS,
): Promise<{ ok: boolean; answer: string }> {
  if (existsSync(destination)) return { ok: false, answer: 'The staging folder already exists; no files were replaced.' }
  const file = await open(archive, 'r')
  let created = false
  try {
    const { size: length } = await file.stat()
    const exact = async (position: number, count: number): Promise<Buffer> => {
      if (!Number.isSafeInteger(position) || count < 0 || position < 0 || position + count > length) throw Error('Truncated zip data.')
      const result = Buffer.alloc(count)
      let offset = 0
      while (offset < count) {
        const read = await file.read(result, offset, count - offset, position + offset)
        if (!read.bytesRead) throw Error('Truncated zip data.')
        offset += read.bytesRead
      }
      return result
    }
    const tail = await exact(Math.max(0, length - 65_557), Math.min(length, 65_557))
    let end = -1
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tail.length) { end = i; break }
    }
    if (end < 0) throw Error('Not a complete zip archive.')
    const count = tail.readUInt16LE(end + 10)
    const centralSize = tail.readUInt32LE(end + 12)
    const centralOffset = tail.readUInt32LE(end + 16)
    if (tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6) || tail.readUInt16LE(end + 8) !== count) throw Error('Multi-volume zip archives are not supported.')
    if (count === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw Error('ZIP64 archives are not supported.')
    if (!count || count > limits.files) throw Error('Too many files in the runtime archive.')
    if (centralSize > MAX_DIRECTORY_BYTES || centralOffset + centralSize > length - tail.length + end) throw Error('Damaged central directory.')
    const central = await exact(centralOffset, centralSize)
    let at = 0, declared = 0
    const names = new Set<string>(), entries: Entry[] = []
    for (let i = 0; i < count; i++) {
      if (at + 46 > central.length || central.readUInt32LE(at) !== 0x02014b50) throw Error('Damaged central directory.')
      const flags = central.readUInt16LE(at + 8)
      const method = central.readUInt16LE(at + 10)
      const crc = central.readUInt32LE(at + 16)
      const compressed = central.readUInt32LE(at + 20)
      const size = central.readUInt32LE(at + 24)
      const nameLength = central.readUInt16LE(at + 28)
      const extraLength = central.readUInt16LE(at + 30)
      const commentLength = central.readUInt16LE(at + 32)
      const disk = central.readUInt16LE(at + 34)
      const mode = (central.readUInt32LE(at + 38) >>> 16) & 0xf000
      const local = central.readUInt32LE(at + 42)
      if (size === 0xffffffff || compressed === 0xffffffff || local === 0xffffffff) throw Error('ZIP64 entries are not supported.')
      if (at + 46 + nameLength + extraLength + commentLength > central.length) throw Error('Truncated central directory.')
      const name = decoder.decode(central.subarray(at + 46, at + 46 + nameLength))
      if (!safeName(name)) throw Error(`Unsafe path in runtime archive: ${name.slice(0, 120)}`)
      const key = name.replace(/\/$/, '').toLowerCase()
      if (names.has(key)) throw Error('Two runtime files have the same Windows path.')
      names.add(key)
      if (flags & (1 | 0x40)) throw Error('Encrypted zip entries are not supported.')
      if (disk || (method !== 0 && method !== 8)) throw Error('Unsupported zip entry or compression method.')
      if (mode && mode !== 0x8000 && mode !== 0x4000) throw Error('Links and special files are not supported in runtime archives.')
      const directory = name.endsWith('/')
      if (directory && (size !== 0 || compressed !== 0)) throw Error('A zip directory contains data.')
      declared += size
      if (size > limits.perFile || declared > limits.totalUncompressed) throw Error('The runtime archive exceeds its unpacked-size cap.')
      entries.push({ name, method, flags, crc, compressed, size, local, directory })
      at += 46 + nameLength + extraLength + commentLength
    }
    if (at !== central.length) throw Error('Damaged central directory.')
    // Validate every offset and local name BEFORE creating any output file.
    const offsets: number[] = []
    for (const entry of entries) {
      const header = await exact(entry.local, 30)
      if (header.readUInt32LE(0) !== 0x04034b50 || header.readUInt16LE(8) !== entry.method ||
          header.readUInt16LE(6) !== entry.flags) throw Error('The local zip header disagrees with the central directory.')
      const name = decoder.decode(await exact(entry.local + 30, header.readUInt16LE(26)))
      if (name !== entry.name) throw Error('The local zip name disagrees with the central directory.')
      const data = entry.local + 30 + header.readUInt16LE(26) + header.readUInt16LE(28)
      if (data + entry.compressed > centralOffset) throw Error('A zip entry exceeds the archive data.')
      if (entry.method === 0 && entry.size !== entry.compressed) throw Error('A stored file declares two different sizes.')
      offsets.push(data)
    }
    await mkdir(destination, { recursive: true })
    created = true
    let measuredTotal = 0
    onProgress({ files: 0, totalFiles: count, got: 0, total: declared })
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const output = resolve(destination, entry.name)
      if (!output.startsWith(resolve(destination) + sep)) throw Error('Unsafe path outside the runtime folder.')
      if (entry.directory) await mkdir(output, { recursive: true })
      else {
        await mkdir(dirname(output), { recursive: true })
        let measured = 0, actualCrc = 0
        if (!entry.compressed) {
          if (entry.size || entry.crc) throw Error('A zero-byte runtime file declares content.')
          await writeFile(output, Buffer.alloc(0), { flag: 'wx' })
        }
        else await pipeline(
          createReadStream(archive, { start: offsets[i], end: offsets[i] + entry.compressed - 1 }),
          entry.method === 8 ? createInflateRaw() : new PassThrough(),
          new Transform({ transform(chunk: Buffer, _encoding, callback) {
            measured += chunk.length
            measuredTotal += chunk.length
            if (measured > entry.size || measured > limits.perFile || measuredTotal > limits.totalUncompressed) {
              callback(Error('A zip entry expanded beyond its declared size or runtime cap.'))
              return
            }
            actualCrc = crc32(chunk, actualCrc)
            callback(null, chunk)
          } }),
          createWriteStream(output, { flags: 'wx' }),
        )
        if (measured !== entry.size || actualCrc !== entry.crc) throw Error('A runtime file is damaged (size or CRC differs).')
      }
      onProgress({ files: i + 1, totalFiles: count, got: measuredTotal, total: declared })
    }
    return { ok: true, answer: `${count} entries unpacked, ${measuredTotal} bytes checked` }
  } catch (error) {
    if (created) await rm(destination, { recursive: true, force: true }).catch(() => undefined)
    return { ok: false, answer: (error as Error).message }
  } finally {
    await file.close()
  }
}
