import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { agyModelSource, checkBinary } from '../src/main/engine/availability'
import type { EngineAvailability } from '../src/shared/lib/engine'

/**
 * The machine, told honestly. The bay refuses to guess: an engine that is
 * not installed says so (with the fix), and each engine's brain list comes
 * from its own true source — never a pickable lie.
 */
test('detection: an answering engine reports found, with its own version line', async () => {
  const runner = (_command: string, _args: string[], onDone: (error: unknown, stdout: string) => void) =>
    onDone(null, '2.1.300 (Claude Code)\nsome second line')
  const answer: EngineAvailability = await checkBinary('claude', 'claude-code', { runner })
  assert.equal(answer.found, true)
  assert.equal(answer.version, '2.1.300 (Claude Code)')
  assert.ok(answer.install.length > 10)
})

test('detection: a missing engine says not found, and carries the fix in one sentence', async () => {
  const runner = (_command: string, _args: string[], onDone: (error: unknown, stdout: string) => void) =>
    onDone(new Error('not found'), '')
  const answer = await checkBinary('agy', 'agy', { runner })
  assert.equal(answer.found, false)
  assert.equal(answer.version, '')
  assert.match(answer.install, /antigravity/)
  assert.match(answer.install, /fake/, 'the scam repos are named in the fix itself')
})

test('detection: a nonsense version answer is treated as not found', async () => {
  const runner = (_command: string, _args: string[], onDone: (error: unknown, stdout: string) => void) =>
    onDone(null, 'x'.repeat(500))
  const answer = await checkBinary('claude', 'claude-code', { runner })
  assert.equal(answer.found, false)
})

test('agy brains: never invented — not installed says so, installed discloses the missing adapter', async () => {
  const missing = await agyModelSource(false).models()
  assert.equal(missing.ok, false)
  assert.equal(missing.models.length, 0)
  assert.match(missing.error ?? '', /not on this machine/)
  assert.match(missing.error ?? '', /no custom door/)

  const installed = await agyModelSource(true).models()
  assert.equal(installed.ok, false)
  assert.equal(installed.models.length, 0)
  assert.match(installed.error ?? '', /no verified agy model-list adapter/)
})

test('the routing is wired: engine:models asks the chosen engine, not a fixed door', () => {
  const main = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
  const bay = readFileSync(new URL('../src/renderer/src/components/EngineBay.tsx', import.meta.url), 'utf8')
  assert.match(bay, /checkEngines/)
  assert.match(bay, /not installed/)
  const store = readFileSync(new URL('../src/renderer/src/state/engine.ts', import.meta.url), 'utf8')
  assert.match(store, /EngineAvailability\[\]/)
})
