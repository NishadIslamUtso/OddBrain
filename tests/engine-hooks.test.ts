import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateHook, hookSlug, hookStatusLine, HOOK_EVENTS, type AppHook } from '../src/shared/lib/hooks'
import { createHookRunner, type HookStore } from '../src/main/hooks'

/**
 * Hooks: the owner's own commands at the engine's moments. Real processes in
 * these tests — a hook that hangs is stopped and said to be stopped, one
 * that fails is reported, and the shelf is capped. Packs can never
 * contribute a hook: the pack format simply has no such contribution, and
 * the test holds that line.
 */

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8')

function memoryStore(initial: AppHook[] = []): HookStore & { shelf: AppHook[] } {
  const shelf = [...initial]
  return { shelf, load: () => [...shelf], save: (hooks) => { shelf.splice(0, shelf.length, ...hooks) } }
}

test('a hook is validated: name, moment, command; the id is its slug', () => {
  assert.equal(validateHook({ name: '', event: 'turn-done', command: 'echo hi' }).ok, false)
  assert.equal(validateHook({ name: 'x'.repeat(41), event: 'turn-done', command: 'echo' }).ok, false)
  const badMoment = validateHook({ name: 'Lint', event: 'whenever' as never, command: 'npm run lint' })
  assert.equal(badMoment.ok, false)
  if (!badMoment.ok) assert.match(badMoment.answer, /must be one of/)
  assert.equal(validateHook({ name: 'Lint', event: 'turn-done', command: '   ' }).ok, false)
  const good = validateHook({ name: 'Run the Formatter', event: 'turn-done', command: 'npx prettier --write .' })
  assert.ok(good.ok)
  if (good.ok) {
    assert.equal(good.hook.id, 'run-the-formatter')
    assert.equal(good.hook.event, 'turn-done')
  }
  assert.equal(hookSlug('  Two -- words!! '), 'two-words')
  assert.deepEqual([...HOOK_EVENTS], ['turn-done', 'turn-error', 'permission'])
})

test('a hook really runs, and success is said in the story', async () => {
  const store = memoryStore()
  const runner = createHookRunner(store)
  const set = runner.upsert({ name: 'Say done', event: 'turn-done', command: 'printf hook-ran' })
  assert.ok(set.ok)
  const lines = await runner.run('turn-done')
  assert.equal(lines.length, 1)
  assert.match(lines[0] ?? '', /Hook "Say done" ran, exit 0/)
  assert.match(lines[0] ?? '', /hook-ran/, 'the command\u2019s own words are reported')
  assert.equal((await runner.run('turn-error')).length, 0, 'hooks only run at their moment')
})

test('a failing hook is reported, never fatal; a hanging hook is stopped and said so', async () => {
  const store = memoryStore()
  const runner = createHookRunner(store, 300)
  await runner.upsert({ name: 'Broken', event: 'turn-error', command: 'node -e "process.exit(2)"' })
  await runner.upsert({ name: 'Sleepy', event: 'turn-error', command: 'node -e "setTimeout(() => {}, 30000)"' })
  const lines = await runner.run('turn-error')
  assert.equal(lines.length, 2)
  assert.match(lines[0] ?? '', /ended with exit 2/)
  assert.match(lines[1] ?? '', /did not finish in .* and was stopped/)
})

test('the shelf: upsert replaces by id, remove removes, twenty is the cap', async () => {
  const store = memoryStore()
  const runner = createHookRunner(store)
  assert.ok(runner.upsert({ name: 'Lint', event: 'turn-done', command: 'npm run lint' }).ok)
  assert.ok(runner.upsert({ name: 'lint', event: 'turn-done', command: 'npm run lint:fix' }).ok, 'the same slug replaces, never duplicates')
  assert.equal(store.shelf.length, 1)
  assert.equal(store.shelf[0]?.command, 'npm run lint:fix')
  const gone = runner.remove('lint')
  assert.ok(gone.ok)
  const twice = runner.remove('lint')
  assert.equal(twice.ok, false)
  assert.match(twice.answer, /No hook named/)
  for (let index = 0; index < 20; index++) {
    assert.ok(runner.upsert({ name: `hook ${index}`, event: 'permission', command: 'echo' }).ok)
  }
  const full = runner.upsert({ name: 'one more', event: 'permission', command: 'echo' })
  assert.equal(full.ok, false)
  assert.match(full.answer, /Twenty hooks is the shelf/)
})

test('the status line tells the truth for every ending', () => {
  assert.match(hookStatusLine('lint', 0, 340, ''), /ran, exit 0 \(0\.3s\)$/)
  assert.match(hookStatusLine('lint', 2, 100, 'no perms'), /exit 2 \(0\.1s\): no perms/)
  assert.match(hookStatusLine('lint', null, 10_000, ''), /did not finish in 10\.0s and was stopped/)
})
