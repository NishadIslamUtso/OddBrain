// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_APPEARANCE,
  PACK_STYLE_ID,
  applyAppearance,
  applyPackStyle,
  normalizeAppearance,
} from '../src/renderer/src/state/appearance'

/**
 * The pack's stylesheet must actually reach the page: applied on top of the
 * app's own stylesheet (later in the head, so it wins), replaceable by the
 * next pack, and gone again when the look is reset.
 */

test('a stored stylesheet survives normalization, with a ceiling', () => {
  const kept = normalizeAppearance({ packCss: 'body { color: red }' })
  assert.equal(kept.packCss, 'body { color: red }')
  const capped = normalizeAppearance({ packCss: 'x'.repeat(300_000) })
  assert.equal(capped.packCss.length, 200_000)
  assert.equal(normalizeAppearance({}).packCss, '')
})

test('applying an appearance with a stylesheet puts it in a style element of its own', () => {
  document.getElementById(PACK_STYLE_ID)?.remove()
  applyAppearance({ ...DEFAULT_APPEARANCE, packCss: '.card { border-radius: 20px }' })
  const element = document.getElementById(PACK_STYLE_ID)
  assert.ok(element, 'the style element exists')
  assert.equal(element?.textContent, '.card { border-radius: 20px }')
  // the next pack replaces it, not adds a second one
  applyAppearance({ ...DEFAULT_APPEARANCE, packCss: '.card { border-radius: 8px }' })
  assert.equal(document.getElementById(PACK_STYLE_ID)?.textContent, '.card { border-radius: 8px }')
  assert.equal(document.querySelectorAll(`#${PACK_STYLE_ID}`).length, 1)
  // reset (packCss '') removes it
  applyAppearance(DEFAULT_APPEARANCE)
  assert.equal(document.getElementById(PACK_STYLE_ID), null, 'reset clears the pack style')
})

test('applyPackStyle set-then-clear is a no-op pair on a clean page', () => {
  document.getElementById(PACK_STYLE_ID)?.remove()
  applyPackStyle('h1 { letter-spacing: 1px }')
  assert.ok(document.getElementById(PACK_STYLE_ID))
  applyPackStyle('')
  assert.equal(document.getElementById(PACK_STYLE_ID), null)
})
