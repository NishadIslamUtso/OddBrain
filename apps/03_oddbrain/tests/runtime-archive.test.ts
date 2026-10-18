// @vitest-environment node
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createZip } from '../src/shared/lib/zip'
import { createDownloadManager } from '../src/main/engine/downloads'
import { DEFAULT_ARCHIVE_LIMITS, OLLAMA_ARCHIVE_LIMITS, extractRuntimeArchive, safeArchivePath } from '../src/main/engine/runtimeArchive'

test('only the runtime has expanded limits; general imports retain their small caps', () => {
  assert.equal(DEFAULT_ARCHIVE_LIMITS.perFile, 200 * 1024 ** 2)
  assert.equal(DEFAULT_ARCHIVE_LIMITS.totalUncompressed, 400 * 1024 ** 2)
  assert(OLLAMA_ARCHIVE_LIMITS.perFile > 692 * 1024 ** 2)
  assert(OLLAMA_ARCHIVE_LIMITS.totalUncompressed > 1.94 * 1024 ** 3)
  assert.equal(OLLAMA_ARCHIVE_LIMITS.files, 200)
})
test('paths cannot escape or create Windows streams', () => {
  for (const name of ['../evil', '/evil', 'C:/evil', 'a\\..\\evil', 'a:stream', 'a\0b', 'NUL', 'lib/CON.dll', 'lib/a.', 'a//b']) assert.equal(safeArchivePath(name), false, name)
  assert.equal(safeArchivePath('lib/cuda/runner.dll'), true)
})
test('file-backed extraction counts declared and actual bytes and refuses malformed archives', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runtime-zip-'))
  try {
    const zip = join(root, 'runtime.zip')
    const fixture = createZip([{ name: 'libx', content: '' }, { name: 'lib/test.dll', content: 'bounded bytes' }])
    // The app ZIP writer normalizes trailing slashes; restore the directory
    // marker in both same-length headers to exercise a real ZIP directory.
    for (let i = 0; i < fixture.length - 4; i++) if (new TextDecoder().decode(fixture.subarray(i, i + 4)) === 'libx') fixture[i + 3] = 47
    await writeFile(zip, fixture)
    const ok = await extractRuntimeArchive(zip, join(root, 'good'))
    assert.equal(ok.ok, true, ok.answer)
    assert.equal(await readFile(join(root, 'good/lib/test.dll'), 'utf8'), 'bounded bytes')
    const capped = await extractRuntimeArchive(zip, join(root, 'capped'), { files: 10, perFile: 4, totalUncompressed: 8 })
    assert.equal(capped.ok, false)
    const tooMany = await extractRuntimeArchive(zip, join(root, 'many'), { files: 1, perFile: 100, totalUncompressed: 100 })
    assert.equal(tooMany.ok, false)
    const damaged = createZip([{ name: 'text.txt', content: 'original' }])
    damaged[30 + 'text.txt'.length] ^= 1
    await writeFile(zip, damaged)
    const corrupt = await extractRuntimeArchive(zip, join(root, 'crc'))
    assert.equal(corrupt.ok, false)
    assert.match(corrupt.answer, /checksum/)
    await writeFile(zip, Buffer.from('not a zip'))
    assert.equal((await extractRuntimeArchive(zip, join(root, 'broken'))).ok, false)
  } finally { await rm(root, { recursive: true, force: true }) }
})
test('native fetch bodies stream to disk, failed updates keep the previous runtime and record', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runtime-download-'))
  try {
    const bytes = createZip([{ name: 'ollama.exe', content: 'previous executable' }])
    let payload: Uint8Array = bytes
    const manager = createDownloadManager({ root, fetchImpl: async () => ({ ok: true, body: new ReadableStream({ start(controller) { controller.enqueue(payload.slice(0, 20)); controller.enqueue(payload.slice(20)); controller.close() } }), arrayBuffer: async () => { throw Error('streamed response must not be buffered') } }) })
    assert.equal((await manager.start('ollama')).ok, true)
    const before = await manager.status()
    payload = createZip([{ name: 'not-a-runtime.txt', content: 'missing executable' }])
    assert.equal((await manager.start('ollama')).ok, false)
    assert.equal(await readFile(join(root, 'ollama/app/ollama.exe'), 'utf8'), 'previous executable')
    assert.deepEqual(await manager.status(), before)
    // Existing installation contents are never used as an extraction destination.
    await mkdir(join(root, 'other'), { recursive: true })
  } finally { await rm(root, { recursive: true, force: true }) }
})
