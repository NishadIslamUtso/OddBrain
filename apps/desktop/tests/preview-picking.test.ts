import test from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import {
  PREVIEW_CHROME_ATTRIBUTE,
  applyElementRewrite,
  buildPreviewHtml,
  elementPath,
  parseElementPick,
  previewScript,
  rewritePrompt,
} from '../src/shared/lib/artifacts'

/**
 * Picking an element, and changing exactly that element.
 *
 * These exist because of a bug the browser check found and these tests would
 * have caught: the outline the preview draws around the element under the
 * pointer is appended to the document body, which shifted every index in the
 * path by one. Clicking the first button rewrote the *second* element — and the
 * document still looked plausible, which is what made it dangerous.
 */

// The library parses HTML with the global DOMParser, as it does in a browser.
// jsdom gives us one; it is set up once here rather than stubbed per test, so
// these tests exercise the real parsing rather than an approximation of it.
const jsdom = new JSDOM('<!doctype html><html><body></body></html>')
;(globalThis as unknown as { DOMParser: typeof jsdom.window.DOMParser }).DOMParser =
  jsdom.window.DOMParser

const CHANNEL = 'test-channel'
const DOCUMENT = '<!doctype html><html><body><button id="go">Start</button><div id="note">25:00</div></body></html>'

function parse(source: string): Document {
  return new JSDOM(source).window.document
}

test('a path counts the document, not the outline the app draws over it', () => {
  const document = parse(DOCUMENT)
  const button = document.getElementById('go') as Element

  assert.deepEqual(elementPath(button), [0], 'the button is the first element in the body')

  // Exactly what the preview does while the pointer moves.
  const outline = document.createElement('div')
  outline.setAttribute(PREVIEW_CHROME_ATTRIBUTE, '')
  document.body.appendChild(outline)

  assert.deepEqual(
    elementPath(button),
    [0],
    'the outline must not shift the index of anything after it'
  )
})

test('a documented source with the furniture in it still resolves correctly', () => {
  // Defensive: if the attribute ever ends up inside a saved document, the rewrite
  // and the path must still agree about which element index 1 means.
  const withChrome = DOCUMENT.replace(
    '<body>',
    `<body><div ${PREVIEW_CHROME_ATTRIBUTE}=""></div>`
  )
  const document = parse(withChrome)
  const note = document.getElementById('note') as Element
  assert.deepEqual(elementPath(note), [1], 'the note is the second real element, not the third')
})

test('the click the preview sends survives validation, and the prompt describes it', () => {
  const pick = parseElementPick(
    {
      channel: CHANNEL,
      type: 'oddbrain-pick',
      path: [0],
      outerHTML: '<button id="go">Start</button>',
      width: 88,
      height: 38,
      picked: { tag: 'button', id: 'go', classes: '', text: 'Start' },
    },
    CHANNEL
  )
  assert.ok(pick, 'a well-formed pick must be accepted')
  const prompt = rewritePrompt({ pick: pick!, comment: 'make it say Begin', source: DOCUMENT, type: 'html' })
  assert.match(prompt, /Return ONLY the replacement element/)
  assert.match(prompt, /Current element:/)
  assert.match(prompt, /make it say Begin/)
})

test('a rewrite through a path computed with the outline present changes the right element', () => {
  // The whole round trip, with the outline in place as it is in the live frame.
  const frame = parse(DOCUMENT)
  const outline = frame.createElement('div')
  outline.setAttribute(PREVIEW_CHROME_ATTRIBUTE, '')
  frame.body.appendChild(outline)
  const path = elementPath(frame.getElementById('go') as Element)

  const next = applyElementRewrite(
    DOCUMENT,
    path,
    '<button id="go" class="primary">Begin</button>'
  )

  assert.match(next, /Begin/, 'the button must be the element that changed')
  assert.doesNotMatch(next, />Start</, 'the old button must be gone, not left beside the new one')
  assert.match(next, /id="note"/, 'the element next to it must be untouched')
  assert.match(next, /25:00/, 'and its contents with it')
})

test('a replacement that is not HTML is refused, so nothing is silently blanked', () => {
  assert.throws(() => applyElementRewrite(DOCUMENT, [0], '   '), /empty replacement|nothing was changed/i)
})

test('a path that no longer resolves asks for a fresh pick instead of guessing', () => {
  assert.throws(
    () => applyElementRewrite(DOCUMENT, [9], '<p>x</p>'),
    /no longer exists|Pick it again/
  )
})

test('the injected preview script carries the same path function, not a copy', () => {
  // If these ever diverge, a pick reports one element and the rewrite edits
  // another — silently. The script embeds the function's own source.
  const script = previewScript(CHANNEL)
  assert.ok(script.includes('data-ai-assistant-chrome'), 'the outline is marked as furniture')
  assert.ok(
    script.includes('var pathOf = function elementPath') ||
      script.includes('var pathOf = elementPath'),
    'the frame must use the shared function'
  )
  assert.ok(
    !script.includes('path.unshift(Array.prototype.indexOf.call(node.parentElement.children, node))'),
    'the old index-counting copy must be gone'
  )
})

test('the frame and the rewrite agree on the document, even with styles in the head', () => {
  // The bug this catches: buildPreviewHtml used to wrap a whole document inside
  // its own <body>. The browser then drops the artifact's <head> and <body> tags
  // and moves its <style> into the outer body — so the frame counted an extra
  // element that the rewrite, parsing the source on its own, did not. Clicking
  // the first button edited the second element, and the document still looked
  // plausible, which is what made it dangerous.
  const full = '<!doctype html><html><head><style>button{color:red}</style></head><body><button id="go">Start</button><div id="note">25:00</div></body></html>'
  const preview = parse(buildPreviewHtml(full, CHANNEL))

  const tags = (document: Document): string[] =>
    Array.from(document.body.children)
      .filter(child => !child.hasAttribute(PREVIEW_CHROME_ATTRIBUTE))
      .map(child => child.tagName)

  // The invariant, stated once: the frame's body IS the document's body. If these
  // ever differ, a path from one means something else to the other.
  assert.deepEqual(
    tags(preview),
    tags(parse(full)),
    'the frame must not add anything to the body of the document it shows'
  )

  const path = elementPath(preview.getElementById('go') as Element)
  const next = applyElementRewrite(full, path, '<button id="go">Begin</button>')

  assert.match(next, /Begin/, 'the button is what the path must point at')
  assert.doesNotMatch(next, />Start</, 'the old button must not survive beside the new one')
  assert.match(next, /25:00/, 'the neighbouring element must be untouched')
})
