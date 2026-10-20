// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * The blacklist speaks the pairing dialect: GET /blacklist and both update
 * posts carry x-oddbrain-pair, or the app refuses them and the extension
 * silently runs on a stale list. The app-side refusal is proven in
 * extension-port.test.ts; here the shipped module is proven to send it.
 */
type Stored = Record<string, unknown>
let storage: Stored
let calls: Array<{ path: string; headers: Record<string, string> }>

describe('the blacklist carries the pairing token', () => {
  beforeEach(() => {
    storage = { pairToken: 'b'.repeat(64) }
    calls = []
    ;(globalThis as Record<string, unknown>).chrome = {
      runtime: { id: 'test-ext' },
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
    ;(globalThis as Record<string, unknown>).fetch = vi.fn(async (input: string | URL, init?: { headers?: Record<string, string> }) => {
      calls.push({ path: String(input).replace('http://127.0.0.1:8765', ''), headers: (init?.headers ?? {}) as Record<string, string> })
      return { ok: true, status: 200, json: async () => ({ excluded: [] }) }
    })
    vi.resetModules()
  })

  it('reading the list carries the token', async () => {
    const blacklist = (await import('../../../extension/lib/blacklist.js')) as { getBlacklist(): Promise<unknown> }
    await blacklist.getBlacklist()
    expect(calls[0]!.path).toBe('/blacklist')
    expect(calls[0]!.headers['x-oddbrain-pair']).toBe('b'.repeat(64))
  })

  it('posting a blacklist update carries the token too', async () => {
    const blacklist = (await import('../../../extension/lib/blacklist.js')) as { addToBlacklist(pattern: string): Promise<void> }
    await blacklist.addToBlacklist('nope.example/*')
    const post = calls.find(call => call.path === '/capture')
    expect(post).toBeTruthy()
    expect(post!.headers['x-oddbrain-pair']).toBe('b'.repeat(64))
  })
})
