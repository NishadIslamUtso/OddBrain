import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parse as parseYaml } from 'yaml'
import { SKILL_CATALOG, catalogEntry } from '../src/shared/lib/skillCatalog'
import { installCatalogSkill } from '../src/main/engine/skillCatalogInstall'
import { extractSkillBundle } from '../src/main/engine/skillBundle'
import { parseSkillMd } from '../src/main/engine/deploy'

const REVISION = '0123456789abcdef0123456789abcdef01234567'
const ARCHIVE = Buffer.from(
  'UEsDBBQAAAAIAGlvUl3BJeh/awAAAH8AAABEAAAAc2tpbGxzLTAxMjM0NTY3ODlhYmNkZWYwMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njcvc2tpbGxzL2RvY3gvU0tJTEwubWRNzLsOwjAMRuHdT/ErzAl7V9iRWGDoYtUBIgW71AmXtwfBwvzpnBgjKV/zALHpSZJ9WsrciumAcLBFvuB4lHbBGG7dWpYx4M61ZwergFFNz3A+Zfz1KVD8zGmF7W5zJNp3xQ993cxqml+J3lBLAwQUAAAACABpb1Jdo750LhAAAAAOAAAARwAAAHNraWxscy0wMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3L3NraWxscy9kb2N4L0xJQ0VOU0UudHh0y8lMTs0rTlVIqixJLeYCAFBLAwQUAAAACABpb1JdbOGxtg4AAAAMAAAASwAAAHNraWxscy0wMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3L3NraWxscy9kb2N4L3NjcmlwdHMvdG9vbC5weSsoyswr0VDKz1bS5AIAUEsDBBQAAAAIAGlvUl1wFC66CQAAAAcAAABFAAAAc2tpbGxzLTAxMjM0NTY3ODlhYmNkZWYwMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njcvc2tpbGxzL290aGVyL1NLSUxMLm1kU1bwL8lILQIAUEsBAhQDFAAAAAgAaW9SXcEl6H9rAAAAfwAAAEQAAAAAAAAAAAAAAIABAAAAAHNraWxscy0wMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3L3NraWxscy9kb2N4L1NLSUxMLm1kUEsBAhQDFAAAAAgAaW9SXaO+dC4QAAAADgAAAEcAAAAAAAAAAAAAAIABzQAAAHNraWxscy0wMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3L3NraWxscy9kb2N4L0xJQ0VOU0UudHh0UEsBAhQDFAAAAAgAaW9SXWzhsbYOAAAADAAAAEsAAAAAAAAAAAAAAIABQgEAAHNraWxscy0wMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3L3NraWxscy9kb2N4L3NjcmlwdHMvdG9vbC5weVBLAQIUAxQAAAAIAGlvUl1wFC66CQAAAAcAAABFAAAAAAAAAAAAAACAAbkBAABza2lsbHMtMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWYwMTIzNDU2Ny9za2lsbHMvb3RoZXIvU0tJTEwubWRQSwUGAAAAAAQABADTAQAAJQIAAAAA',
  'base64',
)

const liveFetch = (async (input: string | URL) => {
  const url = String(input)
  if (url === 'https://api.github.com/repos/anthropics/skills/commits/main') {
    return new Response(JSON.stringify({ sha: REVISION }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  if (url === `https://codeload.github.com/anthropics/skills/zip/${REVISION}`) {
    return new Response(ARCHIVE, { status: 200, headers: { 'content-length': String(ARCHIVE.length), 'content-type': 'application/zip' } })
  }
  return new Response('', { status: 404 })
}) as typeof fetch

test('the catalog is curated and can resolve only Anthropic skill directories', () => {
  assert.ok(SKILL_CATALOG.length >= 8)
  const names = new Set(SKILL_CATALOG.map(skill => skill.name))
  assert.equal(names.size, SKILL_CATALOG.length)
  for (const skill of SKILL_CATALOG) {
    assert.equal(skill.repo, 'anthropics/skills')
    assert.match(skill.source, /^https:\/\/raw\.githubusercontent\.com\/anthropics\/skills\/main\/skills\/[a-z0-9-]+\/SKILL\.md$/)
    assert.equal(catalogEntry(skill.name)?.name, skill.name)
  }
  assert.equal(catalogEntry('../../etc/passwd'), null)
  assert.equal(catalogEntry(''), null)
})

test('archive extraction selects only the requested complete directory', async () => {
  const bundle = await extractSkillBundle(ARCHIVE, 'docx', REVISION)
  assert.equal(bundle.revision, REVISION)
  assert.deepEqual([...bundle.files.keys()].sort(), ['LICENSE.txt', 'SKILL.md', 'scripts/tool.py'])
  assert.equal(bundle.files.get('scripts/tool.py')?.toString(), 'print("ok")\n')
})

test('archive extraction rejects a path that would leave the skill directory', async () => {
  const damaged = Buffer.from(ARCHIVE)
  const from = Buffer.from('scripts/tool.py')
  const to = Buffer.from('../evilfile.txt')
  assert.equal(from.length, to.length)
  let changed = 0
  for (let at = damaged.indexOf(from); at >= 0; at = damaged.indexOf(from, at + to.length)) {
    to.copy(damaged, at)
    changed += 1
  }
  assert.equal(changed, 2, 'both the local and central ZIP paths were changed')
  await assert.rejects(extractSkillBundle(damaged, 'docx', REVISION), /invalid relative path|outside its own folder/)
})

test('an install pins a commit and preserves instructions, license and support files for both engines', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-catalog-'))
  try {
    const targets = { claudeSkillsDir: join(root, 'claude'), agySkillsDir: join(root, 'agy') }
    const result = await installCatalogSkill('docx', targets, liveFetch)
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.revision, REVISION)
    assert.equal(result.written.length, 7, 'three complete Claude files, three agy support files, and agy command file')
    assert.equal(readFileSync(join(root, 'claude', 'docx', 'scripts', 'tool.py'), 'utf8'), 'print("ok")\n')
    assert.equal(readFileSync(join(root, 'agy', 'docx', 'LICENSE.txt'), 'utf8'), 'license bytes\n')
    const agy = readFileSync(join(root, 'agy', 'docx.md'), 'utf8')
    const parsed = parseSkillMd(agy)
    assert.equal(parsed.name, 'docx')
    assert.match(parsed.description, /quoted/)
    assert.match(parsed.body, /Support files.*\.agents\/skills\/docx/s)
    const header = /^---\n([\s\S]*?)\n---/.exec(agy)?.[1] ?? ''
    assert.equal(typeof (parseYaml(header) as { description?: unknown }).description, 'string', 'generated frontmatter remains valid YAML')

    const stale = join(root, 'claude', 'docx', 'removed-upstream-file.txt')
    writeFileSync(stale, 'stale')
    const refreshed = await installCatalogSkill('docx', targets, liveFetch)
    assert.equal(refreshed.ok, false)
    assert.equal(readFileSync(stale, 'utf8'), 'stale', 'a repeated install must not erase existing or hand-written engine files')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the door refuses names outside the catalog and reports network or archive failures without writing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-catalog2-'))
  try {
    const targets = { claudeSkillsDir: join(root, 'claude'), agySkillsDir: join(root, 'agy') }
    const rogue = await installCatalogSkill('../machine', targets, liveFetch)
    assert.equal(rogue.ok, false)
    if (!rogue.ok) assert.match(rogue.answer, /not in the catalog/)

    const offline = await installCatalogSkill('docx', targets, (async () => { throw new Error('network unavailable') }) as typeof fetch)
    assert.equal(offline.ok, false)
    if (!offline.ok) assert.match(offline.answer, /network unavailable/)
    assert.equal(existsSync(join(root, 'claude')), false)

    const damaged = await installCatalogSkill('docx', targets, (async (input: string | URL) =>
      String(input).includes('/commits/')
        ? new Response(JSON.stringify({ sha: REVISION }), { status: 200 })
        : new Response(Buffer.from('not a zip'), { status: 200 })) as typeof fetch)
    assert.equal(damaged.ok, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the face lists the catalog and installs through the guarded IPC door', () => {
  const read = (relative: string): string => readFileSync(`${process.cwd()}/${relative}`, 'utf8')
  assert.match(read('src/renderer/src/components/SettingsView.tsx'), /id: 'skills'/)
  assert.match(read('src/renderer/src/components/SkillsCatalogSection.tsx'), /installCatalog/)
  assert.match(read('src/main/index.ts'), /skills:install-catalog/)
  assert.match(read('src/preload/index.ts'), /skills:install-catalog/)
  assert.match(read('src/renderer/src/platform/bridge.ts'), /installCatalog/)
})
