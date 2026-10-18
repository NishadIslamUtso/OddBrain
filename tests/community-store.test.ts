import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'
import { packDigest, parseIndex, readIndex, installFromIndex, type FileLoader } from '../src/main/engine/storeIndex'

/**
 * The community store — the app ships with a REAL one: this repo's own
 * store/ folder, answered over https. The index is pinned by this test:
 * its entries must parse, name every file on disk, and match the digest of
 * the files actually committed. A store the app cannot prove is a store the
 * app must not offer.
 */

const STORE = fileURLToPath(new URL('../store', import.meta.url))

test('the store folder holds a manifest-bearing pack for every listed entry — no ghosts', () => {
  const raw = readFileSync(join(STORE, 'index.json'), 'utf8')
  const parsed = parseIndex(raw)
  if ('problem' in parsed) throw new Error(parsed.problem)
  // The folder index read: every entry must come back verified straight from disk.
  return readIndex({ kind: 'folder', path: STORE }).then(answer => {
    assert.ok(answer.ok, answer.ok ? '' : answer.problem)
    if (answer.ok) {
      for (const entry of answer.packs) {
        assert.equal(entry.verified, true, `${entry.id} verifies from the shipped folder`)
      }
    }
  })
})

test('the shipped store index is real: it parses, lists its files, and the checksums hold', () => {
  const raw = readFileSync(join(STORE, 'index.json'), 'utf8')
  const parsed = parseIndex(raw)
  if ('problem' in parsed) throw new Error(`the shipped store does not parse: ${parsed.problem}`)
  assert.ok(parsed.packs.length >= 1, 'the store lists at least one pack')
  for (const entry of parsed.packs) {
    const folder = join(STORE, entry.source)
    assert.ok(existsSync(join(folder, 'manifest.json')), `${entry.id}: manifest on disk`)
    assert.ok(entry.files && entry.files.length, `${entry.id}: the index names its files`)
    assert.deepEqual(entry.files, walk(folder).sort(), `${entry.id}: the file list IS the folder`)
    const { digest, problem } = packDigest(folder)
    assert.equal(problem, undefined)
    assert.equal(digest, entry.checksum, `${entry.id}: pinned checksum matches the committed files`)
  }
})

test('a URL entry with files downloads, digest-checks, and installs through the normal path', async () => {
  const root = mkdtempSync(join(tmpdir(), 'remote-index-'))
  const store = mkdtempSync(join(tmpdir(), 'remote-store-'))
  try {
    const manifest = { id: 'remote.pack', name: 'Remote pack', version: '1.0.0', author: 'tester', description: '', license: 'MIT', permissions: { shell: false }, contributes: { skills: ['skills/a/SKILL.md'], prompts: [], themes: [] } }
    const files: Record<string, string> = {
      'manifest.json': JSON.stringify(manifest),
      'skills/a/SKILL.md': '# A\n\nDo the thing.',
    }
    const index = {
      name: 'Remote index',
      packs: [{
        id: 'remote.pack',
        name: 'Remote pack',
        version: '1.0.0',
        author: 'tester',
        description: '',
        permissions: { shell: false },
        checksum: digestFrom(files),
        source: 'packs/remote.pack',
        files: Object.keys(files).sort(),
      }],
    }
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'index.json'), JSON.stringify(index), 'utf8')
    const indexUrl = 'https://store.example/org/index.json'
    const served: Record<string, string> = {
      [indexUrl]: JSON.stringify(index),
      ...Object.fromEntries(Object.keys(files).map(relative => [
        `https://store.example/org/packs/remote.pack/${relative}`,
        files[relative]!,
      ])),
    }
    // The loader plays the store host: exact URLs, real bytes, no network.
    const loader: FileLoader = async (url) => {
      assert.ok(url in served, `unexpected fetch: ${url}`)
      return served[url]!
    }
    const targets = { storeRoot: store, claudeSkillsDir: join(store, 'claude'), agySkillsDir: join(store, 'agy') }
    const answer = await installFromIndex({ kind: 'url', url: indexUrl }, 'remote.pack', targets, loader)
    assert.ok(answer.ok, answer.ok ? '' : answer.answer)
    if (answer.ok) {
      assert.match(answer.answer, /downloaded, checksum verified/)
      assert.ok(existsSync(join(store, 'remote.pack', 'manifest.json')))
      assert.ok(existsSync(join(targets.claudeSkillsDir, 'a', 'SKILL.md')), 'the skill reached the engine folder')
    }
    // A tampered byte in transit is refused and installs nothing.
    const badLoader: FileLoader = async (url) => {
      if (url === indexUrl) return served[indexUrl]!
      const marker = '/packs/remote.pack/'
      const relative = url.slice(url.indexOf(marker) + marker.length)
      return relative === 'skills/a/SKILL.md' ? '# A\n\nTAMPERED.' : files[relative]!
    }
    const store2 = mkdtempSync(join(tmpdir(), 'remote-store2-'))
    try {
      const tampered = await installFromIndex(
        { kind: 'url', url: 'https://store.example/org/index.json' },
        'remote.pack',
        { storeRoot: store2, claudeSkillsDir: join(store2, 'claude'), agySkillsDir: join(store2, 'agy') },
        badLoader,
      )
      assert.equal(tampered.ok, false)
      if (!tampered.ok) assert.match(tampered.answer, /do not match the checksum/)
      assert.equal(existsSync(join(store2, 'remote.pack')), false, 'nothing was installed')
    } finally {
      rmSync(store2, { recursive: true, force: true })
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(store, { recursive: true, force: true })
  }
})

test('a URL entry is read honestly: verified stays false, downloadable says what is possible', async () => {
  const base = { version: '1.0.0', author: 'x', checksum: 'a'.repeat(64), source: 'p' }
  const index = {
    name: 'Read index',
    packs: [
      { id: 'with.files', name: 'With files', ...base, files: ['manifest.json'] },
      { id: 'no.files', name: 'No files', ...base },
    ],
  }
  const answer = await readIndex({ kind: 'url', url: 'https://store.example/org/index.json' }, async url => {
    assert.equal(url, 'https://store.example/org/index.json')
    return JSON.stringify(index)
  })
  assert.ok(answer.ok, answer.ok ? '' : answer.problem)
  if (!answer.ok) return
  const withFiles = answer.packs.find(entry => entry.id === 'with.files')
  const noFiles = answer.packs.find(entry => entry.id === 'no.files')
  assert.equal(withFiles!.downloadable, true)
  assert.equal(withFiles!.problem, '')
  assert.equal(noFiles!.downloadable, false)
  assert.match(noFiles!.problem, /lists no files/)
})

test('a files list that leaves the folder is refused in full', () => {
  const bad = { name: 'Bad index', packs: [{ id: 'bad.pack', name: 'Bad', version: '1.0.0', author: 'x', checksum: 'a'.repeat(64), source: 'p', files: ['../escape.md'] }] }
  const parsed = parseIndex(JSON.stringify(bad))
  if ('packs' in parsed) throw new Error('an escaping file list parsed')
  else assert.match(parsed.problem, /outside its folder/)
})

/* ---- helpers ---- */

const digestFrom = (files: Record<string, string>): string => {
  // The same digest rule as packDigest, over in-memory files: per-file
  // sha-256 over the sorted relative paths.
  const hash = createHash('sha256')
  for (const rel of Object.keys(files).sort()) {
    hash.update(rel)
    hash.update('\n')
    hash.update(createHash('sha256').update(files[rel]!).digest('hex'))
    hash.update('\n')
  }
  return hash.digest('hex')
}

void dirname

const walk = (root: string, dir = ''): string[] => {
  const out: string[] = []
  for (const name of readdirSync(dir ? join(root, dir) : root).sort()) {
    const rel = dir ? `${dir}/${name}` : name
    if (statSync(join(root, rel)).isDirectory()) out.push(...walk(root, rel))
    else out.push(rel)
  }
  return out
}
