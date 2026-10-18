import test from 'node:test'
import assert from 'node:assert/strict'
import { windowBounds } from '../src/shared/lib/windowBounds'
test('startup fits the scaled work area, including taskbar/frame budget', () => {
  assert.deepEqual(windowBounds({ width: 1536, height: 816 }), { width: 1280, height: 816, minWidth: 940, minHeight: 620 })
  assert.deepEqual(windowBounds({ width: 800, height: 550 }), { width: 800, height: 550, minWidth: 800, minHeight: 550 })
  assert.deepEqual(windowBounds({ width: 320, height: 400 }, true), { width: 320, height: 400, minWidth: 320, minHeight: 400 })
})
