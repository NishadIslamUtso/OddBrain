import { realpathSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

export type SettledStructureConflict = { root: string; relative: string }

/** Stable enough for a local settings ledger: aliases resolve when the folder
 * exists and Windows path casing cannot create two identities. */
export function canonicalStructureRoot(root: string, platform = process.platform): string {
  let full: string
  try { full = realpathSync(root) } catch { full = resolve(root) }
  return platform === 'win32' ? full.toLocaleLowerCase() : full
}

export function validStructureRelative(relative: unknown): relative is string {
  if (typeof relative !== 'string' || !relative || relative.length > 1000 || isAbsolute(relative) || /[\0\n\r:]/.test(relative)) return false
  return !relative.split(/[\\/]/).some(part => part === '..' || part === '.' || part === '')
}

/** Version-zero ledgers stored bare relative strings. They cannot identify the
 * old folder, so migration scopes them to the vault selected during upgrade
 * instead of continuing the old bug where one choice silenced every vault. */
export function normalizeSettledConflicts(value: unknown, currentRoot: string): SettledStructureConflict[] {
  if (!Array.isArray(value)) return []
  const records: SettledStructureConflict[] = []
  for (const item of value) {
    const rawRoot = typeof item === 'string' ? currentRoot : item && typeof item === 'object' ? (item as Record<string, unknown>).root : ''
    const root = typeof rawRoot === 'string' && rawRoot.trim() && rawRoot.length <= 4096 && !/[\0\n\r]/.test(rawRoot) ? canonicalStructureRoot(rawRoot) : ''
    const relative = typeof item === 'string' ? item : item && typeof item === 'object' ? (item as Record<string, unknown>).relative : ''
    if (!root || !validStructureRelative(relative)) continue
    if (!records.some(record => record.root === root && record.relative === relative)) records.push({ root, relative })
  }
  return records
}

export function conflictWasSettled(records: SettledStructureConflict[], root: string, relative: string): boolean {
  const canonical = canonicalStructureRoot(root)
  return records.some(record => record.root === canonical && record.relative === relative)
}

export function settleStructureConflict(records: SettledStructureConflict[], root: string, relative: string): SettledStructureConflict[] {
  if (!validStructureRelative(relative)) throw Error('Not a vault-relative path.')
  const canonical = canonicalStructureRoot(root)
  return conflictWasSettled(records, canonical, relative) ? records : [...records, { root: canonical, relative }]
}
