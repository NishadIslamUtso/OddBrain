/**
 * Tests for the features taken from the curated list: the inline visualizer and
 * live artifacts, comment-mode region rewriting, the vision bridge, sub-agent
 * isolation, branching, and the deployable ZIP export.
 *
 * These are the parts that fail silently in a browser — a wrong CRC in a ZIP, a
 * region rewrite that replaces the wrong node, a bridge that leaks a picture to
 * a text model. Each one is checked here rather than discovered on the TUF A15.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

import { applyElementRewrite, buildPreviewHtml, cleanElementRewrite, describePath, extractArtifacts, extractStreamingArtifacts, parseElementPick, previewScript, rewritePrompt, sourceSignature } from '../src/lib/artifacts.js'
import { BRIDGE_MAX_CHARS, bridgeBlock, bridgePrompt, cleanDescription, needsBridge, buildBridgeMessages, pickBridgeModel } from '../src/lib/vision.js'
import { createZip, crc32, dosDateTime, safeEntryName, slugify, staticSiteEntries } from '../src/lib/zip.js'
import { budgetOf, assertBudget, CHAR_BUDGET } from '../src/lib/ask.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
globalThis.DOMParser = dom.window.DOMParser

/* ------------------------------- zip ------------------------------- */

/** Read back a stored archive with no library, the way the format defines it. */
function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  assert.equal(view.getUint32(end, true), 0x06054b50, 'missing end-of-central-directory record')
  const count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)
  const files = []
  for (let index = 0; index < count; index += 1) {
    assert.equal(view.getUint32(offset, true), 0x02014b50, 'bad central directory header')
    const crc = view.getUint32(offset + 16, true)
    const size = view.getUint32(offset + 20, true)
    const nameLength = view.getUint16(offset + 28, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    assert.equal(view.getUint32(localOffset, true), 0x04034b50, `bad local header for ${name}`)
    const localNameLength = view.getUint16(localOffset + 26, true)
    const start = localOffset + 30 + localNameLength
    const data = bytes.subarray(start, start + size)
    assert.equal(crc32(data), crc, `CRC mismatch for ${name}`)
    files.push({ name, data: new TextDecoder().decode(data) })
    offset += 46 + nameLength
  }
  return files
}

test('a ZIP written here is a valid archive a host can unzip', () => {
  const entries = [
    { name: 'index.html', content: '<!doctype html><title>Tic Tac Toe</title>' },
    { name: 'README.md', content: '# Tic Tac Toe\n' },
  ]
  const files = readZip(createZip(entries, new Date('2026-10-11T12:00:00Z')))
  assert.deepEqual(files.map(file => file.name), ['index.html', 'README.md'])
  assert.equal(files[0].data, entries[0].content)
  assert.equal(files[1].data, entries[1].content)
})

test('an exported site carries everything a static host needs', () => {
  const files = staticSiteEntries({ title: 'Study Charts', source: '<!doctype html><h1>hi</h1>', type: 'html' })
  const names = files.map(file => file.name)
  assert.deepEqual(names, ['index.html', 'README.md', 'vercel.json', 'netlify.toml', '.gitignore'])
  assert.match(files[1].content, /no build step/i)
  assert.equal(JSON.parse(files[2].content).cleanUrls, true)
  assert.match(files[0].content, /<h1>hi<\/h1>/)
})

test('an SVG artifact is wrapped into a servable page', () => {
  const [page] = staticSiteEntries({ title: 'Logo', source: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', type: 'svg' })
  assert.match(page.content, /^<!doctype html>/)
  assert.match(page.content, /<svg/)
})

test('archive names cannot escape the folder or arrive empty', () => {
  assert.equal(safeEntryName('../../etc/passwd'), 'etc/passwd')
  assert.equal(safeEntryName('a\\b\\c.html'), 'a/b/c.html')
  assert.throws(() => safeEntryName('../..'), /usable file name/)
  assert.throws(() => createZip([]), /would be empty/)
})

test('CRC32 matches the reference values and dos time is in range', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926)
  const stamp = dosDateTime(new Date('2026-10-11T12:30:00'))
  assert.ok(stamp.date > 0 && stamp.time > 0)
  assert.equal(slugify('Study Hours Dashboard!'), 'study-hours-dashboard')
  assert.equal(slugify(''), 'artifact')
})

/* --------------------------- live artifacts --------------------------- */

const FULL = 'Here you go:\n\n```html\n<!doctype html><html><title>Counter</title><body><b>1</b></body></html>\n```\n\nIt is on the right.'
const HALF = 'Here you go:\n\n```html\n<!doctype html><html><title>Counter</title><body><b>1</b>'

test('a half-written artifact is available to the live view but is never saved', () => {
  assert.equal(extractArtifacts(HALF, { requested: true, messageId: 'm', chatId: 'c', title: 'Counter' }).length, 0, 'an unfinished artifact must not reach chat history')
  const live = extractStreamingArtifacts(HALF, { requested: true, messageId: 'm', chatId: 'c', title: 'Counter' })
  assert.equal(live.length, 1)
  assert.equal(live[0].partial, true)
  assert.equal(live[0].title, 'Counter', 'the title is read from the document as it streams')
  assert.equal(live[0].id, 'm-artifact-0')
})

test('the finished artifact keeps the same id, so the open panel is not thrown away', () => {
  const [partial] = extractStreamingArtifacts(HALF, { requested: true, messageId: 'm', chatId: 'c', title: 'Counter' })
  const [saved] = extractArtifacts(FULL, { requested: true, messageId: 'm', chatId: 'c', title: 'Counter' })
  assert.equal(partial.id, saved.id)
  assert.equal(saved.partial, false)
  assert.match(saved.versions[0].content, /<\/html>$/)
})

test('an unfenced document streams live too, and no artifact appears when none was asked for', () => {
  const live = extractStreamingArtifacts('<!doctype html><html><title>App</title><body>', { requested: true, messageId: 'm', title: 'App' })
  assert.equal(live.length, 1)
  assert.equal(live[0].partial, true)
  assert.equal(extractStreamingArtifacts(HALF, { requested: false, messageId: 'm' }).length, 0)
})

test('stopping mid-build keeps the half-written document instead of discarding it', () => {
  // useChat keeps the draft on a stop; this is the rule it applies.
  const stopped = extractStreamingArtifacts(HALF, { requested: true, messageId: 'm', chatId: 'c', title: 'Counter' })
  assert.equal(stopped.length, 1)
  assert.equal(stopped[0].partial, true)
  assert.equal(stopped[0].versions[0].draft, true)
  assert.match(stopped[0].versions[0].content, /<b>1<\/b>/, 'the work done so far must survive the stop')
})

test('the live reload only redraws when the document actually changed', () => {
  assert.equal(sourceSignature('abc'), sourceSignature('abc'))
  assert.notEqual(sourceSignature('abc'), sourceSignature('abd'))
})

/* -------------------- inline visualizer + comment mode -------------------- */

test('the preview keeps its CSP first and ships the visualizer and the picker', () => {
  const html = buildPreviewHtml('<canvas data-chart=\'{"type":"bar","data":[1,2]}\'></canvas>', 'chan-1')
  const policy = html.indexOf('Content-Security-Policy')
  const body = html.indexOf('<canvas')
  assert.ok(policy > -1 && policy < body, 'the CSP must be emitted before any untrusted content')
  assert.match(html, /default-src 'none'; script-src 'unsafe-inline'/)
  assert.match(html, /window\.AIAssistant = \{ chart: render, renderCharts: renderAll/)
  assert.match(html, /ai-assistant-mode/)
  assert.match(html, /ai-assistant-pick/)
  assert.doesNotMatch(html, /connect-src [^;]*(?:http|ws)/, 'the sandbox must not be given a network destination')
})

test('the preview script survives attacker-controlled content next to the channel', () => {
  const html = buildPreviewHtml('<p>hi</p>', '</script><script>steal()</script>')
  assert.ok(html.includes('\\u003c/script>'), 'the channel must be escaped when embedded')
  assert.equal((html.match(/<script>/g) || []).length, 1)
})

test('a pick is validated before it becomes a prompt', () => {
  const good = { channel: 'c1', type: 'ai-assistant-pick', path: [0, 2], outerHTML: '<button id="go">Go</button>', width: 40, height: 20, picked: { tag: 'button', id: 'go', classes: '', text: 'Go' } }
  assert.deepEqual(parseElementPick(good, 'c1').path, [0, 2])
  assert.equal(parseElementPick(good, 'other'), null, 'a message from another frame/channel is ignored')
  assert.equal(parseElementPick({ ...good, path: 'nope' }, 'c1'), null)
  assert.equal(parseElementPick({ ...good, path: [-1] }, 'c1'), null)
  assert.equal(parseElementPick({ ...good, path: [0], outerHTML: 5 }, 'c1'), null)
})

test('the rewrite prompt asks for one element back, and names the instruction', () => {
  const prompt = rewritePrompt({
    pick: { path: [1, 0], outerHTML: '<h1 style="color:red">Old</h1>', picked: { text: 'Old' } },
    comment: 'make this blue and twice as large',
    source: '<!doctype html><body><div></div><section><h1 style="color:red">Old</h1></section></body>',
    type: 'html',
  })
  assert.match(prompt, /Return ONLY the replacement element/)
  assert.match(prompt, /make this blue and twice as large/)
  assert.match(prompt, /<h1 style="color:red">Old<\/h1>/)
  assert.match(prompt, /body > element\[2\] > child\[1\]/)
  assert.match(prompt, /The rest of the document for context/)
  assert.equal(describePath([]), 'body')
})

test('a region rewrite replaces exactly the picked element and leaves the rest alone', () => {
  const source = '<!doctype html><html><body><header>keep me</header><main><h1 class="t">Old title</h1><p>body text</p></main></body></html>'
  const next = applyElementRewrite(source, [1, 0], '<h1 class="t" style="color:blue">New title</h1>')
  assert.match(next, /<header>keep me<\/header>/)
  assert.match(next, /<p>body text<\/p>/)
  assert.match(next, /<h1 class="t" style="color:blue">New title<\/h1>/)
  assert.doesNotMatch(next, /Old title/)
  assert.match(next, /^<!doctype html>/)
})

test('a fragment document stays a fragment instead of gaining a body wrapper', () => {
  const next = applyElementRewrite('<div><span>a</span><span>b</span></div>', [0, 1], '<span>c</span>')
  assert.equal(next, '<div><span>a</span><span>c</span></div>')
})

test('a rewrite that cannot be applied is refused instead of corrupting the artifact', () => {
  assert.throws(() => applyElementRewrite('<div><span>a</span></div>', [9], '<b>x</b>'), /no longer exists/)
  assert.throws(() => applyElementRewrite('<div><span>a</span></div>', [0], '   '), /empty replacement/)
  assert.throws(() => applyElementRewrite('<div><span>a</span></div>', [], '<b>x</b>'), /No element was selected/)
  assert.equal(cleanElementRewrite('```html\n<span>x</span>\n```'), '<span>x</span>')
  assert.equal(cleanElementRewrite('<!doctype html><html><body><em>x</em></body></html>'), '<em>x</em>')
})

/* ---------------------------- vision bridge ---------------------------- */

test('the bridge is used only when an image meets a model that cannot see', () => {
  const image = [{ kind: 'image', name: 'x.png' }]
  assert.equal(needsBridge({ vision: false }, image), true)
  assert.equal(needsBridge({ vision: true }, image), false)
  assert.equal(needsBridge({ vision: false }, [{ kind: 'text', name: 'a.md' }]), false)
  assert.equal(needsBridge({ vision: false }, []), false)
})

test('the bridge model is a verified one, never the model that is answering', () => {
  assert.equal(pickBridgeModel(['qwen3-vl:4b'], '', 'qwen2.5:3b'), 'qwen3-vl:4b')
  assert.equal(pickBridgeModel([{ name: 'qwen3-vl:4b' }], 'qwen3-vl:4b', 'qwen2.5:3b'), 'qwen3-vl:4b')
  assert.equal(pickBridgeModel(['qwen2.5:3b'], '', 'qwen2.5:3b'), '', 'the answering model cannot describe for itself')
  assert.equal(pickBridgeModel([], 'qwen3-vl:4b', 'qwen2.5:3b'), '', 'a preference that is not installed is not used')
  assert.equal(pickBridgeModel(['a-vl', 'b-vl'], 'b-vl', 'text'), 'b-vl', 'the user preference wins')
})

test('the vision request carries exactly the images and a description instruction', () => {
  const messages = buildBridgeMessages({ images: ['BASE64'], userText: 'what is in this screenshot?', language: 'English' })
  assert.equal(messages.length, 1)
  assert.deepEqual(messages[0].images, ['BASE64'])
  assert.match(messages[0].content, /image describer/i)
  assert.match(messages[0].content, /what is in this screenshot\?/)
  assert.match(bridgePrompt({}), /Report only what is visible/)
})

test('a description is trimmed to the local context and labelled as second-hand', () => {
  const long = cleanDescription('Description:\n' + 'word '.repeat(900))
  assert.ok(long.length <= BRIDGE_MAX_CHARS + 120, 'the description must be capped')
  assert.match(long, /truncated by the app/)
  assert.equal(cleanDescription('  one\n\n\n\ntwo  '), 'one\n\ntwo')
  const block = bridgeBlock({ descriptions: ['A dark room.'], model: 'qwen3-vl:4b' })
  assert.match(block, /<vision_bridge described_by="qwen3-vl:4b"/)
  assert.match(block, /cannot see the image/)
})

/* ---------------------------- sub-agent budget ---------------------------- */

test('sub-agent work is checked against the same context budget as the chat', () => {
  assert.equal(budgetOf([{ role: 'user', content: 'abc' }]), 3)
  assert.equal(budgetOf([{ role: 'user', content: 'abc', images: ['x'] }]), 403, 'an image costs context too')
  assert.equal(assertBudget([{ role: 'user', content: 'abc' }]), 3)
  assert.throws(() => assertBudget([{ role: 'user', content: 'x'.repeat(CHAR_BUDGET + 1) }], 'This sub-agent task'), /over the conservative/)
})
