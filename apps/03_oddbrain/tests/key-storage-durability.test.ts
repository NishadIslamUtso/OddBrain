// @vitest-environment node
import { test, expect } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, mkdirSync, chmodSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createKeyStore } from '../src/main/cloud/keys'
const encrypt = (value: string) => `sealed:${value}`
const decrypt = (value: string) => value.slice(7)

test('failed encryption leaves both the previous persisted key and in-memory state unchanged', () => {
  const root = mkdtempSync(join(tmpdir(), 'ob-keys-'))
  try {
    const file = join(root, 'keys.json')
    const keys = createKeyStore({ file, encrypt: value => { if (value === 'replacement') throw Error('OS keychain unavailable'); return encrypt(value) }, decrypt })
    keys.set('anthropic', 'original'); const before = readFileSync(file, 'utf8')
    expect(() => keys.set('anthropic', 'replacement')).toThrow()
    expect(keys.get('anthropic')).toBe('original')
    expect(readFileSync(file, 'utf8')).toBe(before)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('failed key-file replacement does not claim a new key was persisted', () => {
  const root = mkdtempSync(join(tmpdir(), 'ob-keys-'))
  try {
    const file = join(root, 'keys.json'); mkdirSync(file)
    const keys = createKeyStore({ file, encrypt, decrypt })
    expect(() => keys.set('anthropic', 'new-key')).toThrow()
    expect(keys.persisted('anthropic')).toBe(false)
    expect(keys.has('anthropic')).toBe(false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test.skipIf(process.platform === 'win32')('rewriting a key file restores owner-only permissions', () => {
  const root = mkdtempSync(join(tmpdir(), 'ob-keys-'))
  try {
    const file = join(root, 'keys.json'), keys = createKeyStore({ file, encrypt, decrypt })
    keys.set('anthropic', 'first'); chmodSync(file, 0o644)
    keys.set('anthropic', 'second')
    expect(statSync(file).mode & 0o777).toBe(0o600)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('a failed clear preserves the old persisted and in-memory keys', () => {
  const root = mkdtempSync(join(tmpdir(), 'ob-keys-clear-'))
  try {
    let fail = false
    const file = join(root, 'keys.json')
    const keys = createKeyStore({ file, encrypt: value => { if (fail) throw Error('OS keychain unavailable'); return encrypt(value) }, decrypt })
    keys.set('anthropic', 'original'); keys.set('other', 'keep')
    const before = readFileSync(file, 'utf8'); fail = true
    expect(() => keys.clear('anthropic')).toThrow('OS keychain unavailable')
    expect(keys.get('anthropic')).toBe('original')
    expect(keys.persisted('anthropic')).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe(before)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
