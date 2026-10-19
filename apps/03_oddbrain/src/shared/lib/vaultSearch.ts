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

/** What the walk actually did, as the search route reports it. */
export type VaultScan = {
  files: number
  bytes: number
  capped: boolean
  partial: number
}

/**
 * The line under the results when the search did not see the whole vault.
 *
 * Silence is only honest when nothing was cut off. If the walk stopped at its
 * file or size bound, or read a large file only in part, the palette says so
 * rather than letting "no results" mean "no look".
 */
export function vaultScanNote(scan?: VaultScan): string {
  if (!scan) return ''
  const parts: string[] = []
  if (scan.capped) parts.push(`Searched ${scan.files} files, then stopped at the limit; the rest was not searched.`)
  if (scan.partial > 0) {
    parts.push(`${scan.partial} ${scan.partial === 1 ? 'file was' : 'files were'} longer than 64 KB and read in part.`)
  }
  return parts.join(' ')
}
