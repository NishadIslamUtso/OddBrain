import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { packDigest, parseIndex, readIndex, installFromIndex } from '../src/main/engine/storeIndex'

/**
 * Mods Phase 2 — the pack index client.
 *
 * The rules under test: an index that cannot prove itself is refused in full
 * (never a partial list), a pack's checksum is recomputed from the real files
 * so an edited pack is refused, an entry whose source would leave the index
 * folder is named and dropped, and an install from a URL index does not
 * pretend to work.
 */

const write = (path: string, text: string): void => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text, 'utf8')
}

/** A real minimal pack, the same shape Phase 1 installs. */
const makePack = (dir: string, manifest: unknown, files: Record<string, string> = {}): string => {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest), 'utf8')
  for (const [name, text] of Object.entries(files)) {
    const path = join(dir, name)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text, 'utf8')
  }
  return dir
}

const manifest = {
  id: 'good-pack',
  name: 'Good pack',
  version: '1.0.0',
  author: 'tester',
  description: 'A pack reached through an index.',
  license: 'MIT',
  permissions: { shell: false },
  contributes: { skills: [], prompts: ['prompts/flash.md'], themes: [] },
}

const sha = (text: string): string => createHash('sha256').update(text).digest('hex')

test('packDigest is stable across reads and changes when a file changes', () => {
  const root = mkdtempSync(join(tmpdir(), 'pack-digest-'))
  try {
    write(join(root, 'manifest.json'), '{"id":"x"}')
    write(join(root, 'skills', 'a.md'), 'hello')
    const first = packDigest(root).digest
    const again = packDigest(root).digest
    assert.ok(first, 'digest computed')
    assert.equal(first, again, 'same files, same digest')
    write(join(root, 'skills', 'a.md'), 'hello!')
    assert.notEqual(packDigest(root).digest, first, 'one edited byte, different digest')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a bad index is refused in full, with the reason named', () => {
  assert.match((parseIndex('not json') as { problem: string }).problem, /not valid JSON/)
  assert.match((parseIndex('{"name":"X"}') as { problem: string }).problem, /packs array/)
  assert.match(
    (parseIndex('{"name":"X","packs":[{"id":"good","name":"G","version":"1.0.0","checksum":"nope","source":"g"}]}') as { problem: string })
      .problem,
    /sha-256 checksum/,
  )
  assert.match(
    (parseIndex(
      `{"name":"X","packs":[{"id":"good","name":"G","version":"1.0.0","checksum":"${sha('x')}","source":"../escape"}]}`,
    ) as { problem: string }).problem,
    /outside the index folder/,
  )
  assert.match(
    (parseIndex('{"name":"X","packs":[{"id":"Bad Id!","name":"G","version":"1.0.0"}]}') as { problem: string }).problem,
    /real id/,
  )
})

test('browsing a folder index verifies every entry against the real files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pack-index-'))
  try {
    const good = makePack(join(root, 'good-pack'), manifest, { 'skills/a.md': '# skill', 'prompts/flash.md': 'Make cards from: $input' })
    const digest = packDigest(good).digest!
    makePack(join(root, 'edited-pack'), { ...manifest, id: 'edited-pack', name: 'Tampered' }, { 'skills/a.md': 'text' })
    write(
      join(root, 'index.json'),
      JSON.stringify({
        name: 'Test index',
        packs: [
          { id: 'good-pack', name: 'Good pack', version: '1.0.0', author: 'tester', checksum: digest, source: 'good-pack' },
          { id: 'edited-pack', name: 'Tampered', version: '1.0.0', author: 'tester', checksum: digest, source: 'edited-pack' },
          { id: 'gone-pack', name: 'Gone', version: '1.0.0', author: 'tester', checksum: digest, source: 'gone-pack' },
        ],
      }),
    )

    const result = await readIndex({ kind: 'folder', path: root })
    assert.ok(result.ok)
    if (!result.ok) return
    assert.equal(result.name, 'Test index')
    const byId = new Map(result.packs.map(pack => [pack.id, pack]))
    assert.equal(byId.get('good-pack')?.verified, true, 'matching checksum verifies')
    assert.equal(byId.get('edited-pack')?.verified, false, 'tampered pack is refused')
    assert.match(byId.get('edited-pack')?.problem ?? '', /checksum/)
    assert.equal(byId.get('gone-pack')?.verified, false, 'missing folder is refused')
    assert.match(byId.get('gone-pack')?.problem ?? '', /manifest/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('install from a folder index copies the verified pack; a URL index refuses honestly', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pack-install-'))
  const store = mkdtempSync(join(tmpdir(), 'pack-store-'))
  try {
    const pack = makePack(join(root, 'good-pack'), manifest, { 'prompts/flash.md': 'Make cards from: $input' })
    const digest = packDigest(pack).digest!
    write(
      join(root, 'index.json'),
      JSON.stringify({
        name: 'Test index',
        packs: [{ id: 'good-pack', name: 'Good pack', version: '1.0.0', author: 'tester', checksum: digest, source: 'good-pack' }],
      }),
    )
    const targets = { storeRoot: store, claudeSkillsDir: join(store, 'claude'), agySkillsDir: join(store, 'agy') }
    const ok = await installFromIndex({ kind: 'folder', path: root }, 'good-pack', targets)
    assert.ok(ok.ok, ok.ok ? ok.answer : 'install should have passed the checksum')
    if (ok.ok) assert.match(ok.folder, /good-pack/)
    const missing = await installFromIndex({ kind: 'folder', path: root }, 'other-pack', targets)
    assert.equal(missing.ok, false)
    if (!missing.ok) assert.match(missing.answer, /does not list/)
    const indexUrl = 'https://example.org/index.json'
    const served: Record<string, string> = {
      [indexUrl]: JSON.stringify({
        name: 'Test index',
        packs: [{ id: 'good-pack', name: 'Good pack', version: '1.0.0', author: 'tester', checksum: digest, source: 'good-pack' }],
      }),
    }
    const url = await installFromIndex({ kind: 'url', url: indexUrl }, 'good-pack', targets, async (asked) => {
      assert.ok(asked in served, `unexpected fetch: ${asked}`)
      return served[asked]!
    })
    assert.equal(url.ok, false)
    // This index names no files, so nothing could be checked on arrival.
    if (!url.ok) assert.match(url.answer, /lists no files/)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(store, { recursive: true, force: true })
  }
})
