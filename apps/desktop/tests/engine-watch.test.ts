import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { shouldWatchFire, watchOrder, watchableName, WATCH_NOTE } from '../src/shared/lib/watchMode'

/**
 * Watch mode: a saved order runs when the watched folder changes — but the
 * watcher cannot chase its own tail (engine-written files are suppressed for
 * one cooldown), a busy engine never gets a quiet second task, deletions do
 * not fire, and the fire decision always has a why.
 */

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8')

const base = {
  names: ['notes.md'],
  suppressed: [],
  now: 1_000_000,
  lastEventAt: 0,
  lastFireAt: 0,
  cooldownUntil: 0,
  busy: false,
}

test('the fire decision: quiet first, gaps between, busy never, cooldown holds', () => {
  assert.equal(shouldWatchFire({ ...base, lastEventAt: base.now - 100 }).fire, false, 'still rumbling: debounce')
  const fired = shouldWatchFire({ ...base, lastEventAt: base.now - 6_000 })
  assert.equal(fired.fire, true)
  if (fired.fire) assert.deepEqual(fired.names, ['notes.md'])
  assert.equal(shouldWatchFire({ ...base, lastEventAt: base.now - 6_000, lastFireAt: base.now - 5_000 }).fire, false, 'too soon since the last run: gap')
  assert.equal(shouldWatchFire({ ...base, lastEventAt: base.now - 6_000, busy: true }).fire, false, 'a busy engine gets no quiet second task')
  assert.equal(shouldWatchFire({ ...base, lastEventAt: base.now - 6_000, cooldownUntil: base.now + 1 }).fire, false, 'the tail-chase cooldown holds')
})

test('what counts as change: junk, hidden, and engine-written files are not fire-worthy', () => {
  assert.equal(watchableName('node_modules/x/index.js'), false)
  assert.equal(watchableName('.git/HEAD'), false)
  assert.equal(watchableName('.hidden'), false)
  assert.equal(watchableName('notes.md'), true)
  const suppressed = shouldWatchFire({ ...base, lastEventAt: base.now - 6_000, names: ['src/generated.ts', 'real.md'], suppressed: ['src/generated.ts'] })
  assert.ok(suppressed.fire)
  if (suppressed.fire) assert.deepEqual(suppressed.names, ['real.md'], 'the engine\u2019s own last write is skipped; the real change still fires')
  const none = shouldWatchFire({ ...base, lastEventAt: base.now - 6_000, names: ['node_modules/a.js'] })
  assert.equal(none.fire, false)
  if (!none.fire) assert.equal(none.why, 'nothing-watchable')
})

test('a deletion never reaches a tick: the watcher checks the disk, not the event kind', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { createFolderWatcher } = await import('../src/main/watcher')
  const folder = mkdtempSync(join(tmpdir(), 'watch-real-'))
  mkdirSync(join(folder, 'sub'), { recursive: true })
  writeFileSync(join(folder, 'stay.md'), 'kept')
  writeFileSync(join(folder, 'gone.md'), 'leaving')
  const ticks: Array<{ names: string[] }> = []
  const watcher = createFolderWatcher(tick => ticks.push(tick))
  watcher.start(folder)
  rmSync(join(folder, 'gone.md')) // a pure deletion
  writeFileSync(join(folder, 'sub', 'added.md'), 'new') // a real change
  await new Promise(resolve => setTimeout(resolve, 1_600))
  watcher.stop()
  const names = ticks.flatMap(tick => tick.names)
  assert.ok(names.includes(join('sub', 'added.md')), 'a real change still reports')
  assert.equal(names.includes('gone.md'), false, 'the deleted file is never reported')
  rmSync(folder, { recursive: true, force: true })
})

test('suppression matches absolute engine paths against relative watch names', async () => {
  const { shouldWatchFire, samePath } = await import('../src/shared/lib/watchMode')
  // the engine wrote C:\\vault\\notes.md; the watcher reports notes.md
  assert.equal(samePath('notes.md', 'C:\\vault\\notes.md'), true)
  assert.equal(samePath('sub/x.md', '/home/vault/sub/x.md'), true)
  assert.equal(samePath('notes.md', 'C:\\vault\\my-notes.md'), false)
  assert.equal(samePath('notes.md', 'notes.md.bak'), false)
  const decision = shouldWatchFire({
    names: ['notes.md'],
    suppressed: ['C:\\vault\\notes.md'],
    now: 10_000,
    lastEventAt: 0,
    lastFireAt: 0,
    cooldownUntil: 0,
    busy: false,
  })
  assert.equal(decision.fire, false)
  assert.equal(decision.why, 'nothing-watchable')
})

test('suppression is one cooldown, not forever: an old harvest expires', async () => {
  const { shouldWatchFire, WATCH_COOLDOWN_MS } = await import('../src/shared/lib/watchMode')
  const decision = shouldWatchFire({
    names: ['notes.md'],
    suppressed: ['C:\\vault\\notes.md'],
    suppressedAt: 10_000 - WATCH_COOLDOWN_MS - 1,
    now: 10_000,
    lastEventAt: 0,
    lastFireAt: 0,
    cooldownUntil: 0,
    busy: false,
  })
  assert.ok(decision.fire, 'past the cooldown the engine-written file is the person\u2019s file again, and its change fires')
})

test('the order carries the trigger names and the anti-loop line', () => {
  const order = watchOrder(['a.md', 'b.md'], 'Summarise what changed in one line.')
  assert.match(order, /^Summarise what changed in one line\./)
  assert.match(order, /a\.md, b\.md/)
  assert.match(order, /do not edit those files just because they changed/)
  assert.match(WATCH_NOTE, /deletions do not fire it/)
  assert.match(WATCH_NOTE, /never chases its own tail/)
})

// The old 'wiring' test — a loop with no body, no assertions — is gone for
// good: watch-fire.test.ts now drives the real fire end to end.
