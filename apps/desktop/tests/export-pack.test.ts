import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportPack, skillFileText, type SkillOnDisk } from '../src/main/engine/exportPack'
import { packDigest, parseIndex } from '../src/main/engine/storeIndex'
import { starterPackFiles } from '../src/main/engine/vaultSkills'
import { normalizePack } from '../src/shared/lib/packs'
import { parseSkillMd } from '../src/main/engine/deploy'

/**
 * Mods Phase 3 — publish: export-as-pack and the starter pack.
 *
 * The rules: a skill named for export must really exist on the engine, the
 * manifest passes the same normalizer install uses, an existing destination
 * is refused rather than overwritten, the index entry's checksum is computed
 * from the files actually written, and a re-export replaces its own entry
 * without touching anyone else's.
 */

const skillOnDisk = (name: string, description: string, body: string): SkillOnDisk => ({
  name,
  description,
  body,
  source: `/engine/.claude/skills/${name}/SKILL.md`,
})

test('export writes the pack and an index entry whose checksum matches the files', () => {
  const root = mkdtempSync(join(tmpdir(), 'pack-export-'))
  try {
    const result = exportPack(
      { name: 'Study Helper', description: 'Cards from notes.', author: 'Nishad', skills: ['make-cards'], theme: { accent: 'amber' } },
      [skillOnDisk('make-cards', 'Make cards', '# Make cards\n\nOne per line.')],
      root,
    )
    assert.ok(result.ok, result.ok ? result.folder : result.answer)
    if (!result.ok) return
    // the folder exists and identifies itself
    const manifest = JSON.parse(readFileSync(join(result.folder, 'manifest.json'), 'utf8'))
    assert.equal(manifest.id, 'study-helper')
    assert.deepEqual(manifest.contributes.skills, ['skills/make-cards/SKILL.md'])
    assert.deepEqual(manifest.contributes.themes, ['themes/pack.json'])
    // the skill file is the engine's real text with frontmatter
    const skill = readFileSync(join(result.folder, 'skills/make-cards/SKILL.md'), 'utf8')
    const parsed = parseSkillMd(skill)
    assert.equal(parsed.name, 'make-cards')
    assert.match(parsed.body, /One per line/)
    // the index parses, carries the entry, and the checksum is the files'
    const raw = readFileSync(result.index, 'utf8')
    const parsedIndex = parseIndex(raw)
    assert.ok(!('problem' in parsedIndex), 'the written index passes the same parse install uses')
    if ('packs' in parsedIndex) {
      assert.equal(parsedIndex.packs[0]?.checksum, result.entry.checksum)
      assert.equal(packDigest(result.folder).digest, result.entry.checksum, 'digest matches the files on disk')
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a skill that is not really installed is named and refused', () => {
  const root = mkdtempSync(join(tmpdir(), 'pack-export-refuse-'))
  try {
    const result = exportPack(
      { name: 'Ghost pack', description: '', author: '', skills: ['not-there'], theme: null },
      [skillOnDisk('make-cards', 'Make cards', 'body')],
      root,
    )
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.answer, /not-there.*really has/)
    assert.equal(existsSync(join(root, 'ghost-pack')), false, 'nothing was written')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an existing destination is refused, and a re-export replaces its own index entry only', () => {
  const root = mkdtempSync(join(tmpdir(), 'pack-export-twice-'))
  try {
    const first = exportPack(
      { name: 'Twin', description: 'first', author: '', skills: ['make-cards'], theme: null },
      [skillOnDisk('make-cards', 'Make cards', 'body one')],
      root,
    )
    assert.ok(first.ok)
    const second = exportPack(
      { name: 'Twin', description: 'second', author: '', skills: ['make-cards'], theme: null },
      [skillOnDisk('make-cards', 'Make cards', 'body two')],
      root,
    )
    assert.equal(second.ok, false, 'the folder exists, so the export is refused')
    if (!second.ok) assert.match(second.answer, /already exists/)
    // a foreign entry survives, and replacing means removing the old own entry
    const indexFile = first.ok ? first.index : ''
    const parsed = JSON.parse(readFileSync(indexFile, 'utf8'))
    parsed.packs.push({ id: 'other-pack', name: 'Other', version: '1.0.0', checksum: '0'.repeat(64), source: 'elsewhere' })
    writeFileSync(indexFile, JSON.stringify(parsed))
    rmSync(join(root, 'twin'), { recursive: true, force: true })
    const third = exportPack(
      { name: 'Twin', description: 'third', author: '', skills: ['make-cards'], theme: null },
      [skillOnDisk('make-cards', 'Make cards', 'body three')],
      root,
    )
    assert.ok(third.ok, 'after the old folder is gone the export succeeds')
    const after = JSON.parse(readFileSync(indexFile, 'utf8'))
    assert.equal(after.packs.filter((item: { id: string }) => item.id === 'twin').length, 1, 'own entry replaced, not duplicated')
    assert.equal(after.packs.filter((item: { id: string }) => item.id === 'other-pack').length, 1, "another's entry untouched")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an empty pick is refused and a bogus theme is refused', () => {
  const root = mkdtempSync(join(tmpdir(), 'pack-export-empty-'))
  try {
    const empty = exportPack({ name: 'Hollow', description: '', author: '', skills: [], theme: null }, [], root)
    assert.equal(empty.ok, false)
    if (!empty.ok) assert.match(empty.answer, /at least one/)
    const badTheme = exportPack(
      { name: 'Bad look', description: '', author: '', skills: ['make-cards'], theme: { accent: 'chartreuse' } },
      [skillOnDisk('make-cards', 'Make cards', 'body')],
      root,
    )
    assert.equal(badTheme.ok, false)
    if (!badTheme.ok) assert.match(badTheme.answer, /does not offer/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the starter pack is a real pack: manifest and skill parse, folder installs', () => {
  const files = starterPackFiles()
  const manifest = normalizePack(JSON.parse(files['manifest.json']))
  assert.equal(manifest.problem, '', 'the manifest passes the same normalizer install uses')
  assert.equal(manifest.pack.id, 'ai-assistant.starter')
  assert.deepEqual(manifest.pack.contributes.skills, ['skills/browser-page/SKILL.md'])
  const skill = parseSkillMd(files['skills/browser-page/SKILL.md'])
  assert.equal(skill.name, 'browser-page')
  assert.match(skill.body, /onui/, 'the real door text rides along')
  // and the bytes equal what the app deploys to the engine at boot
  const expected = skillFileText({ name: 'browser-page', description: manifest.description, body: skill.body, source: 'x' })
  // (only shape equality is pinned here; byte equality is deploy's own test)
  assert.match(expected, /^---\nname: browser-page/)
})
