import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'

// Observe the actual shim's registrations without mocking Vitest itself.
function harness() {
  const registrations: Array<{ name: string; options: { timeout?: number }; body: (context: any) => Promise<unknown> }> = []
  const module = { exports: {} as any }
  const source = readFileSync(new URL('./shims/node-test.ts', import.meta.url), 'utf8')
  const code = transformSync(source, { loader: 'ts', format: 'cjs' }).code
  new Function('require', 'module', 'exports', code)(
    () => ({ test: (name: string, options: object, body: any) => registrations.push({ name, options, body }) }), module, module.exports,
  )
  return { register: module.exports.default, registrations }
}

describe('node:test compatibility shim', () => {
  it('forwards timeouts in canonical and legacy argument order, and retains the default', () => {
    const h = harness(), body = () => undefined
    h.register('canonical', { timeout: 20000 }, body)
    h.register('legacy', body, { timeout: 30000 })
    h.register('default', body)
    expect(h.registrations.map(r => r.options)).toEqual([{ timeout: 20000 }, { timeout: 30000 }, {}])
  })

  for (const kind of ['sync', 'async', 'hook'] as const) {
    it(`restores mocked methods after a ${kind} failure`, async () => {
      const h = harness(), original = () => 'original', target = { method: original }
      let cleanup = false
      h.register('failure', (t: any) => {
        t.mock.method(target, 'method', () => 'replacement')
        t.after(() => { cleanup = true; if (kind === 'hook') throw Error('hook failed') })
        if (kind === 'sync') throw Error('sync failed')
        if (kind === 'async') return Promise.reject(Error('async failed'))
      })
      await expect(h.registrations[0].body({})).rejects.toThrow(`${kind} failed`)
      expect(target.method).toBe(original)
      expect(cleanup).toBe(true)
    })
  }
})
