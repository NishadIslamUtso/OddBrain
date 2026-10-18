import test from 'node:test'
import assert from 'node:assert/strict'
import { fitWindowToWorkArea } from '../src/main/windowBounds'

test('1920 × 1080 at 125% fits in the usable logical work area', () => {
  // 1920 / 1.25 = 1536; a bottom taskbar leaves about 824 logical pixels.
  const area = { x: 0, y: 0, width: 1536, height: 824 }
  const result = fitWindowToWorkArea(area, { width: 1360, height: 790, minWidth: 940, minHeight: 620 })
  assert.deepEqual(result, { x: 88, y: 17, width: 1360, height: 790, minWidth: 940, minHeight: 620 })
  assert.ok(result.y + result.height <= area.height - 16)
})

test('normal, quick and popout windows all stay inside even a smaller secondary display', () => {
  const area = { x: -1100, y: 160, width: 1024, height: 700 }
  for (const size of [{ width: 1360, height: 790, minWidth: 940, minHeight: 620 }, { width: 440, height: 620 }, { width: 820, height: 1160 }]) {
    const result = fitWindowToWorkArea(area, size)
    assert.ok(result.x >= area.x + 16 && result.y >= area.y + 16)
    assert.ok(result.x + result.width <= area.x + area.width - 16)
    assert.ok(result.y + result.height <= area.y + area.height - 16)
    assert.ok(result.minWidth <= result.width && result.minHeight <= result.height)
  }
})

test('a work area smaller than the requested minimum lowers the minimum too', () => {
  const result = fitWindowToWorkArea({ x: 0, y: 0, width: 850, height: 540 }, { width: 1360, height: 790, minWidth: 940, minHeight: 620 })
  assert.equal(result.width, 818)
  assert.equal(result.height, 508)
  assert.equal(result.minWidth, 818)
  assert.equal(result.minHeight, 508)
})
