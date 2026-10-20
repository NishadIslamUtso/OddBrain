import { afterEach, expect, test } from 'vitest'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSkillAuthoring, readInstalledSkills, skillDraftText } from '../src/main/engine/installedSkills'
import { createMcpReview, inspectNativeMcp } from '../src/main/engine/mcpReview'
import { commitConfigs } from '../src/main/engine/configTransaction'
import type { SkillDraft } from '../src/shared/lib/installedSkills'
const roots: string[] = []
function root() { const p = mkdtempSync(join(tmpdir(), 'oddbrain-extension-review-')); roots.push(p); return p }
afterEach(() => roots.splice(0).forEach(p => rmSync(p, { recursive: true, force: true })))
const draft: SkillDraft = { engine: 'agy', name: 'plain-notes', description: 'Write plain notes', body: 'Keep original quotations.\nDo not invent sources.\n', requirements: 'No extra programs', replaceExisting: false }
test('skill preview and denial create no directories or files', () => {
  const dir = root(), service = createSkillAuthoring(() => join(dir, 'skills'), () => 'scope')
  const preview = service.preview(draft)
  expect(existsSync(join(dir, 'skills'))).toBe(false)
  expect(preview.after).toContain(draft.body)
  expect(service.decide(preview.token, 'deny').ok).toBe(true)
  expect(existsSync(join(dir, 'skills'))).toBe(false)
})
test('approved skill has the native folder layout; inventory makes no loaded/auth/use claims', () => {
  const dir = root(), service = createSkillAuthoring(() => dir, () => 'scope'), preview = service.preview(draft)
  expect(service.decide(preview.token, 'allow').ok).toBe(true)
  const file = join(dir, draft.name, 'SKILL.md')
  expect(readFileSync(file, 'utf8')).toBe(skillDraftText(draft))
  const inventory = readInstalledSkills([{ engine: 'agy', path: dir }])
  expect(inventory.entries[0]).toMatchObject({ format: 'skill-folder', states: { installed: 'observed', enabled: 'unknown', loaded: 'unknown', authenticated: 'unknown', used: 'unknown' } })
  expect(service.decide(preview.token, 'allow').ok).toBe(false)
})
test('existing skill replacement requires a separate explicit choice and preserves displaced bytes', () => {
  const dir = root(), service = createSkillAuthoring(() => dir, () => 'scope')
  const first = service.preview(draft); service.decide(first.token, 'allow')
  expect(() => service.preview(draft)).toThrow(/already exists/)
  const next = service.preview({ ...draft, body: 'New instructions', replaceExisting: true }), result = service.decide(next.token, 'allow')
  expect(result.ok).toBe(true)
  expect(readFileSync(result.recoveryPath!, 'utf8')).toBe(skillDraftText(draft))
})
test('changed authority invalidates skill approval without creating a directory', () => {
  const dir = root(); let scope = 'one'
  const service = createSkillAuthoring(() => join(dir, 'skills'), () => scope), review = service.preview(draft)
  scope = 'two'; expect(service.decide(review.token, 'allow').ok).toBe(false)
  expect(existsSync(join(dir, 'skills'))).toBe(false)
})
test('skill names and Unicode size limits refuse instead of escaping or clipping', () => {
  expect(() => skillDraftText({ ...draft, name: '../outside' })).toThrow()
  expect(() => skillDraftText({ ...draft, body: 'ব'.repeat(9000) })).toThrow(/24 KB/)
})
function mcp() {
  const dir = root(), centralFile = join(dir, 'central.json'); let authority = 'one'
  return { dir, centralFile, service: createMcpReview(() => ({ workspace: dir, centralFile, authority })), revoke: () => { authority = 'two' } }
}
test('connector preview/deny runs nothing and writes nothing', () => {
  const f = mcp(), review = f.service.preview([{ name: 'tools', command: 'node', args: ['server.js'] }])
  expect(review.changes).toHaveLength(4)
  expect(existsSync(f.centralFile)).toBe(false)
  expect(f.service.decide(review.token, 'deny').ok).toBe(true)
  expect(existsSync(join(f.dir, '.mcp.json'))).toBe(false)
})
test('connector changes preserve unrelated fields, native servers and credential fields', () => {
  const f = mcp(), file = join(f.dir, '.mcp.json')
  writeFileSync(file, JSON.stringify({ nativePreference: true, mcpServers: { untouched: { command: 'other' }, tools: { command: 'old', env: { SECRET: 'private-value' }, timeout: 10 } } }))
  const review = f.service.preview([{ name: 'tools', command: 'node', args: ['new.js'] }])
  expect(f.service.decide(review.token, 'allow').ok).toBe(true)
  const native = JSON.parse(readFileSync(file, 'utf8'))
  expect(native.nativePreference).toBe(true); expect(native.mcpServers.untouched.command).toBe('other')
  expect(native.mcpServers.tools).toMatchObject({ command: 'node', env: { SECRET: 'private-value' }, timeout: 10 })
  const inspected = inspectNativeMcp([{ scope: 'test', path: file }])
  expect(JSON.stringify(inspected)).not.toContain('private-value')
  expect(inspected.files[0].entries.find(s => s.name === 'tools')?.credentialFields).toBe(true)
})
test('only provably owned unchanged server entries are removed', () => {
  const f = mcp(), first = f.service.preview([{ name: 'tools', command: 'node', args: [] }])
  expect(f.service.decide(first.token, 'allow').ok).toBe(true)
  const file = join(f.dir, '.mcp.json'), value = JSON.parse(readFileSync(file, 'utf8'))
  value.mcpServers.tools.command = 'owner-edited'; value.mcpServers.unrelated = { command: 'private-tool' }; writeFileSync(file, JSON.stringify(value))
  const review = f.service.preview([])
  expect(review.explanation).toContain('edited outside')
  expect(f.service.decide(review.token, 'allow').ok).toBe(true)
  expect(JSON.parse(readFileSync(file, 'utf8')).mcpServers.tools.command).toBe('owner-edited')
  expect(JSON.parse(readFileSync(join(f.dir, '.agents', 'mcp_config.json'), 'utf8')).mcpServers).toEqual({})
})
test('stale connector preview cannot overwrite a later native edit', () => {
  const f = mcp(), review = f.service.preview([{ name: 'tools', command: 'node', args: [] }]), file = join(f.dir, '.mcp.json')
  writeFileSync(file, '{"owner":"new edit"}')
  expect(f.service.decide(review.token, 'allow').ok).toBe(false)
  expect(readFileSync(file, 'utf8')).toBe('{"owner":"new edit"}')
  expect(existsSync(f.centralFile)).toBe(false)
})
test('connector authorization is one-use and invalidated by setting changes', () => {
  const f = mcp(), review = f.service.preview([]); f.revoke()
  expect(f.service.decide(review.token, 'allow').ok).toBe(false)
  expect(f.service.decide(review.token, 'allow').ok).toBe(false)
  expect(existsSync(f.centralFile)).toBe(false)
})
test('native connector inventory does not disclose URL tokens or auth values', () => {
  const dir = root(), file = join(dir, 'native.json')
  writeFileSync(file, JSON.stringify({ oauthAccount: { email: 'private@owner.test' }, mcpServers: { remote: { url: 'https://example.test/mcp?apiKey=secret', headers: { Authorization: 'Bearer secret-header' } } } }))
  const view = inspectNativeMcp([{ path: file, scope: 'user' }])
  expect(view.files[0].entries[0].endpoint).toBe('https://example.test')
  expect(JSON.stringify(view)).not.toMatch(/secret|private@owner/)
})
test('expected snapshots are rechecked inside staged configuration writes', () => {
  const dir = root(), file = join(dir, 'config'); writeFileSync(file, 'new edit')
  expect(() => commitConfigs([{ path: file, text: 'replacement', expected: Buffer.from('old') }])).toThrow(/reviewed snapshot/)
  expect(readFileSync(file, 'utf8')).toBe('new edit')
})
test('invalid JSONC is reported and never repaired during an inventory', () => {
  const dir = root(), file = join(dir, 'native.json'); writeFileSync(file, '{ // comment\n}')
  expect(inspectNativeMcp([{ path: file, scope: 'native' }]).notices.join(' ')).toContain('JSONC')
  expect(readFileSync(file, 'utf8')).toBe('{ // comment\n}')
})

test('catalog preview installs only the retained pinned bytes, never a refetched revision', async () => {
  const { createCatalogInstallReview } = await import('../src/main/engine/skillCatalogInstall')
  const dir = root(), targets = { claudeSkillsDir: join(dir, 'claude'), agySkillsDir: join(dir, 'agy') }
  const text = '---\nname: docx\ndescription: Complete source\n---\nKeep these instructions.\n'
  const original = Buffer.from(text), files = new Map([['SKILL.md', original], ['requirements.txt', Buffer.from('example-package==1.0\n')]])
  let loads = 0
  const service = createCatalogInstallReview(() => ({ targets, authority: 'scope' }), fetch, async () => { loads++; return { revision: 'a'.repeat(40), files } })
  const preview = await service.plan('docx')
  expect(preview.manifest).toBe(text); expect(preview.requirements[0].text).toContain('==1.0')
  expect(existsSync(targets.claudeSkillsDir)).toBe(false)
  original.fill(120) // caller mutation cannot change already-reviewed bytes
  expect(service.decide(preview.token, 'allow').ok).toBe(true)
  expect(loads).toBe(1)
  expect(readFileSync(join(targets.agySkillsDir, 'docx', 'SKILL.md'), 'utf8')).toBe(text)
  expect(service.decide(preview.token, 'allow').ok).toBe(false)
})
test('cancelled catalog review cannot later install and a changed destination is refused', async () => {
  const { createCatalogInstallReview } = await import('../src/main/engine/skillCatalogInstall')
  const dir = root(); let selected = join(dir, 'agy')
  const service = createCatalogInstallReview(() => ({ targets: { claudeSkillsDir: join(dir, 'claude'), agySkillsDir: selected }, authority: 'same' }), fetch,
    async () => ({ revision: 'a'.repeat(40), files: new Map([['SKILL.md', Buffer.from('---\nname: docx\ndescription: Fixture\n---\nInstructions')]]) }))
  const first = await service.plan('docx'); service.cancel()
  expect(service.decide(first.token, 'allow').ok).toBe(false)
  const second = await service.plan('docx'); selected = join(dir, 'different')
  expect(service.decide(second.token, 'allow').ok).toBe(false)
  expect(existsSync(join(dir, 'claude'))).toBe(false)
})

test('native project-local MCP declarations are visible without leaking their credentials', () => {
  const dir = root(), file = join(dir, 'claude.json')
  writeFileSync(file, JSON.stringify({ projects: { '/owner/project': { mcpServers: { local: { command: 'node', args: ['--secret=do-not-show'], env: { TOKEN: 'secret-value' } } } } }, oauthAccount: { email: 'private@owner.test' } }))
  const view = inspectNativeMcp([{ path: file, scope: 'Claude user configuration' }])
  expect(view.files.some(scope => scope.scope.includes('project-local') && scope.entries[0]?.name === 'local')).toBe(true)
  expect(JSON.stringify(view)).not.toMatch(/do-not-show|secret-value|private@owner/)
})
