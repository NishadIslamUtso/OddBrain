import test from 'node:test'
import assert from 'node:assert/strict'
import { MINIMUM_WINDOW, TARGET_WINDOW, windowBoundsFor } from '../src/main/windowBounds'

test('the app starts at the 1536×864 logical target when the screen has room', () => {
  assert.deepEqual(TARGET_WINDOW, { width: 1536, height: 864 })
  assert.deepEqual(windowBoundsFor({ width: 1536, height: 864 }), {
    width: 1536, height: 864, minWidth: 940, minHeight: 620,
  })
  assert.equal(TARGET_WINDOW.width * 1.25, 1920)
  assert.equal(TARGET_WINDOW.height * 1.25, 1080)
})

test('Windows work area and smaller desktop sizes clamp without an off-screen minimum', () => {
  assert.deepEqual(windowBoundsFor({ width: 1536, height: 824 }), {
    width: 1536, height: 824, minWidth: MINIMUM_WINDOW.width, minHeight: MINIMUM_WINDOW.height,
  })
  assert.deepEqual(windowBoundsFor({ width: 1024, height: 700 }), {
    width: 1024, height: 700, minWidth: MINIMUM_WINDOW.width, minHeight: MINIMUM_WINDOW.height,
  })
  assert.deepEqual(windowBoundsFor({ width: 900, height: 580 }), {
    width: 900, height: 580, minWidth: 900, minHeight: 580,
  })
})

test('invalid display bounds fall back to the requested desktop target', () => {
  assert.deepEqual(windowBoundsFor({ width: 0, height: Number.NaN }), {
    width: 1536, height: 864, minWidth: 940, minHeight: 620,
  })
})
