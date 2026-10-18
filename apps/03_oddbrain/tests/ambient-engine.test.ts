// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'

/**
 * The quick-ask window (and any second window) has no turn of its own — but
 * it must not sit in silent ignorance while the machine's engine works in
 * another window. Ambient state is read-only on purpose: cards and answers
 * stay with the window that owns the turn.
 */

test('a window with no local turn still sees the engine working elsewhere', async () => {
  ;(globalThis as Record<string, unknown>).api = {}
  let emit: ((event: { kind: string; message?: string }) => void) | null = null
  ;(window as unknown as Record<string, unknown>).engineApi = {
    read: async () => ({ engine: { id: 'claude-code', model: 'm', baseUrl: '', workspace: '', approval: 'ask' }, running: false, history: [] }),
    send: async () => ({ ok: true, answer: 'started' }),
    onEvent: () => () => undefined,
    onPullEvent: () => () => undefined,
    watch: { start: async () => ({ ok: true, answer: '' }), stop: async () => ({ ok: true, answer: '' }), onEvent: (listener: never) => { void listener; return () => undefined } },
  }
  // The broadcast door: capture the engine event listener the store registers.
  ;(window as unknown as Record<string, unknown>).engineApi = new Proxy((window as unknown as Record<string, unknown>).engineApi as object, {
    get(target, prop) {
      if (prop === 'onEvent') {
        return (listener: (event: { kind: string; message?: string }) => void) => {
          emit = listener
          return () => undefined
        }
      }
      return (target as Record<string, unknown>)[prop as string]
    },
  })
  const { resetEngineForTests, engineStore } = await import('../src/renderer/src/state/engine')
  resetEngineForTests()
  const store = engineStore()
  await store.init()
  assert.equal(store.ambient.busy, false)

  assert.ok(emit, 'the store subscribed to engine events')
  // The REAL status event shape, exactly as the engine emits it.
  emit!({ kind: 'status', text: 'editing src/app.ts' } as Parameters<NonNullable<typeof emit>>[0])
  assert.equal(store.ambient.busy, true, 'work in another window lights the ambient strip')
  assert.match(store.ambient.note, /editing src\/app\.ts/)

  emit!({ kind: 'done' })
  assert.equal(store.ambient.busy, false, 'finished work quiets the strip')
})
