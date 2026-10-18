import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, dirname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (name) => readFileSync(resolve(root, name), 'utf8')

test('workspace has one application, one lockfile, and working root commands', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.deepEqual(pkg.workspaces, ['apps/desktop'])
  assert.ok(existsSync(resolve(root, 'package-lock.json')))
  assert.ok(!existsSync(resolve(root, 'apps/desktop/package-lock.json')))
  for (const command of ['dev', 'dev:web', 'test', 'typecheck', 'build', 'build:web', 'smoke', 'dist:win']) {
    assert.equal(typeof pkg.scripts[command], 'string', command)
  }
  for (const old of ['00_LIVING_DOCS', 'docs', 'spec', 'memory', 'apps/03_oddbrain', 'apps/01_claude-exact-pixel-clone', 'apps/02_electron-claude-clone-v6']) {
    assert.ok(!existsSync(resolve(root, old)), `Legacy tree remains: ${old}`)
  }
})

test('README is the only maintained Markdown document', () => {
  const documents = []
  function walk(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'out', 'dist', 'dist-web', 'coverage', 'qa-ui'].includes(entry.name)) continue
      const path = resolve(folder, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.md$/i.test(entry.name) && !path.startsWith(resolve(root, 'apps/desktop/store/packs') + sep)) documents.push(path)
    }
  }
  walk(root)
  assert.deepEqual(documents, [resolve(root, 'README.md')])
})

test('bundled skill and prompt Markdown is recreated losslessly from its manifest', () => {
  const result = spawnSync(process.execPath, ['apps/desktop/scripts/prepare-assets.mjs'], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const manifest = JSON.parse(read('apps/desktop/store/bundled-markdown.json'))
  assert.ok(Object.keys(manifest).length > 0)
  for (const [name, content] of Object.entries(manifest)) {
    assert.ok(name.startsWith('packs/') && name.endsWith('.md'))
    assert.equal(read('apps/desktop/store/' + name), content, name)
  }
})

test('packaged extension and store resolve from the new application location', () => {
  const builder = read('apps/desktop/electron-builder.yml')
  assert.ok(builder.includes('from: ../../extension'))
  for (const path of ['extension/manifest.json', 'extension/background.js', 'apps/desktop/store/index.json', 'apps/desktop/resources/icon.ico']) {
    assert.ok(existsSync(resolve(root, path)), path)
  }
})


test('bundled store preserves every catalog file and pinned checksum', () => {
  const index = JSON.parse(read('apps/desktop/store/index.json'))
  for (const pack of index.packs) {
    const hash = createHash('sha256')
    for (const name of [...pack.files].sort()) {
      const content = readFileSync(resolve(root, 'apps/desktop/store', pack.source, name))
      hash.update(name); hash.update('\n')
      hash.update(createHash('sha256').update(content).digest('hex')); hash.update('\n')
    }
    assert.equal(hash.digest('hex'), pack.checksum, pack.id)
  }
})
