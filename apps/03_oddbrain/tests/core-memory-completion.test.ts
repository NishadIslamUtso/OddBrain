// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import type { EngineEvent } from '../src/shared/lib/engine'
import { engineStore, resetEngineForTests } from '../src/renderer/src/state/engine'
import { loadMemory, memoryState, runMemoryPass } from '../src/renderer/src/state/memory'

afterEach(() => {
  delete (window as unknown as { api?: unknown }).api
  delete (window as unknown as { engineApi?: unknown }).engineApi
  resetEngineForTests()
})

test('a sent memory pass refreshes real files on turn completion, not on an intermediate event or timer', async () => {
  let event: ((value: EngineEvent) => void) | undefined
  let content = 'before the pass'
  const reads: string[] = []
  const sent: string[] = []
  ;(window as unknown as { api: object }).api = {}
  ;(window as unknown as { engineApi: object }).engineApi = {
    read: async () => ({ engine: engineStore().settings, running: true, history: [] }),
    onEvent: (listener: (value: EngineEvent) => void) => { event = listener; return () => { event = undefined } },
    onPullEvent: () => () => undefined,
    send: async (order: string) => { sent.push(order); return { ok: true, answer: 'sent' } },
    memory: {
      list: async () => {
        reads.push(content)
        return { ok: true, folder: '/chosen', files: [{ name: 'engine-notes.md', path: '06 Review/Memory/engine-notes.md', updated: '2026-10-18', content, clipped: false }] }
      },
    },
  }
  resetEngineForTests()
  expect(await loadMemory()).toBe(true)
  expect(reads).toEqual(['before the pass'])
  expect(await runMemoryPass()).toBe(true)
  expect(sent).toHaveLength(1)
  expect(sent[0]).toContain('/chosen/engine-notes.md')
  expect(memoryState().running).toBe(true)
  expect(reads).toHaveLength(1)

  content = 'after the pass'
  expect(event).toBeTypeOf('function')
  event!({ kind: 'status', text: 'writing' })
  expect(reads).toHaveLength(1)
  vi.useFakeTimers()
  try {
    await vi.advanceTimersByTimeAsync(30000)
    expect(reads).toHaveLength(1)
  } finally { vi.useRealTimers() }
  event!({ kind: 'done', text: 'finished' })
  await vi.waitFor(() => {
    expect(memoryState().running).toBe(false)
    expect(memoryState().files[0]?.content).toBe('after the pass')
  })
  expect(reads).toEqual(['before the pass', 'after the pass'])
  expect(memoryState().status).toContain('current files were refreshed')
})
