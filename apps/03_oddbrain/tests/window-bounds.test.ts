import test from 'node:test'
import assert from 'node:assert/strict'
import { fitWindow } from '../src/main/windowBounds'

test('125% scaling: the native frame fits above the taskbar without scaling twice', () => {
  const bounds = fitWindow({ x: 0, y: 0, width: 1536, height: 824 })
  assert.deepEqual(bounds, { x: 128, y: 12, width: 1280, height: 800, minWidth: 940, minHeight: 620 })
})
test('small and left-hand monitors keep every bound inside their work area', () => {
  for (const area of [{ x: -1280, y: 40, width: 1280, height: 680 }, { x: 0, y: 0, width: 800, height: 560 }]) {
    const b = fitWindow(area)
    assert(b.x >= area.x && b.y >= area.y)
    assert(b.x + b.width <= area.x + area.width && b.y + b.height <= area.y + area.height)
    assert(b.minWidth <= b.width && b.minHeight <= b.height)
  }
})
