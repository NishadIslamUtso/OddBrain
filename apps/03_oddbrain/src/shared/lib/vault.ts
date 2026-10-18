import { sampleEnabled, sampleVaultReply } from './sampleWorkspace'
import type { Capsule } from '../types'
import { apiJson } from './ollama'

/** The vault API answers with JSON of many shapes, so each caller reads what it
 *  needs and treats anything missing as offline rather than as an error. */
export type VaultReply = Record<string, any>

export const vaultGet = (path: string, signal?: AbortSignal): Promise<VaultReply> =>
  sampleEnabled() ? (signal?.aborted ? Promise.reject(new DOMException('Aborted', 'AbortError')) : Promise.resolve(sampleVaultReply(path))) : apiJson<VaultReply>(`/api/vault${path}`, { signal })

export async function vaultPost(path: string, payload: unknown): Promise<VaultReply> {
  if (sampleEnabled()) throw new Error('This write is not simulated. No real vault was changed.')
  const data = await apiJson<VaultReply>(`/api/vault${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  if (data?.ok !== true) throw new Error(data?.error || 'The vault did not acknowledge this write. Nothing is reported as saved.')
  if (path === '/capture' && (data.skipped || typeof data.source !== 'string' || !data.source)) throw new Error(data.skipped ? `Vault capture was skipped: ${data.reason || 'source scope denied'}. The local original is kept.` : 'The vault returned no saved source path. Check the local API and retry; the local original is kept.')
  if (path === '/blacklist' && !Array.isArray(data.excluded_patterns)) throw new Error('The vault returned an invalid blacklist acknowledgement. Refresh and retry; no successful change is assumed.')
  return data
}
export function capsuleText(capsule: Capsule): string {
  return capsule.content || [
    `# ${capsule.title}`, capsule.goals?.length ? `## Goals\n${capsule.goals.map(goal => `- ${goal}`).join('\n')}` : '',
    capsule.constraints?.length ? `## Constraints\n${capsule.constraints.map(item => `- ${item}`).join('\n')}` : '',
    capsule.background || '', capsule.decisions?.length ? `## Decisions\n${capsule.decisions.map(item => `- ${item}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
}
export const CAPSULE_DRAG_TYPE = 'application/x-ai-assistant-capsule'

/** The capsule a drop carried, or null when the drag was not one. Throws a
 *  plain-language error when the payload is present but unusable. */
export function parseCapsuleDrop(transfer: DataTransfer): Capsule | null {
  const raw = transfer.getData(CAPSULE_DRAG_TYPE)
  if (!raw) return null
  try {
    const capsule = JSON.parse(raw) as Capsule
    if (typeof capsule.title !== 'string' || typeof capsule.content !== 'string' || capsule.content.length > 12_000) throw new Error()
    return capsule
  } catch { throw new Error('Invalid or oversized capsule. Maximum context bundle is 12,000 characters.') }
}

/* Facade used by TodayView (ported from this branch's earlier build).
   Every call degrades to null so an offline vault shows "offline" rather
   than throwing inside the modal. */
export const vault = {
  today: (signal?: AbortSignal): Promise<VaultReply | null> => vaultGet('/today', signal).catch(() => null),
  status: (signal?: AbortSignal): Promise<VaultReply | null> => vaultGet('/status', signal).catch(() => null),
  capsules: (query = '', signal?: AbortSignal): Promise<VaultReply | null> =>
    vaultGet(`/capsules${query ? `?q=${encodeURIComponent(query)}` : ''}`, signal).catch(() => null),
  context: (query: string, signal?: AbortSignal): Promise<VaultReply | null> =>
    vaultGet(`/context?q=${encodeURIComponent(query)}`, signal).catch(() => null),
  blacklist: (signal?: AbortSignal): Promise<VaultReply | null> => vaultGet('/blacklist', signal).catch(() => null),
  saveBlacklist: (patterns: string[]): Promise<VaultReply> =>
    vaultPost('/blacklist', { excluded_patterns: patterns }),
}
