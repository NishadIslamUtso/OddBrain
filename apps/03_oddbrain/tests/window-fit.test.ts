import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * The target display is 1920x1080 at 125% — a 1536x864 logical desktop,
 * minus the taskbar. No window may open outside the work area of the display
 * it reports, and the clamp runs per-window so a second monitor keeps its
 * own windows on itself.
 */
test('every window clamps itself into the display work area', () => {
  const source = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
  assert.match(source, /function clampToWorkArea\(/)
  assert.match(source, /screen\.getDisplayMatching\(bounds\)\.workArea/)
  const creations = source.match(/new BrowserWindow\(/g)?.length ?? 0
  const clamps = source.match(/clampToWorkArea\(/g)?.length ?? 0
  assert.equal(clamps, creations + 1, `${creations} window(s) created, ${clamps} clamp reference(s) — one definition plus one call per window`)
})
