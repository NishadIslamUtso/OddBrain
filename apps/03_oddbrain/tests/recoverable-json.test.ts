import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { readRecoverableJson, writeRecoverableJson } from '../src/main/recoverableJson'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const file = (): string => { const root = mkdtempSync(join(tmpdir(), 'oddbrain-json-')); roots.push(root); return join(root, 'owner-data.json') }
const validate = (value: unknown): { choice: string } => {
  if (!value || typeof value !== 'object' || typeof (value as { choice?: unknown }).choice !== 'string') throw Error('damaged')
  return value as { choice: string }
}

test('small owner-data stores recover from one complete prior generation and preserve damaged bytes', () => {
  const path = file(); writeRecoverableJson(path, { choice: 'first' }); writeRecoverableJson(path, { choice: 'second' })
  writeFileSync(path, '{broken', 'utf8')
  const read = readRecoverableJson(path, validate, { choice: 'fallback' })
  expect(read).toEqual({ value: { choice: 'first' }, recovered: true })
  expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ choice: 'first' })
  expect(readdirSync(dirname(path)).some(name => name.startsWith('owner-data.json.damaged-'))).toBe(true)
})

test('invalid UTF-8 also recovers without discarding the original bytes', () => {
  const path = file(); writeRecoverableJson(path, { choice: 'first' }); writeRecoverableJson(path, { choice: 'second' })
  writeFileSync(path, Buffer.from([0xff, 0xfe, 0xfd]))
  expect(readRecoverableJson(path, validate, { choice: '' })).toEqual({ value: { choice: 'first' }, recovered: true })
  const damaged = readdirSync(dirname(path)).find(name => name.startsWith('owner-data.json.damaged-'))!
  expect(readFileSync(join(dirname(path), damaged))).toEqual(Buffer.from([0xff, 0xfe, 0xfd]))
})

test('oversized replacement is refused without replacing the current generation', () => {
  const path = file(); writeRecoverableJson(path, { choice: 'kept' })
  expect(() => writeRecoverableJson(path, { choice: 'x'.repeat(8_000_001) })).toThrow(/Nothing was shortened or replaced/)
  expect(readRecoverableJson(path, validate, { choice: '' }).value.choice).toBe('kept')
})
