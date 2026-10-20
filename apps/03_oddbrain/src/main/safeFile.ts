import { closeSync, constants, fstatSync, openSync, readSync, type Stats } from 'node:fs'

export type OpenedFile = { bytes: Buffer; stat: Stats }

/**
 * Open once, validate the opened object, and read from that descriptor. This
 * avoids the check-then-open race that path-based stat/read pairs create.
 * O_NOFOLLOW is enforced where the host supports it; callers still validate
 * parent paths when they accept owner-selected locations.
 */
export function readRegularFileSync(path: string, limit: number): OpenedFile {
  if (!Number.isSafeInteger(limit) || limit < 0) throw Error('Invalid file read limit.')
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
  try {
    const before = fstatSync(descriptor)
    if (!before.isFile() || before.size > limit) throw Error(`File is not a regular file within the ${limit}-byte read limit.`)
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
      before.ctimeMs !== after.ctimeMs
    ) throw Error('File changed while it was being read.')
    return { bytes: allocation.subarray(0, size), stat: after }
  } finally {
    closeSync(descriptor)
  }
}

/** Read a bounded prefix from one already-validated regular-file handle. */
export function readRegularHeadSync(path: string, limit: number): OpenedFile {
  if (!Number.isSafeInteger(limit) || limit < 1) throw Error('Invalid file read limit.')
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
  try {
    const before = fstatSync(descriptor)
    if (!before.isFile()) throw Error('Path is not a regular file.')
    const allocation = Buffer.alloc(Math.min(limit, before.size))
    const size = allocation.length ? readSync(descriptor, allocation, 0, allocation.length, 0) : 0
    const after = fstatSync(descriptor)
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs
    ) throw Error('File changed while it was being read.')
    return { bytes: allocation.subarray(0, size), stat: after }
  } finally {
    closeSync(descriptor)
  }
}
