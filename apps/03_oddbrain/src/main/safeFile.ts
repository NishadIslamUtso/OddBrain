import { createHash } from 'node:crypto'
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readSync, unlinkSync, writeSync, type Stats } from 'node:fs'

export type OpenedFile = { bytes: Buffer; stat: Stats }

const sameNamedFile = (path: string, opened: Stats): boolean => {
  const named = lstatSync(path)
  return named.isFile() && !named.isSymbolicLink() && named.dev === opened.dev && named.ino === opened.ino
}

/**
 * Open once, validate the opened object and its leaf name, and read from that
 * descriptor. Opening with the explicit read-only mode avoids creating files;
 * comparing the opened handle with lstat also refuses leaf symlinks on Windows.
 */
export function readRegularFileSync(path: string, limit: number): OpenedFile {
  if (!Number.isSafeInteger(limit) || limit < 0) throw Error('Invalid file read limit.')
  // The mode is ignored for read-only opens; keeping it owner-only also makes
  // this call safe if its flags are ever extended to permit creation.
  const descriptor = openSync(path, 'r', 0o600)
  try {
    const before = fstatSync(descriptor)
    if (!sameNamedFile(path, before) || !before.isFile() || before.size > limit) throw Error(`File is not a regular file within the ${limit}-byte read limit.`)
    const allocation = Buffer.alloc(before.size + 1)
    let size = 0
    while (size < allocation.length) {
      const count = readSync(descriptor, allocation, size, allocation.length - size, null)
      if (!count) break
      size += count
    }
    const after = fstatSync(descriptor)
    if (
      size !== before.size ||
      size > limit ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      !sameNamedFile(path, after)
    ) throw Error('File changed while it was being read.')
    return { bytes: allocation.subarray(0, size), stat: after }
  } finally {
    closeSync(descriptor)
  }
}

/** Read a bounded prefix from one already-validated regular-file handle. */
/** Hash one stable regular file with bounded memory; size is not a read-allocation limit. */
export function hashRegularFileSync(source: string, expected?: { bytes: number; sha256?: string }): { bytes: number; sha256: string } {
  const input = openSync(source, 'r', 0o600)
  try {
    const before = fstatSync(input)
    if (!sameNamedFile(source, before) || !before.isFile()) throw Error('Source is not a stable regular file.')
    if (expected && before.size !== expected.bytes) throw Error('Source size changed.')
    const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024); let total = 0
    while (true) { const read = readSync(input, buffer, 0, buffer.length, null); if (!read) break; hash.update(buffer.subarray(0, read)); total += read }
    const after = fstatSync(input), sha256 = hash.digest('hex')
    if (total !== before.size || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || !sameNamedFile(source, after)) throw Error('Source changed while it was being hashed.')
    if (expected?.sha256 && sha256 !== expected.sha256) throw Error('Source hash does not match.')
    return { bytes: total, sha256 }
  } finally { closeSync(input) }
}

/** Stream one validated regular file into a new owner-only file using bounded memory. */
export function copyRegularFileVerifiedSync(source: string, destination: string, expected?: { bytes: number; sha256: string }): { bytes: number; sha256: string } {
  const input = openSync(source, 'r', 0o600)
  let output: number | null = null, created = false
  try {
    const before = fstatSync(input)
    if (!sameNamedFile(source, before) || !before.isFile() || before.size < 1) throw Error('Original source is not a stable regular file.')
    if (expected && before.size !== expected.bytes) throw Error('Original source size changed before it could be retained.')
    output = openSync(destination, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600); created = true
    const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024)
    let total = 0
    while (true) {
      const read = readSync(input, buffer, 0, buffer.length, null)
      if (!read) break
      hash.update(buffer.subarray(0, read)); total += read
      let written = 0
      while (written < read) written += writeSync(output, buffer, written, read - written)
    }
    const after = fstatSync(input), sha256 = hash.digest('hex')
    if (total !== before.size || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || !sameNamedFile(source, after)) throw Error('Original source changed while it was being retained.')
    if (expected && sha256 !== expected.sha256) throw Error('Original source hash changed before it could be retained.')
    fsyncSync(output); closeSync(output); output = null
    return { bytes: total, sha256 }
  } catch (error) {
    if (output !== null) { closeSync(output); output = null }
    if (created) try { unlinkSync(destination) } catch { /* partial destination already removed */ }
    throw error
  } finally { closeSync(input) }
}

export function readRegularHeadSync(path: string, limit: number): OpenedFile {
  if (!Number.isSafeInteger(limit) || limit < 1) throw Error('Invalid file read limit.')
  // The read-only descriptor cannot create a file; if that ever changes, its
  // explicit mode still prevents access by other users.
  const descriptor = openSync(path, 'r', 0o600)
  try {
    const before = fstatSync(descriptor)
    if (!sameNamedFile(path, before) || !before.isFile()) throw Error('Path is not a regular file.')
    const allocation = Buffer.alloc(Math.min(limit, before.size))
    const size = allocation.length ? readSync(descriptor, allocation, 0, allocation.length, 0) : 0
    const after = fstatSync(descriptor)
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      !sameNamedFile(path, after)
    ) throw Error('File changed while it was being read.')
    return { bytes: allocation.subarray(0, size), stat: after }
  } finally {
    closeSync(descriptor)
  }
}
