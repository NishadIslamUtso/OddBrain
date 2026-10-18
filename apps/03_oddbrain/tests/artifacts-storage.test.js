import test from 'node:test'
import assert from 'node:assert/strict'
import { artifactSource, buildPreviewHtml, extractArtifacts, wantsArtifact } from '../src/shared/lib/artifacts'
import { DEFAULT_SETTINGS, normalizeChats, normalizeSettings, readStored, writeStored } from '../src/shared/lib/storage'
import { readAttachment, toOllamaMessages } from '../src/shared/lib/attachments'
import { CAPSULE_DRAG_TYPE, parseCapsuleDrop } from '../src/shared/lib/vault'

const html = '```html\n<!doctype html><html><title>Counter</title><body>Hello</body></html>\n```'
test('artifact creation requires current explicit intent, not old game context', () => {
  assert.equal(wantsArtifact('Hello, how are you?'), false)
  assert.equal(wantsArtifact('Explain how to build an HTML app'), false)
  assert.equal(wantsArtifact('Do not create an artifact'), false)
  assert.equal(wantsArtifact('Build an interactive counter web app'), true)
  assert.equal(wantsArtifact('A blue counter', true), true)
  assert.deepEqual(extractArtifacts(html, { requested: false }), [])
})
test('complete HTML fences are extracted; incomplete fences are not run', () => {
  const result = extractArtifacts(html, { requested: true, messageId: 'm1', chatId: 'c1', title: 'Build counter' })
  assert.equal(result.length, 1); assert.equal(result[0].title, 'Counter')
  assert.equal(result[0].chatId, 'c1'); assert.equal(result[0].versions.length, 1)
  assert.match(artifactSource(result[0]), /Hello/)
  assert.equal(extractArtifacts('```html\n<body>Hello', { requested: true }).length, 0)
})
test('raw complete HTML and SVG work without a React/CDN runner', () => {
  assert.equal(extractArtifacts('<html><body>Hi</body></html>', { requested: true, messageId: 'm', title: 'HTML' }).length, 1)
  assert.equal(extractArtifacts('```svg\n<svg></svg>\n```', { requested: true, messageId: 'm', title: 'SVG' })[0].type, 'svg')
  assert.equal(extractArtifacts('```jsx\nexport default App\n```', { requested: true }).length, 0)
})
test('preview CSP is before untrusted content and blocks network/forms/frames', () => {
  const result = buildPreviewHtml('<script src="https://example.com/a.js"></script>', '</script>')
  assert.ok(result.indexOf('Content-Security-Policy') < result.indexOf('https://example.com'))
  for (const policy of ["connect-src 'none'", "form-action 'none'", "frame-src 'none'", "base-uri 'none'"]) assert.ok(result.includes(policy))
  assert.ok(result.includes('\\u003c/script>'))
  assert.doesNotMatch(result, /allow-same-origin|cdn\.jsdelivr|unpkg/)
})
test('settings reject unknown values and remain dark by default', () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS)
  assert.equal(normalizeSettings({ theme: 'light', transcriptSize: 'Gigantic' }).theme, 'light')
  assert.equal(normalizeSettings({ transcriptSize: 'Gigantic' }).transcriptSize, 'Medium')
})
test('legacy title-only chat history migrates without resetting names or ids', () => {
  const result = normalizeChats([{ id: 'old', title: 'Kept', date: 'Older' }])
  assert.equal(result[0].title, 'Kept'); assert.deepEqual(result[0].messages, [])
  assert.throws(() => normalizeChats({}), /must be an array/)
})
test('corrupt storage is preserved and a recovery copy is made before an edit', () => {
  const data = new Map([['chats', '{broken']])
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
  const result = readStored('chats', [], normalizeChats, storage)
  assert.deepEqual(result.value, []); assert.match(result.warning, /not been cleared/)
  assert.equal(data.get('chats'), '{broken')
  writeStored('chats', [{ id: 'new' }], storage)
  assert.equal(data.get('chats_recovery'), '{broken')
})
test('text files are decoded honestly; unsupported or oversized files are refused', async () => {
  const file = (name, text, size = text.length) => ({ name, size, type: 'text/plain', text: async () => text })
  assert.equal((await readAttachment(file('notes.md', 'Source notes'), {})).text, 'Source notes')
  await assert.rejects(
    readAttachment({ ...file('book.pdf', 'PDF'), type: 'application/pdf', arrayBuffer: async () => new TextEncoder().encode('not a PDF').buffer }, {}),
    /valid PDF header.*Nothing was sent/,
  )
  await assert.rejects(readAttachment(file('huge.txt', 'a'.repeat(12001)), {}), /Nothing was truncated or sent/)
  await assert.rejects(readAttachment(file('binary.txt', 'bad\0data'), {}), /not readable UTF-8 text/)
  await assert.rejects(readAttachment({ name: 'photo.png', type: 'image/png', size: 20 }, {}), /verified vision/)
})
test('messages carry original text uploads and source-data context without fake turns', async () => {
  const result = await toOllamaMessages([{ role: 'user', content: 'Read this', attachments: [{ kind: 'text', name: 'notes.md', text: 'Original notes' }], context: 'Local excerpt' }], { vision: false })
  assert.equal(result.length, 1); assert.match(result[0].content, /Original notes/); assert.match(result[0].content, /source_data_only/)
  await assert.rejects(toOllamaMessages([{ role: 'user', content: 'See image', attachments: [{ kind: 'image', name: 'x.png' }] }], { vision: false }), /contains images/)
})
test('capsule drops are explicit typed data, parsed and size checked', () => {
  const transfer = payload => ({ getData: type => type === CAPSULE_DRAG_TYPE ? payload : '' })
  assert.equal(parseCapsuleDrop(transfer('')), null)
  assert.equal(parseCapsuleDrop(transfer(JSON.stringify({ title: 'Capsule', content: 'Exact context' }))).content, 'Exact context')
  assert.throws(() => parseCapsuleDrop(transfer('{broken')), /Invalid/)
  assert.throws(() => parseCapsuleDrop(transfer(JSON.stringify({ title: 'Large', content: 'x'.repeat(12001) }))), /oversized/)
})

test('HTTP200 without a genuine vault source acknowledgement is not a saved write', async t => {
  const { vaultPost } = await import('../src/shared/lib/vault')
  let data = { ok: true }
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }))
  await assert.rejects(vaultPost('/capture', {}), /no saved source path/)
  data = { ok: false, error: 'Explicit failed save' }
  await assert.rejects(vaultPost('/capture', {}), /Explicit failed save/)
  data = { ok: true, skipped: true, reason: 'never-check blacklist' }
  await assert.rejects(vaultPost('/capture', {}), /skipped/)
  data = { ok: true, source: '02 Sources/test.md' }
  assert.equal((await vaultPost('/capture', {})).source, data.source)
  await assert.rejects(vaultPost('/blacklist', {}), /invalid blacklist acknowledgement/)
})
