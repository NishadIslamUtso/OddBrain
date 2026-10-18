import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { exportVaultCopy } from '../src/main/vault/exportCopy'

/**
 * Track D: the portable vault copy. Researched: the "Obsidian export" tools
 * all produce a folder of markdown — which the vault already is. So the
 * export is a timestamped snapshot copy, nothing converted.
 */
test('the export copies every markdown file, structure intact', () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-export-'))
  const out = mkdtempSync(join(tmpdir(), 'oddbrain-export-out-'))
  try {
    mkdirSync(join(root, 'notes', 'deep'), { recursive: true })
    writeFileSync(join(root, 'readme.md'), '# The vault', 'utf8')
    writeFileSync(join(root, 'notes', 'plan.md'), '## Plan', 'utf8')
    writeFileSync(join(root, 'notes', 'deep', 'idea.md'), 'idea', 'utf8')
    writeFileSync(join(root, 'skip-me.png'), 'not markdown', 'utf8')

    const destination = join(out, 'vault-copy')
    const result = exportVaultCopy(root, destination)
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.count, 3)
    assert.equal(readFileSync(join(destination, 'readme.md'), 'utf8'), '# The vault')
    assert.equal(readFileSync(join(destination, 'notes', 'deep', 'idea.md'), 'utf8'), 'idea')
    assert.equal(existsSync(join(destination, 'skip-me.png')), false, 'only markdown travels')
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(out, { recursive: true, force: true })
  }
})

test('an empty vault says so instead of exporting nothing quietly', () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-export-empty-'))
  const out = mkdtempSync(join(tmpdir(), 'oddbrain-export-empty-out-'))
  try {
    const result = exportVaultCopy(root, join(out, 'copy'))
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.answer, /no markdown/)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(out, { recursive: true, force: true })
  }
})

test('the face: the vault screen has the export, wired through the real doors', () => {
  const read = (relative: string): string => readFileSync(`${process.cwd()}/${relative}`, 'utf8')
  assert.match(read('src/renderer/src/components/VaultView.tsx'), /Export copy/)
  assert.match(read('src/renderer/src/platform/bridge.ts'), /exportCopy/)
  const main = read('src/main/index.ts')
  const preload = read('src/preload/index.ts')
  assert.match(preload, /vault:export-copy/)
})
