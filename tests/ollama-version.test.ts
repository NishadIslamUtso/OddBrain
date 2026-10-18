import { test, expect } from 'vitest'
import { compareVersions, ollamaAnswer, readOllamaVersion, versionParts } from '../src/main/engine/ollamaVersion'

test('versions compare numerically, not lexically', () => {
  expect(versionParts('v0.15.1')).toEqual([0, 15, 1])
  expect(versionParts('0.14')).toEqual([0, 14, 0])
  expect(versionParts('junk')).toBeNull()
  expect(compareVersions('0.15.0', '0.14.0')).toBeGreaterThan(0)
  expect(compareVersions('0.9.0', '0.14.0')).toBeLessThan(0)
  expect(compareVersions('0.14.0', '0.14.0')).toBe(0)
})

test('0.14 is the line for Claude Code\'s local door, and the words say why', () => {
  expect(ollamaAnswer('0.14.0').compatible).toBe(true)
  expect(ollamaAnswer('0.14.0').answer).toContain('new enough')
  const old = ollamaAnswer('0.13.5')
  expect(old.compatible).toBe(false)
  expect(old.answer).toContain('0.14')
})

test('the door is asked its version; no door, a bad answer and an old runtime each speak', async () => {
  const fake = (version: string, status = 200) => (async () => new Response(JSON.stringify({ version }), { status })) as unknown as typeof fetch
  const good = await readOllamaVersion({ fetchImpl: fake('0.15.2'), baseUrl: 'http://127.0.0.1:11434/' })
  expect(good).toMatchObject({ ok: true, version: '0.15.2', compatible: true })
  const old = await readOllamaVersion({ fetchImpl: fake('0.12.0') })
  expect(old.compatible).toBe(false)
  const bad = await readOllamaVersion({ fetchImpl: fake('', 500) })
  expect(bad.ok).toBe(false)
  const missing = await readOllamaVersion({ fetchImpl: (async () => { throw new Error('ECONNREFUSED') }) as unknown as typeof fetch })
  expect(missing.ok).toBe(false)
  expect(missing.answer).toContain('No Ollama')
})
