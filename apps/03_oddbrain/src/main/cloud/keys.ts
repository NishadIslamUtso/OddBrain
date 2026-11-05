/**
 * Provider keys, kept where a key belongs.
 *
 * A key is encrypted with the machine's own facility — Electron's safeStorage,
 * which is the OS keychain or its equivalent — and the file only ever holds that
 * encrypted form, readable by this user, mode 0600.
 *
 * When a machine gives the app nothing to encrypt with, the key is held in memory
 * for this run and the app says exactly that. Writing a plaintext key to disk to
 * keep a checkbox green would be the wrong trade: a person can always paste it
 * again, and nobody can paste back a leaked key.
 *
 * The encrypt/decrypt pair is injected rather than imported, so this file has no
 * Electron in it and can be tested as plain filesystem-and-map behaviour.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'

export type KeyStore = {
  /** 'os' when the machine gave the app something to encrypt with, 'none' otherwise. */
  encryption: 'os' | 'none'
  has: (id: string) => boolean
  /** True when the key is on disk in encrypted form; false when it lives in this run only. */
  persisted: (id: string) => boolean
  get: (id: string) => string
  set: (id: string, key: string) => void
  clear: (id: string) => void
  ids: () => string[]
}

export function createKeyStore(options: {
  file: string
  encrypt?: (value: string) => string
  decrypt?: (value: string) => string
}): KeyStore {
  const { file, encrypt, decrypt } = options
  const usable = typeof encrypt === 'function' && typeof decrypt === 'function'
  /** Keys that are on disk, encrypted. */
  const stored = new Map<string, string>()
  /** Keys that are only here, for as long as the app runs. */
  const session = new Map<string, string>()

  if (usable) {
    try {
      if (existsSync(file)) {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>
        for (const [id, sealed] of Object.entries(parsed || {})) {
          if (typeof sealed !== 'string') continue
          try {
            const plain = decrypt!(sealed)
            if (plain) stored.set(id, plain)
          } catch {
            // Encrypted by a different machine or user: not usable, so it is
            // dropped rather than kept as a key that silently fails later.
          }
        }
      }
    } catch {
      // A damaged file means "no keys saved", never a failed launch.
    }
  }

  function write(next: Map<string, string>): void {
    if (!usable) return
    const out: Record<string, string> = {}
    for (const [id, key] of next) out[id] = encrypt!(key)
    mkdirSync(dirname(file), { recursive: true })
    // Encrypt everything before touching disk. Rename a private sibling file
    // so failed writes do not truncate the last usable credential store.
    const temporary = `${file}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, `${JSON.stringify(out, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      renameSync(temporary, file)
    } finally {
      rmSync(temporary, { force: true })
    }
  }

  return {
    encryption: usable ? 'os' : 'none',
    has: id => stored.has(id) || session.has(id),
    persisted: id => stored.has(id),
    get: id => stored.get(id) || session.get(id) || '',
    set: (id, key) => {
      const value = String(key || '').trim()
      if (!value) return
      if (usable) {
        const next = new Map(stored); next.set(id, value)
        write(next)
        stored.set(id, value)
        session.delete(id)
        return
      }
      session.set(id, value)
    },
    clear: id => {
      const next = new Map(stored); next.delete(id)
      write(next)
      stored.delete(id)
      session.delete(id)
    },
    ids: () => [...new Set([...stored.keys(), ...session.keys()])],
  }
}
