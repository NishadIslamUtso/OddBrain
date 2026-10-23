import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { configBytes, commitConfigs, noLinkedPath } from '../engine/configTransaction'
import type { SavedCommand } from '../../shared/lib/commands'
const ID = /^\d{13}-[a-f0-9-]{36}$/
const digest = (value: Pick<SavedCommand, 'name' | 'command' | 'cwd' | 'platform'>) => createHash('sha256').update(JSON.stringify([value.name, value.command, value.cwd, value.platform])).digest('hex')
/** Saved literal commands, never persisted approvals. Every use returns through
 * the same exact one-use review. Archive is reversible and never deletes text. */
export function createCommandLibrary(root: string) {
  const path = (id: string) => { if (!ID.test(id)) throw Error('Invalid saved-command ID.'); const file = join(root, id + '.json'); noLinkedPath(file); return file }
  const load = (id: string): { record: SavedCommand; bytes: Buffer } => {
    const bytes = configBytes(path(id)); if (!bytes) throw Error('Saved command is missing.')
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as SavedCommand
    if (value?.id !== id || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 || typeof value.command !== 'string' || !value.command.trim() || value.command.length > 32000 || typeof value.cwd !== 'string' || value.cwd.length > 4096 || !['linux', 'darwin', 'win32'].includes(value.platform) || typeof value.archived !== 'boolean' || typeof value.at !== 'string' || value.digest !== digest(value)) throw Error('Saved-command content changed or is invalid. Original bytes were not repaired or executed.')
    return { record: value, bytes }
  }
  const read = (id: string) => load(id).record
  return {
    read,
    save(input: { name: string; command: string; cwd: string; platform: NodeJS.Platform }): SavedCommand {
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 80 || /[\x00-\x1f]/.test(input.name)) throw Error('Use a command name up to 80 characters, without control characters.')
      noLinkedPath(root)
      if (existsSync(root) && readdirSync(root).filter(name => name.endsWith('.json')).length >= 1000) throw Error('Saved-command capacity reached. Existing commands were not evicted.')
      const record: SavedCommand = { ...input, name: input.name.trim(), id: `${Date.now()}-${randomUUID()}`, at: new Date().toISOString(), archived: false, digest: '' }
      record.digest = digest(record)
      commitConfigs([{ path: path(record.id), text: JSON.stringify(record), expected: null }]); return record
    },
    archive(id: string, archived: boolean) {
      if (typeof archived !== 'boolean') throw Error('Choose an explicit archive state.')
      const { record, bytes: expected } = load(id)
      commitConfigs([{ path: path(id), text: JSON.stringify({ ...record, archived }), expected }])
    },
    list(before = '') {
      if (before && !ID.test(before)) throw Error('Invalid saved-command cursor.')
      noLinkedPath(root); if (!existsSync(root)) return { items: [] as SavedCommand[], next: '', notice: '' }
      const names = readdirSync(root).filter(name => name.endsWith('.json'))
      const ids = names.map(name => name.slice(0, -5)).filter(id => ID.test(id)).sort().reverse().filter(id => !before || id < before)
      const items: SavedCommand[] = []; let damaged = names.some(name => !ID.test(name.slice(0, -5)))
      for (const id of ids.slice(0, 20)) { try { items.push(read(id)) } catch { damaged = true } }
      return { items, next: ids.length > 20 ? ids[19] : '', notice: damaged ? 'Some saved commands could not be read. They were not repaired or executed.' : '' }
    },
  }
}
