// @vitest-environment node
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createZip } from '../src/main/vault/zip'
import { downloadToFile } from '../src/main/engine/downloadStream'
import { unpackRuntime, RUNTIME_ZIP_LIMITS, runtimeEntryName } from '../src/main/engine/runtimeArchive'
import { createDownloadManager } from '../src/main/engine/downloads'

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'ob-runtime-'))
  try { await run(root) } finally { await rm(root, { recursive: true, force: true }) }
}

test('runtime limits accommodate the measured official ZIP without changing pack caps', () => {
  assert.equal(RUNTIME_ZIP_LIMITS.files, 512)
  assert.equal(RUNTIME_ZIP_LIMITS.perFile, 1.5 * 1024 ** 3)
  assert.equal(RUNTIME_ZIP_LIMITS.totalUncompressed, 4 * 1024 ** 3)
})

test('network streaming writes and hashes incrementally without requesting an arrayBuffer', async () => fixture(async root => {
  let reads = 0
  async function* body() { for (const word of ['hello', ' ', 'brain']) { reads++; yield Buffer.from(word) } }
  const ticks: number[] = []
  const target = join(root, 'download')
  const result = await downloadToFile({ ok: true, body: body(), arrayBuffer: async () => { throw Error('must not buffer') } }, target, 20, got => ticks.push(got))
  assert.equal(reads, 3); assert.equal(result.bytes, 11)
  assert.equal(await readFile(target, 'utf8'), 'hello brain')
  assert.match(result.sha256, /^[a-f0-9]{64}$/)
  assert.equal(ticks.at(-1), 11)
}))

test('stream caps, interrupted bodies and false lengths remove partial files', async () => fixture(async root => {
  for (const scenario of ['cap', 'interrupted', 'length']) {
    async function* body() { yield Buffer.alloc(5); if (scenario === 'interrupted') throw Error('lost connection'); yield Buffer.alloc(5) }
    const target = join(root, scenario)
    await assert.rejects(downloadToFile({ ok: true, body: body(), headers: { get: () => scenario === 'length' ? '11' : null } }, target, scenario === 'cap' ? 6 : 20, () => undefined))
    await assert.rejects(readFile(target), /ENOENT/)
  }
}))

test('runtime ZIP replaces a previous install only after every entry passes', async () => fixture(async root => {
  const destination = join(root, 'app'), archive = join(root, 'runtime.zip')
  await mkdir(destination); await writeFile(join(destination, 'old.exe'), 'previous')
  await writeFile(archive, createZip([{ name: 'ollama.exe', content: 'new runtime' }, { name: 'lib/a.dll', content: 'dependency' }]))
  const ticks: number[] = []
  const good = await unpackRuntime(archive, destination, got => ticks.push(got))
  assert.equal(good.ok, true, good.answer)
  assert.equal(await readFile(join(destination, 'ollama.exe'), 'utf8'), 'new runtime')
  await assert.rejects(readFile(join(destination, 'old.exe')), /ENOENT/)
  assert.equal(ticks.at(-1), 21)
  assert.deepEqual((await readdir(root)).sort(), ['app', 'runtime.zip'])
}))

test('bad CRC, sizes, encryption and zip slip leave the old runtime intact and no staging debris', async () => fixture(async root => {
  const destination = join(root, 'app'), archive = join(root, 'runtime.zip')
  await mkdir(destination); await writeFile(join(destination, 'old.exe'), 'previous')
  const good = createZip([{ name: 'safe.exe', content: 'new runtime' }])
  const central = good.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  for (const kind of ['crc', 'size', 'encrypted', 'path', 'cap']) {
    const zip = Buffer.from(good)
    if (kind === 'crc') zip.writeUInt32LE(123, central + 16)
    if (kind === 'size') zip.writeUInt32LE(2, central + 24)
    if (kind === 'encrypted') zip.writeUInt16LE(1, central + 8)
    if (kind === 'path') Buffer.from('../x.exe').copy(zip, central + 46)
    await writeFile(archive, zip)
    const result = await unpackRuntime(archive, destination, () => undefined, kind === 'cap' ? { files: 2, perFile: 6, totalUncompressed: 10 } : RUNTIME_ZIP_LIMITS)
    assert.equal(result.ok, false, kind)
    assert.equal(await readFile(join(destination, 'old.exe'), 'utf8'), 'previous')
    assert.deepEqual((await readdir(root)).sort(), ['app', 'runtime.zip'])
  }
}))

test('Windows archive aliases, traversal and special paths are refused on every host OS', () => {
  for (const name of ['../x', 'x/../y', 'C:/x', '/root', '\\server\\x', 'a\\b', 'a:stream', 'CON.txt', 'aux', 'a./b', 'a /b', 'a//b', 'a\0b']) assert.throws(() => runtimeEntryName(name), /unsafe/, name)
  assert.equal(runtimeEntryName('lib/ollama.dll'), 'lib/ollama.dll')
  assert.equal(runtimeEntryName('lib/'), 'lib/')
})

test('the manager streams a runtime, emits extraction progress and records only success', async () => fixture(async root => {
  const zip = createZip([{ name: 'ollama.exe', content: 'a runtime fixture' }])
  const phases: string[] = []
  const manager = createDownloadManager({ root, fetchImpl: async () => ({ ok: true, body: (async function* () { yield zip.subarray(0, 20); yield zip.subarray(20) })() }), onTick: tick => phases.push(tick.phase) })
  const result = await manager.start('ollama')
  assert.equal(result.ok, true, result.answer)
  assert(phases.includes('extracting')); assert.equal(phases.at(-1), 'staged')
  assert.equal(await readFile(join(root, 'ollama', 'app', 'ollama.exe'), 'utf8'), 'a runtime fixture')
  assert.equal((await manager.status()).ollama?.engine, 'ollama')
  const badRoot = join(root, 'bad')
  const bad = createDownloadManager({ root: badRoot, fetchImpl: async () => ({ ok: true, body: (async function* () { yield Buffer.from('corrupt') })() }) })
  assert.equal((await bad.start('ollama')).ok, false)
  assert.deepEqual(await bad.status(), {})
}))
