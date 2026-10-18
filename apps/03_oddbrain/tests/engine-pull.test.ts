// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { EMPTY_TICK, parsePullLine, pullFraction, validateModelName } from '../src/main/engine/pull'
import { resetEngineForTests, engineStore } from '../src/renderer/src/state/engine'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'

/**
 * Bringing a brain home: the name is guarded, the progress is real, the
 * finished brain appears in the list — and the window is never asked to run
 * any of it (the browser preview answers honestly).
 */
test('pull names: ordinary model names pass, anything clever is refused', () => {
  assert.equal(validateModelName('llama3.2:3b'), 'llama3.2:3b')
  assert.equal(validateModelName('qwen2.5-coder:3b'), 'qwen2.5-coder:3b')
  assert.equal(validateModelName('gemma4:cloud'), 'gemma4:cloud')
  assert.equal(validateModelName('x; del /q *.*'), '')
  assert.equal(validateModelName('x & calc'), '')
  assert.equal(validateModelName('http://evil'), '')
  assert.equal(validateModelName(''), '')
  assert.equal(validateModelName('--pull something'), '')
})

test('pull progress: the door sentences become a bar, success ends it, errors surface', () => {
  assert.deepEqual(parsePullLine(JSON.stringify({ status: 'pulling manifest' })), {
    status: 'pulling manifest',
    total: null,
    completed: null,
    done: false,
    error: '',
  })
  const halfway = parsePullLine(JSON.stringify({ status: 'downloading sha:abc', total: 2000, completed: 1000 }))
  assert.equal(pullFraction(halfway), 0.5)
  assert.deepEqual(parsePullLine(JSON.stringify({ status: 'success' })), {
    status: 'success',
    total: null,
    completed: null,
    done: true,
    error: '',
  })
  assert.equal(pullFraction(parsePullLine(JSON.stringify({ status: 'success' }))), 1)
  const failed = parsePullLine(JSON.stringify({ error: 'no such model' }))
  assert.match(failed.error, /no such model/)
  // Rubbish in, nothing out — never a crash.
  assert.deepEqual(parsePullLine('total rubbish'), { ...EMPTY_TICK })
  assert.deepEqual(parsePullLine(''), { ...EMPTY_TICK })
  assert.equal(pullFraction({ ...EMPTY_TICK }), null)
})

test('the store: a pull runs, its ticks fill the bar, a finished pull refreshes the list', async () => {
  resetEngineForTests()
  const pulls: string[] = []
  const deletions: string[] = []
  let listener: ((tick: unknown) => void) | null = null
  ;(window as unknown as Record<string, unknown>).api = {}
  ;(window as unknown as Record<string, unknown>).engineApi = {
    read: async () => ({ engine: { ...DEFAULT_ENGINE }, running: false, history: [] }),
    pick: async () => ({ ok: true, answer: 'picked' }),
    models: async () => ({
      ok: true,
      models: [
        { name: 'gemma4:cloud', cloud: true, sizeGB: null },
        { name: 'llama3.2:3b', cloud: false, sizeGB: 2.0 },
      ],
      error: '',
    }),
    setModel: async () => ({ ok: true, answer: 'ok' }),
    setApproval: async () => ({ ok: true, answer: 'ok' }),
    pickWorkspace: async () => ({ ok: false, answer: 'no' }),
    detect: async () => [],
    pull: async (name: string) => {
      pulls.push(name)
      listener?.({ status: 'downloading x', total: 100, completed: 40, done: false, error: '' })
      return { ok: true, answer: 'home' }
    },
    deleteModel: async (name: string) => {
      deletions.push(name)
      return { ok: true, answer: 'gone' }
    },
    onPullEvent: (cb: (tick: unknown) => void) => {
      listener = cb
      return () => {
        listener = null
      }
    },
    send: async () => ({ ok: false, answer: 'refused' }),
    answer: async () => ({ ok: true }),
    stop: async () => ({ ok: true }),
    onEvent: () => () => undefined,
  }
  const store = engineStore()
  await store.init()
  const answer = await store.startPull('llama3.2:3b')
  assert.equal(answer.ok, true)
  assert.deepEqual(pulls, ['llama3.2:3b'])
  // The finished pull refreshed the brain list from the door.
  assert.deepEqual(
    store.models.entries.map((entry) => entry.name),
    ['gemma4:cloud', 'llama3.2:3b'],
  )
  const removed = await store.removeModel('llama3.2:3b')
  assert.equal(removed.ok, true)
  assert.deepEqual(deletions, ['llama3.2:3b'])
})

test('the bay offers the pull where it is real: claude-code only, with delete for local brains', () => {
  // jsdom replaces import.meta.url's scheme, so paths go through cwd here.
  const read = (relative: string): string => readFileSync(`${process.cwd()}/${relative}`, 'utf8')
  const bay = read('src/renderer/src/components/EngineBay.tsx')
  const main = read('src/main/index.ts')
  assert.match(main, /engine:pull/)
  assert.match(main, /engine:model-delete/)
  assert.match(main, /validateModelName/)
})
