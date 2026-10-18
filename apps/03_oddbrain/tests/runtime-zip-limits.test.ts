import test from 'node:test'
import assert from 'node:assert/strict'
import { createZip } from '../src/main/vault/zip'
import { RUNTIME_ZIP_LIMITS } from '../src/shared/lib/engineDownloads'

/**
 * The unpack caps, against the archive they exist for.
 *
 * The bug this pins: the app downloaded Ollama's official Windows zip in full
 * and then refused to unpack it, because `unzipArchive`'s defaults are sized
 * for a theme pack (200 files / 200 MB per file / 400 MB total). The refusal
 * read like the publisher's fault. It was ours.
 *
 * Measured live 2026-10-17: 1.47 GB compressed, 87 entries, 1.94 GB unpacked,
 * biggest single file 692 MB (`lib/ollama/cuda_v12/cublasLt64_12.dll`).
 *
 * The fixture below carries those DECLARED sizes with a byte of real content
 * each. That is not a shortcut: the caps are checked against the central
 * directory's declared sizes BEFORE a single byte is inflated — which is the
 * exact gate that refused the real archive. Inflating 1.94 GB of genuine bytes
 * here would only re-prove `inflateRawSync` and would not run on CI.
 */

/** Rewrite every entry's DECLARED uncompressed size, on a copy. */
const declareSizes = (zip: Uint8Array, sizes: number[]): Uint8Array => {
  const copy = new Uint8Array(zip) // Buffer#slice is a view; a real copy it is
  const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength)
  let end = -1
  for (let i = copy.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break }
  }
  assert.ok(end >= 0, 'the fixture has an end-of-central-directory')
  const count = view.getUint16(end + 10, true)
  assert.equal(count, sizes.length, 'one declared size per entry')
  let offset = view.getUint32(end + 16, true)
  for (let index = 0; index < count; index += 1) {
    assert.equal(view.getUint32(offset, true), 0x02014b50, 'a central directory entry')
    view.setUint32(offset + 24, sizes[index]!, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    offset += 46 + nameLength + extraLength + commentLength
  }
  return copy
}

const MB = 1024 * 1024
const GB = 1024 * MB
const fsStub = { mkdir: async () => undefined, writeFile: async () => undefined }

/** 87 entries: the 692 MB CUDA dll, then 86 more summing to ~1.94 GB total. */
const ollamaShaped = (): { zip: Uint8Array; total: number } => {
  const biggest = 692 * MB
  const rest = Math.floor((1.94 * GB - biggest) / 86)
  const sizes = [biggest, ...Array.from({ length: 86 }, () => rest)]
  const zip = createZip(
    sizes.map((_, index) => ({
      name: index === 0 ? 'lib/ollama/cuda_v12/cublasLt64_12.dll' : `lib/ollama/part-${index}.bin`,
      content: 'x',
    })),
  )
  return { zip: declareSizes(new Uint8Array(zip), sizes), total: sizes.reduce((a, b) => a + b, 0) }
}

test('the runtime caps are sized from the measured archive, with headroom', () => {
  const { total } = ollamaShaped()
  assert.equal(RUNTIME_ZIP_LIMITS.files, 512, '87 real entries, room to grow')
  assert.ok(RUNTIME_ZIP_LIMITS.perFile > 692 * MB, 'the biggest real file fits')
  assert.ok(RUNTIME_ZIP_LIMITS.totalUncompressed > total, 'the real total fits')
  // Headroom, not a blank cheque: a hostile archive is still refused.
  assert.ok(RUNTIME_ZIP_LIMITS.perFile <= 2 * GB, 'per-file is bounded')
  assert.ok(RUNTIME_ZIP_LIMITS.totalUncompressed <= 4 * GB, 'the total is bounded')
})

test('the pack-sized defaults refuse Ollama\u2019s real shape; the runtime caps accept it', async () => {
  const { unzipArchive } = await import('../src/main/engine/downloads')
  const { zip } = ollamaShaped()

  // The defaults, unchanged, still refuse it — that is the bug, reproduced.
  // Named per-file first, because 692 MB trips that gate before the total.
  const refused = await unzipArchive(zip, '/tmp/never-written/a', undefined, fsStub)
  assert.equal(refused.ok, false, 'the pack defaults must still refuse a runtime-sized archive')
  assert.match(refused.answer, /too big|cap/, 'and say which limit it hit')

  // The runtime caps accept the same bytes.
  const accepted = await unzipArchive(zip, '/tmp/never-written/b', RUNTIME_ZIP_LIMITS, fsStub)
  assert.equal(accepted.ok, true, accepted.answer)
  assert.match(accepted.answer, /87 files/, 'all 87 entries came through')
})

test('the runtime caps still refuse a genuine bomb', async () => {
  const { unzipArchive } = await import('../src/main/engine/downloads')

  // One entry claiming more than the runtime per-file cap.
  const huge = createZip([{ name: 'a.dll', content: 'x' }])
  const perFile = await unzipArchive(
    declareSizes(new Uint8Array(huge), [RUNTIME_ZIP_LIMITS.perFile + 1]),
    '/tmp/never-written/c',
    RUNTIME_ZIP_LIMITS,
    fsStub,
  )
  assert.equal(perFile.ok, false, 'a single file past the runtime cap is refused')
  assert.match(perFile.answer, /too big/)

  // Many entries whose declared total blows the runtime aggregate cap.
  const many = createZip(
    Array.from({ length: 100 }, (_, index) => ({ name: `f${index}.bin`, content: 'x' })),
  )
  const each = Math.ceil((RUNTIME_ZIP_LIMITS.totalUncompressed + GB) / 100)
  const aggregate = await unzipArchive(
    declareSizes(new Uint8Array(many), Array.from({ length: 100 }, () => each)),
    '/tmp/never-written/d',
    RUNTIME_ZIP_LIMITS,
    fsStub,
  )
  assert.equal(aggregate.ok, false, 'a total past the runtime cap is refused')
  assert.match(aggregate.answer, /cap/)
})

test('a path that could leave the archive is still refused at runtime size', async () => {
  const { unzipArchive } = await import('../src/main/engine/downloads')
  const escaping = createZip([{ name: 'ok.dll', content: 'x' }, { name: 'sub/also-ok.dll', content: 'x' }])
  // Rename the first entry to an escape by rebuilding with a hostile name is
  // refused by createZip itself, so patch the name in place instead.
  const zip = new Uint8Array(escaping)
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  let end = -1
  for (let i = zip.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break }
  }
  let offset = view.getUint32(end + 16, true)
  const localOffset = view.getUint32(offset + 42, true)
  // Overwrite the LOCAL header's name with an escape of the same length.
  const localNameLength = view.getUint16(localOffset + 26, true)
  const at = localOffset + 30
  const escape = '../escape.dll'.padEnd(localNameLength, 'z').slice(0, localNameLength)
  new TextEncoder().encodeInto(escape, zip.subarray(at, at + localNameLength))
  // The central directory carries the same name; unzipArchive reads THAT one.
  const cdNameLength = view.getUint16(offset + 28, true)
  const cdAt = offset + 46
  new TextEncoder().encodeInto(
    '../escape.dll'.padEnd(cdNameLength, 'z').slice(0, cdNameLength),
    zip.subarray(cdAt, cdAt + cdNameLength),
  )
  const answer = await unzipArchive(zip, '/tmp/never-written/e', RUNTIME_ZIP_LIMITS, fsStub)
  assert.equal(answer.ok, false, 'zip-slip is refused whatever the caps')
  assert.match(answer.answer, /unsafe path/)
})
