import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync, symlinkSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describePermissions, normalizePack } from '../src/shared/lib/packs'
import { installPackFromFolder, listPacks, removePack, type PackTargets } from '../src/main/engine/packs'

/**
 * Settings > Extensions — mods, Phase 1.
 *
 * The rules under test are the security story, not the plumbing:
 *   · a pack is a folder with a manifest; anything unrecognised is REFUSED,
 *     never installed with a warning;
 *   · every contributed file is read from inside the pack folder only;
 *   · removing undoes exactly the engine files the install record names, and
 *     a record that points outside the skill folders is ignored.
 */

const makeTargets = (): PackTargets => {
  const root = mkdtempSync(join(tmpdir(), 'packs-test-'))
  const targets: PackTargets = {
    storeRoot: join(root, 'store'),
    claudeSkillsDir: join(root, 'claude-skills'),
    agySkillsDir: join(root, 'agy-skills'),
  }
  mkdirSync(targets.storeRoot, { recursive: true })
  mkdirSync(targets.claudeSkillsDir, { recursive: true })
  mkdirSync(targets.agySkillsDir, { recursive: true })
  return targets
}

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

const goodManifest = {
  id: 'test-pack',
  name: 'Test Pack',
  version: '1.0.0',
  author: 'Someone',
  description: 'A pack for the tests.',
  license: 'MIT',
  permissions: { files: 'read:vault', web: ['example.com'], shell: false },
  contributes: {
    skills: ['skills/writer/SKILL.md'],
    prompts: ['prompts/standup.md'],
    themes: ['themes/paper.json'],
  },
}

const skillMd = `---
name: test-writer
description: Writes in the test's voice.
---

Write like the tests: short sentences, plain words.`

test('normalizePack accepts a good manifest and fills defaults', () => {
  const { pack, problem } = normalizePack(goodManifest)
  assert.equal(problem, '')
  assert.equal(pack.id, 'test-pack')
  assert.equal(pack.author, 'Someone')
  assert.equal(pack.license, 'MIT')
  assert.deepEqual(pack.permissions, { files: 'read:vault', web: ['example.com'], shell: false })
})

test('normalizePack refuses the shapes that would matter', () => {
  for (const [name, manifest] of Object.entries({
    'no id': { ...goodManifest, id: '' },
    'bad id (path-like)': { ...goodManifest, id: '../evil' },
    'no version': { ...goodManifest, version: 'one.two' },
    'unknown field': { ...goodManifest, extras: true },
    'unknown permission': { ...goodManifest, permissions: { wifi: true } },
    'shell true': { ...goodManifest, permissions: { shell: true } },
    'bad files permission': { ...goodManifest, permissions: { files: 'write:everything' } },
    'bad domain': { ...goodManifest, permissions: { web: ['not a domain'] } },
    'traversal path': { ...goodManifest, contributes: { skills: ['../outside.md'], prompts: [], themes: [] } },
    'absolute path': { ...goodManifest, contributes: { skills: ['/etc/passwd'], prompts: [], themes: [] } },
    'wrong extension': { ...goodManifest, contributes: { skills: ['skills/writer/SKILL.exe'], prompts: [], themes: [] } },
    'contributes nothing': { ...goodManifest, contributes: {} },
  } as Record<string, unknown>)) {
    const { problem } = normalizePack(manifest)
    assert.ok(problem, `${name} should be refused`)
  }
})

test('describePermissions says everything in plain words', () => {
  const { pack } = normalizePack(goodManifest)
  const said = describePermissions(pack).join('\n')
  assert.match(said, /Runs no commands\./)
  assert.match(said, /permission card asks you first/i)
  assert.match(said, /example\.com/)
  assert.match(said, /folder you can read and delete/)
})

test('install copies the pack, deploys skills, returns prompts and themes', () => {
  const targets = makeTargets()
  // The picked folder lives wherever the person keeps it — not inside the store.
  const folder = makePack(join(mkdtempSync(join(tmpdir(), 'packs-src-')), 'staging'), goodManifest, {
    'skills/writer/SKILL.md': skillMd,
    'prompts/standup.md': '# standup\n\nThree lines on what moved today.',
    'themes/paper.json': JSON.stringify({ name: 'Paper', appearance: { accent: 'teal', width: 'focused' } }),
  })
  const answer = installPackFromFolder(folder, targets)
  assert.ok(answer.ok, 'install should succeed')
  if (!answer.ok) return
  // The readable record, where the app said it would be.
  assert.ok(existsSync(join(targets.storeRoot, 'test-pack', 'manifest.json')))
  assert.ok(existsSync(join(targets.storeRoot, 'test-pack', '.installed.json')))
  // Skills in BOTH engines' folders, exactly the files the record names.
  assert.equal(answer.written.length, 2, 'one file per engine')
  for (const written of answer.written) {
    assert.ok(existsSync(written), written)
    assert.match(readFileSync(written, 'utf8'), /short sentences/)
  }
  for (const dir of [targets.claudeSkillsDir, targets.agySkillsDir]) {
    assert.ok(readdirSync(dir).some(name => name.startsWith('test-writer')), `deployed in ${dir}`)
  }
  // Prompts and themes go back for the renderer to place.
  assert.equal(answer.prompts.length, 1)
  assert.match(answer.prompts[0].name, /standup/)
  assert.equal(answer.themes.length, 1)
  assert.equal(answer.themes[0].appearance.accent, 'teal')
  // The list door sees it.
  assert.equal(listPacks(targets.storeRoot).length, 1)
})

test('install refuses a manifestless folder, a lie, and a second copy', () => {
  const targets = makeTargets()
  // No manifest.
  const bare = join(targets.storeRoot, 'bare')
  mkdirSync(bare, { recursive: true })
  assert.equal(installPackFromFolder(bare, targets).ok, false)
  // A skill the manifest promises but the folder lacks.
  makePack(join(targets.storeRoot, 'liar'), goodManifest, { 'themes/paper.json': '{"name":"P","appearance":{"accent":"teal"}}' })
  const lie = installPackFromFolder(join(targets.storeRoot, 'liar'), targets)
  assert.equal(lie.ok, false)
  if (!lie.ok) assert.match(lie.answer, /missing/)
  // A theme json that is not JSON.
  makePack(join(targets.storeRoot, 'broken'), goodManifest, {
    'skills/writer/SKILL.md': skillMd,
    'prompts/standup.md': 'hello',
    'themes/paper.json': 'not json',
  })
  assert.equal(installPackFromFolder(join(targets.storeRoot, 'broken'), targets).ok, false)
  // Success, then the same id again.
  makePack(join(targets.storeRoot, 'good'), goodManifest, {
    'skills/writer/SKILL.md': skillMd,
    'prompts/standup.md': 'hello',
    'themes/paper.json': '{"name":"P","appearance":{"accent":"teal"}}',
  })
  assert.ok(installPackFromFolder(join(targets.storeRoot, 'good'), targets).ok)
  const again = installPackFromFolder(join(targets.storeRoot, 'good'), targets)
  assert.equal(again.ok, false)
  if (!again.ok) assert.match(again.answer, /already installed/)
})

test('install never overwrites an existing engine skill', () => {
  const targets = makeTargets()
  const existing = join(targets.claudeSkillsDir, 'test-writer', 'SKILL.md')
  mkdirSync(join(existing, '..'), { recursive: true })
  writeFileSync(existing, 'owner bytes', 'utf8')
  const manifest = { ...goodManifest, contributes: { skills: ['skills/writer/SKILL.md'], prompts: [], themes: [] } }
  const source = makePack(join(mkdtempSync(join(tmpdir(), 'packs-conflict-')), 'pack'), manifest, { 'skills/writer/SKILL.md': skillMd })
  const answer = installPackFromFolder(source, targets)
  assert.equal(answer.ok, false)
  if (!answer.ok) assert.match(answer.answer, /would overwrite an existing engine skill/)
  assert.equal(readFileSync(existing, 'utf8'), 'owner bytes')
  assert.equal(existsSync(join(targets.storeRoot, 'test-pack')), false)
  assert.equal(readdirSync(targets.agySkillsDir).length, 0)
})

test('a mid-deploy failure rolls back the store copy and every new engine file', () => {
  const targets = makeTargets()
  rmSync(targets.agySkillsDir, { recursive: true, force: true })
  writeFileSync(targets.agySkillsDir, 'not a directory', 'utf8')
  const manifest = { ...goodManifest, contributes: { skills: ['skills/writer/SKILL.md'], prompts: [], themes: [] } }
  const source = makePack(join(mkdtempSync(join(tmpdir(), 'packs-rollback-')), 'pack'), manifest, { 'skills/writer/SKILL.md': skillMd })
  const answer = installPackFromFolder(source, targets)
  assert.equal(answer.ok, false)
  if (!answer.ok) assert.match(answer.answer, /rolled back/)
  assert.equal(existsSync(join(targets.storeRoot, 'test-pack')), false)
  assert.equal(existsSync(join(targets.claudeSkillsDir, 'test-writer', 'SKILL.md')), false)
})

test('pack installation refuses links to bytes outside the selected folder', () => {
  if (process.platform === 'win32') return
  const targets = makeTargets()
  const source = makePack(join(mkdtempSync(join(tmpdir(), 'packs-link-')), 'pack'), { ...goodManifest, contributes: { skills: [], prompts: ['prompts/standup.md'], themes: [] } })
  const outside = join(mkdtempSync(join(tmpdir(), 'packs-secret-')), 'secret.md')
  writeFileSync(outside, 'private outside text', 'utf8')
  mkdirSync(join(source, 'prompts'), { recursive: true })
  symlinkSync(outside, join(source, 'prompts', 'standup.md'))
  const answer = installPackFromFolder(source, targets)
  assert.equal(answer.ok, false)
  if (!answer.ok) assert.match(answer.answer, /symbolic link/)
  assert.equal(existsSync(join(targets.storeRoot, 'test-pack')), false)
})

test('a traversal contribution is refused before anything is written', () => {
  const targets = makeTargets()
  const outside = join(targets.storeRoot, 'outside.md')
  writeFileSync(outside, 'secret', 'utf8')
  makePack(join(targets.storeRoot, 'sneak'), { ...goodManifest, contributes: { skills: ['skills/a.md'], prompts: ['../outside.md'], themes: [] } }, { 'skills/a.md': skillMd })
  const answer = installPackFromFolder(join(targets.storeRoot, 'sneak'), targets)
  assert.equal(answer.ok, false)
  assert.ok(existsSync(outside), 'nothing outside was touched, whatever the manifest said')
})

test('remove undoes the deployed skills and the folder — and nothing else', () => {
  const targets = makeTargets()
  const manifest = { ...goodManifest, contributes: { skills: ['skills/writer/SKILL.md'], prompts: [], themes: [] } }
  makePack(join(targets.storeRoot, 'gone-soon'), manifest, { 'skills/writer/SKILL.md': skillMd })
  const answer = installPackFromFolder(join(targets.storeRoot, 'gone-soon'), targets)
  assert.ok(answer.ok)
  if (!answer.ok) return
  assert.equal(answer.written.length, 2)
  const before = readdirSync(targets.claudeSkillsDir).length
  const outside = join(targets.storeRoot, 'precious.md')
  writeFileSync(outside, 'keep me', 'utf8')
  // Tamper: the record now names a file outside the skill folders.
  const record = join(targets.storeRoot, 'test-pack', '.installed.json')
  const parsed = JSON.parse(readFileSync(record, 'utf8')) as { written: string[] }
  writeFileSync(record, JSON.stringify({ ...parsed, written: [...parsed.written, outside] }), 'utf8')
  const removal = removePack('test-pack', targets.storeRoot, targets)
  assert.ok(removal.ok, removal.ok ? '' : removal.answer)
  // The copy in the store is gone; the folder the person picked stays theirs.
  assert.equal(existsSync(join(targets.storeRoot, 'test-pack')), false, 'the installed pack is gone')
  assert.ok(existsSync(join(targets.storeRoot, 'gone-soon')), 'the picked folder is left alone')
  assert.equal(readdirSync(targets.claudeSkillsDir).length, before - 1, 'the deployed skill is undone')
  assert.ok(existsSync(outside), 'a record pointing outside the skill folders is ignored')
})

test('remove refuses ids that are not pack ids', () => {
  const targets = makeTargets()
  assert.equal(removePack('', targets.storeRoot, targets).ok, false)
  assert.equal(removePack('..', targets.storeRoot, targets).ok, false)
  assert.equal(removePack('no-such-pack', targets.storeRoot, targets).ok, false)
})
