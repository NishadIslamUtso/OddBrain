/**
 * Design tokens must land in the artifact without ever loosening the CSP or
 * letting them override rules the artifact itself declares.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPreviewHtml, withDesignTokens } from '../src/shared/lib/artifacts'
import { DESIGN_SYSTEMS, DEFAULT_DESIGN_SYSTEM, loadDesignTokens, designSystemLabel } from '../src/shared/lib/design-systems/index'

const TOKENS = ':root { --bg: #f5f4ed; --accent: #c96442; }'

test('tokens are injected inside the document head', () => {
  const html = buildPreviewHtml('<p>hi</p>', 'c', TOKENS)
  assert.match(html, /<style id="ai-design-tokens">/)
  assert.ok(html.indexOf('ai-design-tokens') < html.indexOf('<body>'))
})

test('the CSP is still the first thing in the head, before any tokens', () => {
  const html = buildPreviewHtml('<p>hi</p>', 'c', TOKENS)
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('ai-design-tokens'))
})

test('no tokens means no empty style block', () => {
  assert.doesNotMatch(buildPreviewHtml('<p>hi</p>', 'c'), /ai-design-tokens/)
  assert.doesNotMatch(buildPreviewHtml('<p>hi</p>', 'c', ''), /ai-design-tokens/)
})

test('a fragment gets the tokens prepended', () => {
  const out = withDesignTokens('<div>x</div>', TOKENS)
  assert.ok(out.startsWith('<style id="ai-design-tokens">'))
  assert.ok(out.endsWith('<div>x</div>'))
})

test('a full document gets the tokens before </head>', () => {
  const doc = '<!doctype html><html><head><title>t</title></head><body>b</body></html>'
  const out = withDesignTokens(doc, TOKENS)
  assert.ok(out.indexOf('ai-design-tokens') < out.indexOf('</head>'))
})

test('empty tokens are a no-op', () => {
  const doc = '<div>x</div>'
  assert.equal(withDesignTokens(doc, ''), doc)
  assert.equal(withDesignTokens(doc, null), doc)
})

test('every bundled design system loads and declares CSS variables', async () => {
  assert.ok(DESIGN_SYSTEMS.length >= 16)
  for (const entry of DESIGN_SYSTEMS) {
    const css = await loadDesignTokens(entry.id)
    assert.ok(css.includes(':root'), `${entry.id} has no :root block`)
    assert.ok(css.includes('--accent'), `${entry.id} declares no --accent`)
    assert.ok(css.length < 8000, `${entry.id} is unexpectedly large (${css.length})`)
  }
})

test('ids are unique and the default exists', () => {
  const ids = DESIGN_SYSTEMS.map(entry => entry.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.includes(DEFAULT_DESIGN_SYSTEM))
  assert.equal(designSystemLabel('claude'), 'Claude')
  assert.equal(designSystemLabel('nope'), 'nope')
})

test('no bundled token file can break out of its style element', async () => {
  for (const entry of DESIGN_SYSTEMS) {
    const css = await loadDesignTokens(entry.id)
    assert.doesNotMatch(css, /<\/style/i, `${entry.id} contains a closing style tag`)
    assert.doesNotMatch(css, /<\/head|<script/i, `${entry.id} contains markup`)
  }
})
