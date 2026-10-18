import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SKILL_CATALOG, catalogEntry } from '../src/shared/lib/skillCatalog'
import { installCatalogSkill } from '../src/main/engine/skillCatalogInstall'

/**
 * Track D: skills sourcing. Researched live: anthropics/skills is the
 * canonical open collection; these entries were verified against the repo's
 * real folder list. One click lands a skill in every engine's own folder
 * through the deploy Track A already ships.
 */

const SKILL_MD = `---
name: docx
description: Word document creation and editing.
---

# docx

Make the document.
`

test('the catalog is curated, real, and fetches only from one host', () => {
  assert.ok(SKILL_CATALOG.length >= 8)
  const names = new Set(SKILL_CATALOG.map((skill) => skill.name))
  assert.equal(names.size, SKILL_CATALOG.length, 'no duplicates')
  for (const skill of SKILL_CATALOG) {
    assert.match(skill.source, /^https:\/\/raw\.githubusercontent\.com\/anthropics\/skills\/main\/skills\/[a-z0-9-]+\/SKILL\.md$/)
    assert.match(skill.what, /[a-z]/)
    assert.equal(catalogEntry(skill.name)?.name, skill.name)
  }
  assert.equal(catalogEntry('../../etc/passwd'), null, 'a name is only a name')
  assert.equal(catalogEntry(''), null)
})

test('an install validates the name, fetches the file, and deploys to both engines', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-catalog-'))
  try {
    const targets = { claudeSkillsDir: join(root, 'claude'), agySkillsDir: join(root, 'agy') }
    const fetchImpl = (async () =>
      ({ ok: true, status: 200, text: async () => SKILL_MD })) as unknown as typeof fetch
    const result = await installCatalogSkill('docx', targets, fetchImpl)
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.written.length, 2, 'one file per engine')
    const claude = readFileSync(join(root, 'claude', 'docx', 'SKILL.md'), 'utf8')
    const agy = readFileSync(join(root, 'agy', 'docx.md'), 'utf8')
    assert.match(agy, /^---\nname: docx\n/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the door refuses names outside the catalog and says honestly when offline', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-catalog2-'))
  try {
    const targets = { claudeSkillsDir: join(root, 'claude'), agySkillsDir: join(root, 'agy') }
    const rogue = await installCatalogSkill('../machine', targets, (async () => ({ ok: true, status: 200, text: async () => 'x' })) as unknown as typeof fetch)
    assert.equal(rogue.ok, false)
    if (!rogue.ok) assert.match(rogue.answer, /not in the catalog/)

    const offline = await installCatalogSkill('docx', targets, (async () => {
      throw new Error('no network')
    }) as unknown as typeof fetch)
    assert.equal(offline.ok, false)
    if (!offline.ok) assert.match(offline.answer, /online/)

    const failing = await installCatalogSkill('docx', targets, (async () => ({ ok: false, status: 404, text: async () => '' })) as unknown as typeof fetch)
    assert.equal(failing.ok, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the face: a Settings section lists the catalog and installs through the door', () => {
  const read = (relative: string): string => readFileSync(`${process.cwd()}/${relative}`, 'utf8')
  const settings = read('src/renderer/src/components/SettingsView.tsx')
  assert.match(settings, /id: 'skills'/)
  assert.match(settings, /SkillsCatalogSection/)
  const section = read('src/renderer/src/components/SkillsCatalogSection.tsx')
  assert.match(section, /SKILL_CATALOG/)
  assert.match(section, /installCatalog/)
  const main = read('src/main/index.ts')
  assert.match(main, /skills:install-catalog/)
  assert.match(main, /installCatalogSkill/)
  const preload = read('src/preload/index.ts')
  assert.match(preload, /skills:install-catalog/)
  const bridge = read('src/renderer/src/platform/bridge.ts')
  assert.match(bridge, /installCatalog/)
})
