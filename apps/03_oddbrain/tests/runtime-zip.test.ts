// @vitest-environment node
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateRawSync } from 'node:zlib'
import { createZip } from '../src/shared/lib/zip'
import { RUNTIME_ZIP_LIMITS, unzipRuntimeZip } from '../src/main/engine/runtimeZip'
import { createDownloadManager } from '../src/main/engine/downloads'

const buffer = (bytes: Uint8Array): Buffer => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)

/** A small *deflated* archive with data descriptor set. The local header has
 * zero sizes; the central directory is authoritative. Ollama's zip uses this. */
function deflatedZip(name: string, text: string): Buffer {
  const data = Buffer.from(text), fileName = Buffer.from(name), compressed = deflateRawSync(data)
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22)
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 6); local.writeUInt16LE(8, 8); local.writeUInt16LE(fileName.length, 26)
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 8); central.writeUInt16LE(8, 10)
  central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(fileName.length, 28)
  const centralAt = local.length + fileName.length + compressed.length
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + fileName.length, 12); end.writeUInt32LE(centralAt, 16)
  return Buffer.concat([local, fileName, compressed, central, fileName, end])
}

test('official-runtime path streams both stored and deflated files, verifies bytes and reports progress', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ob-zip-'))
  try {
    for (const zip of [buffer(createZip([{ name: 'ollama.exe', content: 'local bytes' }])), deflatedZip('lib/engine.dll', 'shared library data')]) {
      const archive = join(root, `archive-${zip.length}.zip`), target = join(root, `new-${zip.length}`)
      await writeFile(archive, zip)
      const progress: number[] = []
      const answer = await unzipRuntimeZip(archive, target, event => progress.push(event.got))
      assert.equal(answer.ok, true, answer.answer)
      assert.ok(progress.length >= 2 && progress.at(-1)! > 0)
      assert.equal(await readFile(join(target, zip[8] === 8 ? 'lib/engine.dll' : 'ollama.exe'), 'utf8'), zip[8] === 8 ? 'shared library data' : 'local bytes')
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('a 692 MB declaration fits ONLY the runtime limits, but dishonest bytes are refused without leaving an app', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ob-zip-cap-'))
  try {
    const zip = buffer(createZip([{ name: 'ollama.exe', content: 'tiny' }]))
    const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
    zip.writeUInt32LE(692 * 1024 * 1024, central + 24)
    const archive = join(root, 'runtime.zip'), target = join(root, 'app')
    await writeFile(archive, zip)
    const answer = await unzipRuntimeZip(archive, target)
    assert.equal(answer.ok, false)
    assert.doesNotMatch(answer.answer, /cap|Too many/i, 'the former 200 MB pack cap does not block the runtime')
    assert.equal(existsSync(target), false)
    zip.writeUInt32LE(RUNTIME_ZIP_LIMITS.perFile + 1, central + 24)
    await writeFile(archive, zip)
    assert.match((await unzipRuntimeZip(archive, target)).answer, /cap/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('zip slip, Windows path tricks, duplicates, ZIP64 and encrypted entries are refused before writing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ob-zip-wall-'))
  try {
    // createZip itself sanitizes names, so corrupt BOTH central and local names
    // after creation to exercise this reader's independent traversal guard.
    const slip = buffer(createZip([{ name: 'aa/escape.txt', content: 'no' }]))
    for (let at = slip.indexOf(Buffer.from('aa/escape.txt')); at >= 0; at = slip.indexOf(Buffer.from('aa/escape.txt'), at + 13)) slip.write('../escape.txt', at)
    const backslash = buffer(createZip([{ name: 'a/b.txt', content: 'no' }]))
    for (let at = backslash.indexOf(Buffer.from('a/b.txt')); at >= 0; at = backslash.indexOf(Buffer.from('a/b.txt'), at + 7)) backslash.write('a\\b.txt', at)
    const originals = [
      slip,
      buffer(createZip([{ name: 'CON.txt', content: 'no' }])),
      backslash,
      buffer(createZip([{ name: 'a.txt', content: 'one' }, { name: 'A.txt', content: 'two' }])),
    ]
    const zip64 = buffer(createZip([{ name: 'x', content: 'x' }])); zip64.writeUInt16LE(0xffff, zip64.length - 22 + 10)
    originals.push(zip64)
    const encrypted = buffer(createZip([{ name: 'x', content: 'x' }]))
    encrypted.writeUInt16LE(1, encrypted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 8)
    originals.push(encrypted)
    for (const [i, zip] of originals.entries()) {
      const archive = join(root, `${i}.zip`), target = join(root, `out-${i}`)
      await writeFile(archive, zip)
      const answer = await unzipRuntimeZip(archive, target)
      assert.equal(answer.ok, false, `${i}: ${answer.answer}`)
      assert.equal(existsSync(target), false, `${i} left files behind`)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('a failed CRC cleans the new folder; a successful streaming download records only the verified runtime', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ob-zip-stream-'))
  try {
    const zip = buffer(createZip([{ name: 'ollama.exe', content: 'real binary here' }]))
    const broken = Buffer.from(zip)
    broken[broken.indexOf(Buffer.from('real binary here'))] ^= 1
    await writeFile(join(root, 'broken.zip'), broken)
    const corrupt = await unzipRuntimeZip(join(root, 'broken.zip'), join(root, 'no-app'))
    assert.equal(corrupt.ok, false)
    assert.match(corrupt.answer, /CRC|damaged/)
    assert.equal(existsSync(join(root, 'no-app')), false)
    const ticks: string[] = []
    const manager = createDownloadManager({ root,
      fetchImpl: async () => ({ ok: true, status: 200, headers: { get: name => name === 'content-length' ? String(zip.length) : null },
        body: (async function* () { for (let at = 0; at < zip.length; at += 3) yield zip.subarray(at, at + 3) })() }),
      onTick: event => ticks.push(event.phase),
    })
    const installed = await manager.start('ollama')
    assert.equal(installed.ok, true, installed.answer)
    assert.ok(ticks.includes('unpacking') && ticks.includes('staged'))
    assert.equal(await readFile(join(root, 'ollama', 'app', 'ollama.exe'), 'utf8'), 'real binary here')
    assert.match((await manager.status()).ollama!.sha256, /^[0-9a-f]{64}$/)
    const failedManager = createDownloadManager({ root,
      fetchImpl: async () => ({ ok: true, headers: { get: () => String(broken.length) }, body: (async function* () { yield broken })() }),
    })
    assert.equal((await failedManager.start('ollama')).ok, false)
    assert.equal(await readFile(join(root, 'ollama', 'app', 'ollama.exe'), 'utf8'), 'real binary here', 'the old runtime survives a corrupt replacement')
    assert.ok(!(await (await import('node:fs/promises')).readdir(join(root, 'ollama'))).some(name => name.endsWith('.part')))
  } finally { await rm(root, { recursive: true, force: true }) }
})
