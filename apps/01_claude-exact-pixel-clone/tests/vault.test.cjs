const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createVaultApp, DEFAULT_VAULT_PATH, dhakaParts, excluded } = require('../server/vault-api.cjs')

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-assistant-vault-test-'))
  fs.mkdirSync(path.join(root, '00 System'), { recursive: true })
  fs.writeFileSync(path.join(root, '00 System/Privacy & Access.md'), '# Privacy\n\n```yaml\nexcluded_patterns:\n  - bank.com/*\n```\n')
  const server = createVaultApp({ vaultPath: root, clock: () => new Date('2026-10-10T19:00:00Z') }).listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }) })
  const base = `http://127.0.0.1:${server.address().port}`
  const request = async (url, body, headers = {}) => {
    const response = await fetch(base + url, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
    return { status: response.status, data: await response.json() }
  }
  return { root, request }
}
const conversation = extra => ({ type: 'conversation', provider: 'AI ASSistant', conversation_id: 'chat-1', title: 'Original source', captured_at: '2026-10-10T19:00:00Z', messages: [{ role: 'user', text: 'Original user message', timestamp: '2026-10-10T18:00:00Z' }, { role: 'assistant', text: 'Original reply', timestamp: '2026-10-10T18:01:00Z', status: 'complete' }], ...extra })
test('default path is the canonical repository vault; missing vault is not silently created', () => {
  assert.equal(DEFAULT_VAULT_PATH, path.resolve(__dirname, '../../../vault/AI-Brain'))
  assert.throws(() => createVaultApp({ vaultPath: path.join(os.tmpdir(), 'missing-vault-' + Date.now()) }), /no empty replacement vault/)
})
test('vault dates are Asia/Dhaka, not server UTC', () => {
  assert.deepEqual(dhakaParts(new Date('2026-10-10T19:00:00Z')), { year: '2026', month: '10', date: '2026-10-11' })
})
test('blacklist domain matching handles subdomains without substring false positives', () => {
  assert.equal(excluded('https://secure.bank.com/page', ['bank.com/*']), true)
  assert.equal(excluded('https://bank.com.evil.org/page', ['bank.com/*']), false)
  assert.equal(excluded('https://other.com/bank.com/page', ['bank.com/*']), false)
  assert.equal(excluded('https://private.example/a', ['https://private.example/*']), true)
})
test('conversation originals, response and timestamps survive; retries deduplicate', async t => {
  const { root, request } = await fixture(t)
  const first = await request('/capture', conversation())
  assert.equal(first.status, 200); assert.equal(first.data.duplicate, false)
  const file = path.join(root, first.data.source)
  const original = fs.readFileSync(file, 'utf8')
  assert.match(original, /Original user message/); assert.match(original, /Original reply/); assert.match(original, /18:00:00Z/)
  const retry = await request('/capture', conversation({ captured_at: '2026-10-11T01:00:01+06:00' }))
  assert.equal(retry.data.duplicate, true); assert.equal(fs.readFileSync(file, 'utf8'), original)
  const changed = await request('/capture', conversation({ messages: [...conversation().messages, { role: 'user', text: 'Next turn', timestamp: '2026-10-10T18:02:00Z' }] }))
  assert.notEqual(changed.data.source, first.data.source); assert.equal(fs.readFileSync(file, 'utf8'), original)
  assert.equal(fs.existsSync(path.join(root, '03 Memory/Entities')), false, 'a source title must not become a confirmed personal fact')
})
test('path traversal and invalid captures fail without false success', async t => {
  const { request } = await fixture(t)
  for (const payload of [conversation({ provider: '../../outside' }), conversation({ conversation_id: '../escape' }), { type: 'not-implemented' }, conversation({ messages: [] }), { type: 'web_page', url: 'file:///private', content: 'x' }]) assert.equal((await request('/capture', payload)).status, 400)
})
test('symlink escape is refused', async t => {
  const { root, request } = await fixture(t)
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-assistant-outside-'))
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, '02 Sources'))
  fs.symlinkSync(outside, path.join(root, '02 Sources/Conversations'), 'dir')
  assert.equal((await request('/capture', conversation())).status, 400)
  assert.equal(fs.readdirSync(outside).length, 0)
})
test('long readable source is not silently truncated', async t => {
  const { root, request } = await fixture(t)
  const content = 'Original '.repeat(2500) + 'END-MARKER'
  const result = await request('/capture', { type: 'web_page', url: 'https://example.org/article', content, title: 'Article' })
  assert.equal(result.status, 200); assert.match(fs.readFileSync(path.join(root, result.data.source), 'utf8'), /END-MARKER/)
})
test('inaccessible sources log the required wording in both canonical locations', async t => {
  const { root, request } = await fixture(t)
  const result = await request('/capture', { type: 'wasnt_accessible', url: 'https://example.org/private', title: 'Private', reason: 'permission blocked' })
  assert.equal(result.status, 200)
  for (const relative of [result.data.source, '09 Activity & Undo/2026/10.md']) assert.match(fs.readFileSync(path.join(root, relative), 'utf8'), /wasn't accessible - permission blocked/)
})
test('visit metadata stays separate from readable content and does not imply agreement', async t => {
  const { root, request } = await fixture(t)
  const result = await request('/capture', { type: 'browser_visit', url: 'https://example.org/visit', visited_at: '2026-10-01T01:00:00Z', title: 'Visit' })
  const data = JSON.parse(fs.readFileSync(path.join(root, result.data.source), 'utf8').trim())
  assert.equal(data.capture_status, 'visit-only'); assert.match(data.interpretation, /not proof/); assert.equal(data.visited_at, '2026-10-01T01:00:00Z')
})
test('blacklist changes update both system documents, preserve revisions, and deny capture', async t => {
  const { root, request } = await fixture(t)
  const updated = await request('/blacklist', { action: 'add', excluded_patterns: ['private.example/*'] })
  assert.equal(updated.status, 200); assert.ok(updated.data.excluded_patterns.includes('bank.com/*'))
  for (const relative of ['00 System/Privacy & Access.md', '00 System/Connectors/Source Scope.md']) assert.match(fs.readFileSync(path.join(root, relative), 'utf8'), /private.example/)
  assert.ok(fs.readdirSync(path.join(root, '90 Archive/System Revisions')).length)
  const denied = await request('/capture', { type: 'web_page', url: 'https://private.example/secret', content: 'MUST NOT SAVE' })
  assert.equal(denied.data.skipped, true); assert.equal(fs.existsSync(path.join(root, '02 Sources/Web Pages')), false)
  await request('/blacklist', { action: 'remove', excluded_patterns: ['private.example/*'] })
  assert.equal((await request('/capture', { type: 'web_page', url: 'https://private.example/secret', content: 'Explicitly allowed again' })).status, 200)
})
test('capsule library is readable with an empty query; context is keyword ranked and versions are preserved', async t => {
  const { root, request } = await fixture(t)
  const capsule = { id: 'capsule-website', title: 'Blue website', background: 'Simple blue and white design', goals: ['Step by step'], version: 1 }
  const first = await request('/capture', { type: 'capsule', capsule })
  const second = await request('/capture', { type: 'capsule', capsule: { ...capsule, version: 2, background: 'Updated blue design' } })
  assert.notEqual(first.data.source, second.data.source)
  const library = await request('/capsules')
  assert.equal(library.data.capsules.length, 1); assert.equal(library.data.capsules[0].version, 2); assert.match(library.data.capsules[0].background, /Updated blue/)
  assert.equal((await request('/context?q=blue')).data.capsules.length, 1)
  assert.equal((await request('/context?q=unrelated')).data.capsules.length, 0)
  assert.equal(fs.existsSync(path.join(root, first.data.source)), true)
})
test('explicit sent attachments are preserved in vault source files', async t => {
  const { root, request } = await fixture(t)
  const payload = conversation()
  payload.messages[0].attachments = [{ id: 'file-1', name: 'notes.md', kind: 'text', text: 'Original attachment' }, { id: 'file-2', name: 'image.png', kind: 'image', mime: 'image/png', data: Buffer.from('test-image').toString('base64') }]
  const result = await request('/capture', payload)
  assert.equal(result.status, 200)
  const files = fs.readdirSync(path.join(root, '02 Sources/Attachments'))
  assert.equal(files.length, 2)
  assert.equal(fs.readFileSync(path.join(root, '02 Sources/Attachments', files.find(file => file.endsWith('.txt'))), 'utf8'), 'Original attachment')
  assert.match(fs.readFileSync(path.join(root, result.data.source), 'utf8'), /notes.md.*02 Sources\/Attachments/)
})
test('untrusted browser origins are rejected; local/extension origin remains supported', async t => {
  const { request } = await fixture(t)
  assert.equal((await request('/capsules', undefined, { Origin: 'https://untrusted.example' })).status, 403)
  assert.equal((await request('/capsules', undefined, { Origin: 'chrome-extension://' + 'a'.repeat(32) })).status, 200)
  assert.equal((await request('/capsules', undefined, { Origin: 'http://127.0.0.1:5173' })).status, 200)
})

test('an archived latest capsule does not resurrect an older active version', async t => {
  const { root, request } = await fixture(t)
  const capsule = { id: 'capsule-archived', title: 'Past context', version: 1, status: 'active', background: 'Historical' }
  const first = await request('/capture', { type: 'capsule', capsule })
  await request('/capture', { type: 'capsule', capsule: { ...capsule, version: 2, status: 'archived' } })
  assert.deepEqual((await request('/capsules')).data.capsules, [])
  assert.equal(fs.existsSync(path.join(root, first.data.source)), true)
})
test('blacklist removal updates frontmatter and every YAML scope block, preserving other fields', async t => {
  const { root, request } = await fixture(t)
  fs.mkdirSync(path.join(root, '00 System/Connectors'), { recursive: true })
  fs.writeFileSync(path.join(root, '00 System/Connectors/Source Scope.md'), '---\nprovider: browser\nexcluded_patterns: [bank.com/*]\n---\n\n# Keep this note\n\n```yaml\nother_setting: keep\nexcluded_patterns: [bank.com/*]\n```\n')
  const result = await request('/blacklist', { action: 'remove', excluded_patterns: ['bank.com/*'] })
  assert.equal(result.status, 200); assert.deepEqual((await request('/blacklist')).data.excluded_patterns, [])
  const document = fs.readFileSync(path.join(root, '00 System/Connectors/Source Scope.md'), 'utf8')
  assert.match(document, /provider: browser/); assert.match(document, /other_setting: keep/); assert.match(document, /Keep this note/)
  assert.doesNotMatch(document, /bank.com/)
})
