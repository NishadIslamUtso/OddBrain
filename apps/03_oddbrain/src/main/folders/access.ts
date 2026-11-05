import { randomUUID } from 'node:crypto'
import { lstatSync, readdirSync, realpathSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import type { FolderAccessState, FolderGrant } from '../../shared/lib/folderAccess'
import { readRecoverableJson, writeRecoverableJson } from '../recoverableJson'

const empty = (): FolderAccessState => ({ version: 1, revision: 0, grants: [] })
const validate = (value: unknown): FolderAccessState => {
  const state = value as FolderAccessState
  if (!state || state.version !== 1 || !Number.isInteger(state.revision) || state.revision < 0 || !Array.isArray(state.grants) || state.grants.some(row => !row || typeof row.id !== 'string' || typeof row.folder !== 'string' || typeof row.purpose !== 'string' || row.read !== true || typeof row.sessionOnly !== 'boolean' || ['write','watch','review','cloud','commands'].some(key => typeof row[key as keyof FolderGrant] !== 'boolean') || !Array.isArray(row.receipts) || row.receipts.some(receipt => !receipt || typeof receipt.at !== 'string' || !['granted','listed','revoked','expired'].includes(receipt.action) || typeof receipt.detail !== 'string'))) throw Error('Folder Access state needs repair. It was not reset.')
  return state
}
export function createFolderAccess(file: string, clock: () => Date = () => new Date()) {
  const readStored = (): FolderAccessState => readRecoverableJson(file, validate, empty()).value
  const save = (state: FolderAccessState): void => writeRecoverableJson(file, state)
  // Session-only authority from a prior process is revoked before any caller can use it.
  { const state = readStored(); let changed = false; for (const row of state.grants) if (row.sessionOnly && !row.revokedAt) { row.revokedAt = clock().toISOString(); row.receipts.push({ at: row.revokedAt, action: 'revoked', detail: 'Prior app session ended; session-only access was not carried forward.' }); changed = true } if (changed) { state.revision++; save(state) } }
  const expire = (state: FolderAccessState): FolderAccessState => {
    const now = clock(); let changed = false
    for (const row of state.grants) if (!row.revokedAt && row.expiresAt && Date.parse(row.expiresAt) <= now.getTime()) { row.revokedAt = now.toISOString(); row.receipts.push({ at: row.revokedAt, action: 'expired', detail: 'The chosen access duration ended. No files were changed or deleted.' }); changed = true }
    if (changed) { state.revision++; save(state) }
    return state
  }
  const current = (): FolderAccessState => expire(readStored())
  const active = (row: FolderGrant): boolean => !row.revokedAt && (!row.expiresAt || Date.parse(row.expiresAt) > clock().getTime())
  return {
    read(): FolderAccessState { return current() },
    grant(folderValue: string, input: { purpose: string; duration: 'session' | 'day' | 'until-revoked'; projectId?: string | null; write?: boolean; watch?: boolean; review?: boolean; cloud?: boolean; commands?: boolean }): FolderAccessState {
      const purpose = input.purpose.trim()
      if (!purpose || purpose.length > 500 || /[\u0000-\u001f]/.test(purpose)) throw Error('Describe a short, specific purpose for this folder.')
      const folder = realpathSync(resolve(folderValue)), stat = lstatSync(folder)
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Choose a normal folder, not a link.')
      const now = clock(), expiresAt = input.duration === 'day' ? new Date(now.getTime() + 86_400_000).toISOString() : null
      const state = current(), row: FolderGrant = { id: randomUUID(), folder, purpose, projectId: input.projectId || null, createdAt: now.toISOString(), expiresAt, revokedAt: null, sessionOnly: input.duration === 'session', read: true, write: input.write === true, watch: input.watch === true, review: input.review === true, cloud: input.cloud === true, commands: input.commands === true, receipts: [{ at: now.toISOString(), action: 'granted', detail: `Read access for “${purpose}”. Writes ${input.write ? 'allowed' : 'not allowed'}; watch ${input.watch ? 'allowed' : 'not allowed'}; review ${input.review ? 'allowed' : 'not allowed'}; cloud ${input.cloud ? 'allowed' : 'not allowed'}; commands ${input.commands ? 'allowed' : 'not allowed'}.` }] }
      state.grants.push(row); state.revision++; save(state); return state
    },
    revoke(id: string): FolderAccessState {
      const state = current(), row = state.grants.find(value => value.id === id)
      if (!row) throw Error('Folder grant not found.')
      if (!row.revokedAt) { row.revokedAt = clock().toISOString(); row.receipts.push({ at: row.revokedAt, action: 'revoked', detail: 'Owner revoked access. No files were changed or deleted.' }); state.revision++; save(state) }
      return state
    },
    list(id: string): { files: Array<{ path: string; bytes: number; modifiedAt: string }>; capped: boolean; answer: string } {
      const state = current(), row = state.grants.find(value => value.id === id)
      if (!row || !active(row)) throw Error('This folder access is revoked or expired.')
      const files: Array<{ path: string; bytes: number; modifiedAt: string }> = []; let visited = 0, capped = false
      const walk = (folder: string, depth: number): void => {
        if (depth > 20 || capped) { capped = true; return }
        for (const entry of readdirSync(folder, { withFileTypes: true })) {
          if (++visited > 5000 || files.length >= 500) { capped = true; return }
          const path = join(folder, entry.name), stat = lstatSync(path)
          if (stat.isSymbolicLink()) continue
          if (entry.isDirectory()) walk(path, depth + 1)
          else if (entry.isFile()) { const rel = relative(row.folder, path); if (rel && rel !== '..' && !rel.startsWith(`..${sep}`)) files.push({ path: rel.split(sep).join('/'), bytes: stat.size, modifiedAt: stat.mtime.toISOString() }) }
        }
      }
      walk(row.folder, 0)
      row.receipts.push({ at: clock().toISOString(), action: 'listed', detail: `Listed metadata for ${files.length} file(s)${capped ? ' up to the review limit' : ''}; no file contents were read.` }); state.revision++; save(state)
      return { files, capped, answer: `${files.length} file names and sizes listed. Contents were not read, captured, sent, watched, or changed.` }
    },
  }
}
