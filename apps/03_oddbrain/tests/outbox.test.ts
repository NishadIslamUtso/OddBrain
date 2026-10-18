// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * The outbox's contract, per HTTP reality (not just thrown fetches):
 * delivered leaves; a refusal drops ON PURPOSE with a metadata-only record;
 * a server error or a dead network keeps the capture for the next flush.
 * The old flush deleted on ANY non-throw — 401, 403, 500 alike.
 */
type Stored = Record<string, unknown>
let storage: Stored

const chromeStub = () => {
  ;(globalThis as Record<string, unknown>).chrome = {
    runtime: { id: 'test-extension-id' },
    storage: {
      local: {
        get: async (defaults: Stored) => {
          const out: Stored = {}
          for (const key of Object.keys(defaults)) out[key] = key in storage ? storage[key] : defaults[key]
          return out
        },
        set: async (values: Stored) => { Object.assign(storage, values) },
      },
    },
  }
}

const respondWith = (status: number, ok: boolean): void => {
  ;(globalThis as Record<string, unknown>).fetch = vi.fn(async () => ({ ok, status, json: async () => ({}) }))
}

const loadWriter = async () =>
  (await import('../../../extension/lib/vault-writer.js')) as {
    queueCapture(payload: unknown): Promise<void>
    flushQueue(): Promise<void>
  }

const queuedCapture = { type: 'page', url: 'https://example.com/private', title: 'T', content: 'AUDIT_PRIVATE_CONTENT', captured_at: 'now' }

describe('the outbox honours the answer, not the absence of an exception', () => {
  beforeEach(() => {
    storage = { queue: [{ ...queuedCapture }] }
    chromeStub()
    vi.resetModules()
  })

  it('a server error (500) KEEPS the capture for the next flush', async () => {
    respondWith(500, false)
    const writer = await loadWriter()
    await writer.flushQueue()
    expect((storage.queue as unknown[]).length).toBe(1)
  })

  it('a refusal (401) drops the capture and keeps METADATA ONLY', async () => {
    respondWith(401, false)
    const writer = await loadWriter()
    await writer.flushQueue()
    expect((storage.queue as unknown[]).length).toBe(0)
    const activity = (storage.activity as Array<Record<string, unknown>>) ?? []
    const entry = activity.find(item => /dropped from the outbox/.test(String(item.reason ?? '')))
    expect(entry).toBeTruthy()
    expect(JSON.stringify(entry)).not.toContain('AUDIT_PRIVATE_CONTENT')
  })

  it('a refusal (403) drops too — rejected means rejected', async () => {
    respondWith(403, false)
    const writer = await loadWriter()
    await writer.flushQueue()
    expect((storage.queue as unknown[]).length).toBe(0)
  })

  it('delivered (200) leaves quietly', async () => {
    respondWith(200, true)
    const writer = await loadWriter()
    await writer.flushQueue()
    expect((storage.queue as unknown[]).length).toBe(0)
  })

  it('a thrown fetch keeps the capture, as always', async () => {
    ;(globalThis as Record<string, unknown>).fetch = vi.fn(async () => { throw new Error('offline') })
    const writer = await loadWriter()
    await writer.flushQueue()
    expect((storage.queue as unknown[]).length).toBe(1)
  })
})

describe('the relay never parks a capture twice', () => {
  beforeEach(() => {
    storage = {}
    chromeStub()
    vi.resetModules()
  })

  it('when the background queues (offline), it ANSWERS - the page does not queue again', async () => {
    // The background's fetch throws; the handler queues and ANSWERS. The
    // content script must not catch a rejection and run the handler again.
    ;(globalThis as Record<string, unknown>).fetch = vi.fn(async () => { throw new Error('app offline') })
    let sendMessageCalls = 0
    ;(globalThis as Record<string, unknown>).chrome = {
      runtime: {
        id: 'test-extension-id',
        sendMessage: async (msg: { type: string }) => {
          sendMessageCalls += 1
          // the background handler: queues via ITS storage, answers structured
          const data = storage.queue || []
          data.push({ ...(msg as { payload: unknown }).payload })
          storage.queue = data
          return { ok: false, queued: true }
        },
        storage: undefined,
      },
      storage: undefined,
    }
    const writer = await loadWriter()
    const answer = await writer.postCapture({ type: 'page', url: 'https://example.com', content: 'AUDIT_PRIVATE_CONTENT' })
    expect(answer).toEqual({ ok: false, queued: true })
    expect(sendMessageCalls).toBe(1)
    expect((storage.queue as unknown[]).length).toBe(1, 'one capture, one outbox entry - never two')
  })
})
