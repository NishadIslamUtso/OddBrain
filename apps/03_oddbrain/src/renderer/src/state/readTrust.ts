import type { ReadTrustBridge, ReadTrustView } from '@shared/lib/readTrust'

const LEGACY_KEY = 'oddbrain:read-trust:v1'

/**
 * The old renderer rules are handed to the main process verbatim. They are
 * removed only after the main process has retained recovery data and reported
 * a complete migration; malformed or over-limit originals stay untouched.
 */
export async function loadReadTrust(api: ReadTrustBridge): Promise<{ view: ReadTrustView; notice: string }> {
  let raw: string | null = null
  try { raw = localStorage.getItem(LEGACY_KEY) } catch { /* desktop rules remain readable without legacy renderer storage */ }
  if (raw !== null) {
    const migrated = await api.migrateLegacy(raw)
    if (!migrated.ok || !migrated.view) throw Error(migrated.answer || 'Legacy read approvals could not be migrated. Their renderer copy was kept.')
    try { localStorage.removeItem(LEGACY_KEY) } catch { /* exact recovery is already in the main process */ }
    return { view: migrated.view, notice: migrated.answer }
  }
  const answer = await api.list()
  if (!answer.ok || !answer.view) throw Error(answer.error || 'Saved read approvals could not be read. None were changed.')
  return { view: answer.view, notice: answer.view.notice || '' }
}
