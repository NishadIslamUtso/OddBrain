/**
 * What a search hit says in the command palette.
 *
 * Kept apart from the component so the wording is testable without a browser,
 * and so the rule "say where this came from" has one home: a note is a vault
 * note, a captured message is the provider that said it, and the second line is
 * the line the words were found on.
 */
export type VaultSearchHit = {
  path: string
  kind: 'note' | 'conversation' | 'message' | string
  title?: string
  snippet?: { text?: string; start?: number; end?: number }
  conversation?: { provider?: string; title?: string }
}

export const HIT_DETAIL_CHARS = 110

export function vaultHitTitle(hit: VaultSearchHit): string {
  return hit.title?.trim() || hit.path.split('/').pop() || hit.path
}

export function vaultHitDetail(hit: VaultSearchHit, limit = HIT_DETAIL_CHARS): string {
  const source = hit.kind === 'note' ? 'Vault note' : hit.conversation?.provider || 'Captured conversation'
  // Whitespace in a snippet is a line break as far as the palette is concerned.
  const text = String(hit.snippet?.text || '').replace(/\s+/g, ' ').trim()
  return text ? `${source} · ${text.slice(0, limit)}${text.length > limit ? '…' : ''}` : source
}
