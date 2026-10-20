export type VaultSearchProposal = { queries: string[]; reason: string }

const REQUEST_HEADING = /^#{2,4}\s+Vault search request\s*$/im
const OWNER_MARKER = '[OddBrain owner-confirmed vault follow-up]'
const clean = (value: string): string => value.trim().replace(/\s+/g, ' ').slice(0, 500)

/** Reads only a visible, explicitly labelled model proposal. It grants no search permission. */
export function parseVaultSearchProposal(text: string): VaultSearchProposal | null {
  const match = REQUEST_HEADING.exec(String(text || ''))
  if (!match) return null
  const section = text.slice(match.index + match[0].length).split(/^#{1,4}\s+/m, 1)[0].slice(0, 5_000)
  const queries: string[] = []
  let reason = ''
  for (const line of section.split(/\r?\n/)) {
    const query = /^\s*[-*]\s*Query:\s*(.+)$/i.exec(line)
    const why = /^\s*[-*]\s*(?:Why|Reason):\s*(.+)$/i.exec(line)
    if (query && queries.length < 3) {
      const value = clean(query[1])
      if (value && !queries.includes(value)) queries.push(value)
    } else if (why && !reason) reason = clean(why[1])
  }
  return queries.length ? { queries, reason } : null
}

/** The owner still has to send this visible draft; loading it never runs a search. */
export function vaultFollowupDraft(proposal: VaultSearchProposal): string {
  return `${OWNER_MARKER}\nThe owner must send this visible draft; loading it runs nothing. Search the chat’s already-approved read-only vault scope for these exact follow-up queries, then answer using only cited returned excerpts. If search is not approved for this chat, stop before model dispatch and tell me where to enable it.\n${proposal.queries.map(query => `Query: ${query}`).join('\n')}${proposal.reason ? `\nReason from the model’s visible proposal: ${proposal.reason}` : ''}`
}

/** Main-process parser: only the app-authored marker enables multi-query follow-up semantics. */
export function ownerConfirmedVaultQueries(prompt: string): string[] {
  const text = String(prompt || '')
  if (!text.startsWith(OWNER_MARKER + '\n')) return []
  const queries: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = /^Query:\s*(.+)$/i.exec(line)
    if (!match || queries.length >= 3) continue
    const value = clean(match[1])
    if (value && !queries.includes(value)) queries.push(value)
  }
  return queries
}

export const VAULT_SEARCH_PROPOSAL_GUIDANCE = `When supplied evidence is insufficient and a narrow vault search could materially help, add a visible section titled "### Vault search request" with one to three bullets labelled Query and one optional Why bullet. Propose search words only, never commands, paths, permissions or actions. Do not claim the search ran. The app will merely prepare a visible follow-up draft; the owner must send it, and existing read-only vault approval is still required. If the work is larger than the supplied excerpts, complete only the current bounded stage, state what that stage covered, preserve cited findings and the next stage in the Working Notes proposal, and never claim the whole vault was read.`
