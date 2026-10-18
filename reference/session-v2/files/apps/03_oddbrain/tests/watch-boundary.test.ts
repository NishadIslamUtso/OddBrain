// @vitest-environment jsdom
import { test, vi, expect } from 'vitest'
/** Native timers may wake a millisecond before Date.now crosses the quiet
 * boundary. The batch must wait, not be discarded with no later callback. */
test('an early quiet timer keeps the pending file batch and sends exactly once', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  let clock = 1000
  const date = vi.spyOn(Date, 'now').mockImplementation(() => clock)
  let notify: ((tick: { names: string[] }) => void) | undefined
  const sent: string[] = []
  const previousApi = (window as unknown as Record<string, unknown>).api
  const previousEngine = (window as unknown as Record<string, unknown>).engineApi
  ;(globalThis as { __obWatchDebounceMs?: number }).__obWatchDebounceMs = 40
  ;(window as unknown as Record<string, unknown>).api = {}
  ;(window as unknown as Record<string, unknown>).engineApi = {
    read: async () => ({ engine: { id: 'claude-code', model: 'm', workspace: '', approval: 'ask' }, running: false, history: [] }),
    send: async (prompt: string) => { sent.push(prompt); return { ok: true, answer: 'started' } },
    onEvent: () => () => {}, onPullEvent: () => () => {},
    watch: { start: async () => ({ ok: true }), stop: async () => ({ ok: true }), onEvent: (fn: typeof notify) => { notify = fn; return () => {} } },
  }
  try {
    const { resetEngineForTests } = await import('../src/renderer/src/state/engine')
    const { startWatching, stopWatching } = await import('../src/renderer/src/state/watch')
    resetEngineForTests()
    await startWatching('C:\\work', 'Summarise the change.')
    expect(notify).toBeTypeOf('function')
    notify!({ names: ['notes.md'] })
    clock = 1039
    await vi.advanceTimersByTimeAsync(40)
    expect(sent).toHaveLength(0)
    clock = 1042
    await vi.advanceTimersByTimeAsync(3)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toContain('notes.md')
    notify!({ names: ['notes.md'] })
    clock = 1085
    await vi.advanceTimersByTimeAsync(45)
    expect(sent).toHaveLength(1)
    await stopWatching()
  } finally {
    date.mockRestore(); vi.useRealTimers()
    delete (globalThis as { __obWatchDebounceMs?: number }).__obWatchDebounceMs
    ;(window as unknown as Record<string, unknown>).api = previousApi
    ;(window as unknown as Record<string, unknown>).engineApi = previousEngine
  }
})
