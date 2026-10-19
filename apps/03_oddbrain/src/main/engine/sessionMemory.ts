import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { configBytes, noLinkedPath } from './configTransaction'
import type { EngineId } from '../../shared/lib/engine'

export type SavedEngineSession = { engine: EngineId; workspace: string; sessionId: string; key: string; chatId?: string }
const validId = (value: unknown): value is string => typeof value === 'string' && value.length <= 1024 && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value)
const validKey = (key: unknown): key is string => typeof key === 'string' && key.length > 0 && key.length <= 8192 && !/[\x00-\x1f]/.test(key)
/** One main-process owner; no pruning, no damaged-index replacement, no native
 * history import. Atomic file replacement is not a cross-process locking claim. */
export function createSessionMemory(file: string) {
  const read = (): Record<string, string> => {
    const bytes = configBytes(file)
    if (!bytes) return Object.create(null)
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('The saved-session index is damaged. Its original has not been changed.')
    const entries = Object.entries(value)
    if (entries.length > 20_000 || entries.some(([key, id]) => !validKey(key) || (id !== '' && !validId(id)))) throw Error('The saved-session index is invalid or exceeds its limit. Originals have not been changed.')
    return Object.assign(Object.create(null), value)
  }
  return {
    load(key: string): string { if (!validKey(key)) throw Error('Invalid session key.'); return read()[key] || '' },
    save(key: string, id: string): void {
      if (!validKey(key) || (id !== '' && !validId(id))) throw Error('Invalid native session identity. It was not saved.')
      const original = configBytes(file), data = read()
      if (id) data[key] = id; else delete data[key]
      const bytes = Buffer.from(JSON.stringify(data), 'utf8')
      if (original?.equals(bytes)) return
      if (Object.keys(data).length > 20_000 || bytes.length > 2_000_000) throw Error('Saved-session capacity reached. No earlier sessions were removed.')
      noLinkedPath(file); mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
      const temporary = file + '.pending-' + randomUUID()
      try {
        writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 })
        const fd = openSync(temporary, 'r'); try { fsyncSync(fd) } finally { closeSync(fd) }
        const current = configBytes(file)
        if ((original === null) !== (current === null) || (original && current && !original.equals(current))) throw Error('Saved sessions changed while saving. Nothing was replaced.')
        noLinkedPath(file); renameSync(temporary, file)
        if (!readFileSync(file).equals(bytes)) throw Error('Saved sessions could not be verified on disk.')
      } finally { if (existsSync(temporary)) unlinkSync(temporary) }
    },
    list(engine?: EngineId): SavedEngineSession[] {
      return Object.entries(read()).flatMap(([key, sessionId]) => {
        if (key.startsWith('v2:')) {
          const parts: unknown = JSON.parse(key.slice(3))
          if (!Array.isArray(parts) || parts.length !== 3 || !['claude-code', 'agy'].includes(parts[0]) || parts.some(p => typeof p !== 'string' || !p)) throw Error('Invalid conversation session key. Original unchanged.')
          const [id, workspace, chatId] = parts as [EngineId, string, string]
          return engine && engine !== id ? [] : [{ engine: id, workspace, chatId, sessionId, key }]
        }
        const match = /^(claude-code|agy)::(.+)$/.exec(key)
        // Legacy unscoped keys are retained, never guessed to belong to an engine.
        if (!match || !sessionId || (engine && engine !== match[1])) return []
        return [{ engine: match[1] as EngineId, workspace: match[2], sessionId, key }]
      })
    },
  }
}
