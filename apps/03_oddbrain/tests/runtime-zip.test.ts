import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RUNTIME_ZIP_LIMITS, unzipArchive } from '../src/main/engine/downloads'

/**
 * The real Ollama archive, measured 2026-10-17: 1.47 GB download, unpacks to
 * 1.94 GB, 87 entries, biggest single file 692 MB. The unpack gate used to
 * carry pack-sized caps (200 MB/file, 400 MB total) and refused exactly this
 * file. These pins keep the gate admitting the measured truth while the caps
 * that stop a lie stay in place.
 */

/** A central directory only: entries declare sizes, carry no payload. */
function declaringZip(entries: { name: string; declared: number }[]): Uint8Array {
  const enc = new TextEncoder()
  const locals: number[] = []
  const centrals: number[] = []
  let offset = 0
  for (const entry of entries) {
    const name = enc.encode(entry.name)
    const local = 30 + name.length
    locals.push(local)
    centrals.push(46 + name.length)
    offset += local
  }
  const centralStart = offset
  const total = centralStart + centrals.reduce((a, b) => a + b, 0) + 22
  const bytes = new Uint8Array(total)
  const view = new DataView(bytes.buffer)
  let at = 0
  let centralAt = centralStart
  entries.forEach((entry, index) => {
    const name = enc.encode(entry.name)
    // Local header: empty stored payload right after the header + name.
    view.setUint32(at, 0x04034b50, true)
    view.setUint16(at + 8, 0, true) // stored
    view.setUint32(at + 14, 0, true) // compressed size
    view.setUint32(at + 18, entry.declared, true)
    view.setUint16(at + 26, name.length, true)
    bytes.set(name, at + 30)
    // Central directory entry.
    view.setUint32(centralAt, 0x02014b50, true)
    view.setUint16(centralAt + 10, 0, true) // stored
    view.setUint32(centralAt + 20, 0, true)
    view.setUint32(centralAt + 24, entry.declared, true)
    view.setUint16(centralAt + 28, name.length, true)
    view.setUint32(centralAt + 42, at, true)
    bytes.set(name, centralAt + 46)
    at += locals[index]
    centralAt += centrals[index]
  })
  view.setUint32(centralAt, 0x06054b50, true)
  view.setUint16(centralAt + 8, entries.length, true)
  view.setUint16(centralAt + 10, entries.length, true)
  view.setUint32(centralAt + 12, centrals.reduce((a, b) => a + b, 0), true)
  view.setUint32(centralAt + 16, centralStart, true)
  return bytes
}

test('the runtime limits are the measured ones: 512 files / 1.5 GB each / 4 GB total', () => {
  assert.equal(RUNTIME_ZIP_LIMITS.files, 512)
  assert.equal(RUNTIME_ZIP_LIMITS.perFile, 1.5 * 1024 * 1024 * 1024)
  assert.equal(RUNTIME_ZIP_LIMITS.totalUncompressed, 4 * 1024 * 1024 * 1024)
})

test('the gate admits the shape of the real official archive', async () => {
  // 692 + 692 + 556 = 1.94 GB declared across three big files, method 0 with
  // an empty payload — only the DECLARED sizes are checked before inflating.
  const zip = declaringZip([
    { name: 'ollama.exe', declared: 692 * 1024 * 1024 },
    { name: 'cudnn.dll', declared: 692 * 1024 * 1024 },
    { name: 'rest.tar', declared: 556 * 1024 * 1024 },
  ])
  const target = await mkdtemp(join(tmpdir(), 'runtime-zip-'))
  try {
    const result = await unzipArchive(zip, target)
    assert.equal(result.ok, true, result.answer)
    assert.match(result.answer, /3 files/)
  } finally {
    await rm(target, { recursive: true, force: true })
  }
})

test('the caps that stop a lie are still there: files, per-file, total', async () => {
  const target = await mkdtemp(join(tmpdir(), 'runtime-zip-'))
  try {
    const many = declaringZip(
      Array.from({ length: 513 }, (_, i) => ({ name: `f${i}`, declared: 1 }))
    )
    const tooMany = await unzipArchive(many, join(target, 'many'))
    assert.equal(tooMany.ok, false)
    assert.match(tooMany.answer, /too many files/)

    const big = declaringZip([{ name: 'huge.bin', declared: 1.6 * 1024 * 1024 * 1024 }])
    const tooBig = await unzipArchive(big, join(target, 'big'))
    assert.equal(tooBig.ok, false)
    assert.match(tooBig.answer, /too big/)

    const total = declaringZip([
      { name: 'a', declared: 1.5 * 1024 * 1024 * 1024 },
      { name: 'b', declared: 1.5 * 1024 * 1024 * 1024 },
      { name: 'c', declared: 1.5 * 1024 * 1024 * 1024 },
    ])
    const tooMuch = await unzipArchive(total, join(target, 'total'))
    assert.equal(tooMuch.ok, false)
    assert.match(tooMuch.answer, /more than the cap/)
  } finally {
    await rm(target, { recursive: true, force: true })
  }
})
