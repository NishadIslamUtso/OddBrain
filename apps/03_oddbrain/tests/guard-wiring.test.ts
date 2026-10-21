// @vitest-environment node
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8')

/**
 * The guard's PREDICATE is tested in ipc-guard.test.ts; this file pins its
 * INSTALLATION. The main process must actually wire every window it creates
 * to the guard — a deleted call would leave the surface open while every
 * predicate test stays green, which is the failure mode that hides.
 * It reads the source as text because the wiring only exists where Electron
 * runs; the day a real window harness exists, this graduates to behavior.
 */
const main = read('../src/main/index.ts')

test('every created window is pinned and locked — the quick window and the main window', () => {
  const pinned = main.match(/pinOwnOrigins\(/g)?.length ?? 0
  const locked = main.match(/lockNavigation\(/g)?.length ?? 0
  assert.equal(pinned, 2, `pinOwnOrigins must be called exactly for the main and quick windows, found ${pinned}`)
  // Four windows: main, quick ask, artifact pop-out and hidden PDF renderer.
  // Model-authored windows pass false so they cannot launch external pages.
  assert.equal(locked, 4, `lockNavigation must guard main + quick + pop-out + PDF, found ${locked}`)
  assert.equal(main.match(/lockNavigation\(win\.webContents, false\)/g)?.length ?? 0, 2, 'both artifact windows use strict no-navigation mode')
})

test('the packaged file fallbacks pin their exact page — the offline window keeps working IPC', () => {
  // Both fallback paths (main window and quick window) go through the helper,
  // so a URL change in one place cannot leave the other trusted-less.
  assert.match(main, /function appRendererFileUrl/, 'the exact file-URL helper exists')
  assert.match(main, /appRendererFileUrl\('\?quick=1'\)/, 'the quick file page is pinned with its flag')
  assert.match(main, /pinOwnOrigins\(\[devServer, api\?\.url, appRendererFileUrl\(\)\]\)/, 'the main-window fallback pins its file URL')
})

test('the pin is additive — creating one window never wipes another window\u2019s trust', () => {
  const guard = read('../src/main/ipcGuard.ts')
  const fn = guard.slice(guard.indexOf('export function pinOwnOrigins'), guard.indexOf('export function resetOwnOrigins'))
  assert.doesNotMatch(fn, /\.clear\(\)/, 'pinOwnOrigins must not clear the sets; only resetOwnOrigins may')
})
