// @vitest-environment node
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * Boot ORDER is behaviour. The warm-runtime call runs through the download
 * manager that registerBridges() creates — called before that, it returned
 * silently on a null manager and the "starts with the app" switch kept its
 * promise at zero launches. The wiring lives where Electron runs, so the
 * source order is the test, the same way the guard's installation is pinned.
 */
const main = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')

test('the boot warm-up runs after the bridges exist — never on a null manager', () => {
  const bridges = main.lastIndexOf('registerBridges()')
  const flagsBoot = main.indexOf('if (flags.warmRuntime || flags.keepLoadedAlways) void warmStartRuntime()')
  assert.ok(bridges > 0, 'registerBridges is called at boot')
  assert.ok(flagsBoot > bridges, `the flags warm-up (at ${flagsBoot}) must come after registerBridges() (at ${bridges})`)
})

test('the always-loaded switch reaches the runtime as Ollama\u2019s own env, at start', () => {
  assert.match(main, /OLLAMA_KEEP_ALIVE: '-1'/, 'the runtime starts holding brains forever when the switch is on')
  assert.match(main, /flags\.keepLoadedAlways \? \{ OLLAMA_KEEP_ALIVE: '-1' \} : undefined/, 'and only when it is on')
})
