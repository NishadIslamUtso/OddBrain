import { inflateRawSync } from 'node:zlib'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createZip, crc32, safeEntryName } from '../src/main/vault/zip'

/**
 * The hand-rolled ZIP writer used by the deployable export.
 *
 * The archive is read back rather than handed to `unzip`, so it runs anywhere
 * node runs — and reading it back is the stronger check anyway: it proves the
 * container is well formed, not just that some tool tolerated it.
 */

const LOCAL = 0x04034b50

/** Parse an archive back into [{ name, content }]. */
function readZip(buffer: Buffer): Array<{ name: string; content: string; uncompressedSize: number }> {
  const entries: Array<{ name: string; content: string; uncompressedSize: number }> = []
  let index = 0
  while (index < buffer.length && buffer.readUInt32LE(index) === LOCAL) {
    const method = buffer.readUInt16LE(index + 8)
    const compressedSize = buffer.readUInt32LE(index + 18)
    const uncompressedSize = buffer.readUInt32LE(index + 22)
    const nameLength = buffer.readUInt16LE(index + 26)
    const name = buffer.subarray(index + 30, index + 30 + nameLength).toString('utf8')
    const payload = buffer.subarray(index + 30 + nameLength, index + 30 + nameLength + compressedSize)
    entries.push({
      name,
      content: (method === 8 ? inflateRawSync(payload) : payload).toString('utf8'),
      uncompressedSize,
    })
    index += 30 + nameLength + compressedSize
  }
  return entries
}

test('a zip round-trips: names, contents and sizes all survive', () => {
  const files = [
    { name: 'index.html', content: '<!doctype html><html><body>hi</body></html>' },
    { name: 'src/app.js', content: 'console.log("hello")' },
    { name: 'README.md', content: '# Artifact\n\nRun: npx serve .' },
  ]
  const entries = readZip(createZip(files))
  assert.deepEqual(
    entries.map(entry => entry.name),
    ['index.html', 'src/app.js', 'README.md']
  )
  for (const file of files) {
    const entry = entries.find(item => item.name === file.name)
    assert.equal(entry?.content, file.content)
    assert.equal(entry?.uncompressedSize, Buffer.byteLength(file.content, 'utf8'))
  }
})

test('compressible content is deflated, and the file is smaller for it', () => {
  const content = 'the same line over and over\n'.repeat(200)
  const archive = createZip([{ name: 'big.txt', content }])
  assert.equal(archive.readUInt16LE(8), 8, 'deflate, the method that compresses')
  assert.ok(archive.length < content.length, 'a compressible file gets smaller')
  assert.equal(readZip(archive)[0].content, content)
})

test('content that does not compress is stored instead of inflated', () => {
  // 200 random-ish bytes: deflating them would make the entry larger.
  const content = Array.from({ length: 200 }, (_, i) => String.fromCharCode(33 + ((i * 37) % 90))).join('')
  const archive = createZip([{ name: 'noise.txt', content }])
  assert.equal(readZip(archive)[0].content, content)
})

test('crc32 is the standard one', () => {
  // The check value every CRC-32 implementation is measured against.
  assert.equal(crc32(Buffer.from('123456789', 'utf8')), 0xcbf43926)
})

test('an entry name that could leave the archive is refused, never rewritten', () => {
  for (const name of ['../escape.txt', '/etc/passwd', 'a/../../b.txt', 'back\\slash.txt', 'C:drive.txt', 'dir//file.txt', './file.txt', 'x'.repeat(241), '']) {
    assert.throws(() => safeEntryName(name), /archive entry name/i, JSON.stringify(name))
  }
})

test('an empty archive and an oversized one are both refused', () => {
  assert.throws(() => createZip([]), /Nothing to archive/)
  const many = Array.from({ length: 201 }, (_, i) => ({ name: `file-${i}.txt`, content: 'x' }))
  assert.throws(() => createZip(many), /maximum of 200 files/i)
})

test('a name with an unusual but safe character survives unchanged', () => {
  // Non-ASCII names are the user's names; they are kept as written.
  assert.equal(safeEntryName('notes/Ünicode and spaces.md'), 'notes/Ünicode and spaces.md')
  const archive = createZip([{ name: 'notes/Ünicode and spaces.md', content: 'ok' }])
  assert.equal(readZip(archive)[0].name, 'notes/Ünicode and spaces.md')
  assert.equal(readZip(archive)[0].content, 'ok')
})

test('unzipArchive answers a zip bomb BEFORE it spends the memory', async () => {
  const { unzipArchive } = await import('../src/main/engine/downloads')
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')

  /** Rewrite the DECLARED uncompressed size of entry 0, on a COPY — the
   *  original archive stays honest for the later cases. */
  const lieAboutSize = (zip: Uint8Array, claimed: number): Uint8Array => {
    const copy = new Uint8Array(zip) // Buffer#slice is a view; a real copy it is
    const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength)
    for (let i = 0; i < copy.length - 4; i += 1) {
      if (view.getUint32(i, true) === 0x02014b50) {
        view.setUint32(i + 24, claimed, true)
        return copy
      }
    }
    throw new Error('no central directory found')
  }

  const dir = await mkdtemp(join(tmpdir(), 'zipbomb-'))
  const small = createZip([{ name: 'innocent.txt', content: 'tiny' }])
  const fsStub = { mkdir: async () => undefined, writeFile: async () => undefined }

  // One entry claiming more than the per-file cap: refused before inflation.
  const liar = lieAboutSize(small, 5 * 1024 * 1024 * 1024)
  const perFile = await unzipArchive(liar, join(dir, 'a'), { files: 200, perFile: 1024, totalUncompressed: 4096 }, fsStub)
  assert.equal(perFile.ok, false)
  assert.match(perFile.answer, /too big/)

  // Many honest-looking entries whose total blows the aggregate cap.
  const many = createZip(
    Array.from({ length: 50 }, (_, i) => ({ name: `f${i}.txt`, content: 'x'.repeat(100) })),
  )
  const aggregate = await unzipArchive(many, join(dir, 'b'), { files: 200, perFile: 1024, totalUncompressed: 1024 }, fsStub)
  assert.equal(aggregate.ok, false)
  assert.match(aggregate.answer, /cap/)

  // Forged LOW declarations: entries claiming zero uncompressed bytes while
  // actually inflating large. The declared aggregate passes every check; the
  // cap that holds is the one measured on the bytes that really came out.
  const lieLow = (zip: Uint8Array): Uint8Array => {
    const copy = new Uint8Array(zip)
    const view = new DataView(copy.buffer, copy.byteOffset, copy.byteLength)
    let patched = 0
    for (let i = 0; i < copy.length - 4; i += 1) {
      if (view.getUint32(i, true) === 0x02014b50) {
        view.setUint32(i + 24, 0, true)
        patched += 1
      }
    }
    assert.ok(patched >= 2, 'the fixture has two central entries to forge')
    return copy
  }
  const forged = createZip([
    { name: 'a.txt', content: 'y'.repeat(900) },
    { name: 'b.txt', content: 'z'.repeat(900) },
  ])
  const low = await unzipArchive(lieLow(forged), join(dir, 'd'), { files: 200, perFile: 1024, totalUncompressed: 100 }, fsStub)
  assert.equal(low.ok, false, 'declared-zero entries must not smuggle 1800 real bytes past a 100-byte cap')
  assert.match(low.answer, /cap/)

  // A modest archive within every cap still unpacks.
  const fine = await unzipArchive(small, join(dir, 'c'), { files: 200, perFile: 1024, totalUncompressed: 4096 }, fsStub)
  assert.equal(fine.ok, true, fine.answer)

  await rm(dir, { recursive: true, force: true })
})
