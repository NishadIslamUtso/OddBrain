import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCENTS,
  DEFAULT_APPEARANCE,
  accentHex,
  accentInk,
  appearanceVariables,
  normalizeAppearance,
} from '../src/renderer/src/state/appearance'

/**
 * The readability guarantee, as maths.
 *
 * "Readable" is not a taste call here: WCAG 2.x draws the line at 4.5:1 for
 * the sizes this app paints on accent buttons (12-13px). Every accent ships
 * with the ink that clears it, and this file recomputes the ratios from the
 * hex values, so no future hue can ship unreadable and still pass the suite.
 */
function channel(value: number): number {
  const srgb = value / 255
  return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4)
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

function ratio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

test('every accent keeps its label readable: its ink clears 4.5:1', () => {
  const measured: string[] = []
  for (const accent of ACCENTS) {
    const r = ratio(accent.ink, accent.hex)
    measured.push(`${accent.name} ${r.toFixed(2)}`)
    assert.ok(
      r >= 4.5,
      `${accent.name}: ${accent.ink} on ${accent.hex} measures ${r.toFixed(2)}:1 - below the 4.5:1 line`
    )
  }
  assert.ok(measured.length === ACCENTS.length, `measured: ${measured.join(', ')}`)
})

test('each accent carries the ink it was measured with, and the variable follows', () => {
  for (const accent of ACCENTS) assert.equal(accentInk(accent.name), accent.ink)
  for (const accent of ACCENTS) {
    const variables = appearanceVariables({ ...DEFAULT_APPEARANCE, accent: accent.name })
    assert.equal(variables['--accent-ink'], accent.ink)
  }
})

test('violet is deepened exactly enough for white text, not more', () => {
  assert.equal(accentHex('violet'), '#7350ff')
  const r = ratio('#ffffff', accentHex('violet'))
  assert.ok(r >= 4.5, `white on violet is ${r.toFixed(2)}:1`)
  assert.ok(r < 6, `white on violet is ${r.toFixed(2)}:1 - deepened further than it needed to be`)
})

test('the two quiet switches exist and default on: nothing changes until touched', () => {
  assert.equal(DEFAULT_APPEARANCE.mascotWords, true)
  assert.equal(DEFAULT_APPEARANCE.rowExplanations, true)
  assert.deepEqual(normalizeAppearance({ mascotWords: false, rowExplanations: 'no' }), {
    ...DEFAULT_APPEARANCE,
    mascotWords: false,
    rowExplanations: true,
  })
})
