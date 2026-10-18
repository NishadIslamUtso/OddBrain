/**
 * One honest zip reader for the whole app: central directory, stored (0)
 * and deflate (8) entries, a strict zip-slip refusal, per-file and total
 * caps. It yields entries as they are read (nothing accumulates until a
 * caller keeps it) and refuses with the same plain sentences everywhere —
 * the downloader writes the runtime archive to disk through it, and the
 * in-app document reader gathers small entries in memory through it.
 */

import { inflateRawSync } from 'node:zlib'

export type ZipLimits = { files: number; perFile: number; totalUncompressed: number }

export type ZipEntry = {
  name: string
  content: Uint8Array
}

export class ZipRefusal extends Error {
  readonly answer: string
  constructor(answer: string) {
    super(answer)
    this.answer = answer
  }
}

export function* iterZipEntries(bytes: Uint8Array, limits: ZipLimits): Generator<ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // End of central directory: signature 0x06054b50, scan back past any comment.
  let end = -1
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 22 - 65_536; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break }
  }
  if (end < 0) throw new ZipRefusal('not a zip')
  const count = view.getUint16(end + 10, true)
  if (count > limits.files) throw new ZipRefusal('too many files')
  let offset = view.getUint32(end + 16, true)
  const decoder = new TextDecoder()
  let totalDeclared = 0
  let totalActual = 0
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new ZipRefusal('damaged central directory')
    const flags = view.getUint16(offset + 8, true)
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    // The central directory DECLARES the uncompressed size — check it before
    // inflating a single byte, or a hostile archive spends the memory first
    // and answers for it afterwards. Also tracked: the aggregate, so ten
    // "small" entries cannot add up to a disk-eater.
    const declaredSize = view.getUint32(offset + 24, true)
    totalDeclared += declaredSize
    if (declaredSize > limits.perFile) throw new ZipRefusal('a file inside is too big')
    if (totalDeclared > limits.totalUncompressed) throw new ZipRefusal('the archive unpacks to more than the cap')
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    if (name.includes('..') || /^[A-Za-z]:/.test(name) || name.startsWith('/')) {
      throw new ZipRefusal(`unsafe path in archive: ${name}`)
    }
    if ((flags & 0x1) !== 0) throw new ZipRefusal('password-protected archive')
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const raw = bytes.subarray(dataStart, dataStart + compressedSize)
    let content: Uint8Array
    if (method === 0) content = raw
    else if (method === 8) {
      try {
        content = new Uint8Array(inflateRawSync(raw, { maxOutputLength: limits.perFile }))
      } catch {
        throw new ZipRefusal('a file inside is bigger than it declared, or damaged')
      }
    }
    else throw new ZipRefusal(`unsupported compression method ${method}`)
    if (content.length > limits.perFile) throw new ZipRefusal('a file inside is too big')
    // The declared total was checked up front, but declarations are attacker
    // data: a forged zero here means the REAL bytes above were never counted.
    // The cap that matters is the one measured on what actually inflated.
    totalActual += content.length
    if (totalActual > limits.totalUncompressed) {
      throw new ZipRefusal('the archive unpacks to more than the cap')
    }
    yield { name, content }
    offset += 46 + nameLength + extraLength + commentLength
  }
}
