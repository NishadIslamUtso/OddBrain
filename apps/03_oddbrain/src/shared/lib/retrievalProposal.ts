export type VaultStage = { number: number; total: number; goal: string }
export type VaultSearchProposal = { queries: string[]; reason: string; stage?: VaultStage }

// Heading remains mandatory and visible. Formatting/case and narrowly equivalent
// wording are tolerated; unlabeled answer prose is never interpreted as a search.
const REQUEST_HEADING = /^#{1,6}[ \t]+Vault[ \t]+(?:search|retrieval|follow-up[ \t]+search)[ \t]+(?:request|proposal)[ \t]*[:.!-]?[ \t]*$/im
const OWNER_MARKER = '[OddBrain owner-confirmed vault follow-up]'
const clean = (value: string): string => value.trim().replace(/\s+/g, ' ').slice(0, 500)

/** Reads only a visible, explicitly labelled model proposal. It grants no search permission. */
export function parseVaultSearchProposal(text: string): VaultSearchProposal | null {
  const match = REQUEST_HEADING.exec(String(text || ''))
  if (!match) return null
  const section = text.slice(match.index + match[0].length).split(/^#{1,6}[ \t]+/m, 1)[0].slice(0, 5_000)
  const queries: string[] = []
  let reason = '', stageNumber = 0, stageTotal = 0, stageGoal = ''
  for (const line of section.split(/\r?\n/)) {
    const query = /^\s*[-*]\s*(?:Search[ \t]+)?Quer(?:y|ies):\s*(.+)$/i.exec(line)
    const why = /^\s*[-*]\s*(?:Why|Reason|Rationale):\s*(.+)$/i.exec(line)
    const stage = /^\s*[-*]\s*Stage:\s*(\d+)\s+(?:of|\/)\s*(\d+)\s*$/i.exec(line)
    const goal = /^\s*[-*]\s*Stage[ \t]+(?:goal|objective):\s*(.+)$/i.exec(line)
    if (query && queries.length < 3) {
      const value = clean(query[1])
      if (value && !queries.includes(value)) queries.push(value)
    } else if (why && !reason) reason = clean(why[1])
    else if (stage) { stageNumber = Number(stage[1]); stageTotal = Number(stage[2]) }
    else if (goal && !stageGoal) stageGoal = clean(goal[1])
  }
  const stage = stageNumber >= 1 && stageTotal >= stageNumber && stageTotal <= 12 ? { number: stageNumber, total: stageTotal, goal: stageGoal || reason || 'Complete this bounded evidence stage' } : undefined
  return queries.length ? { queries, reason, ...(stage ? { stage } : {}) } : null
}

/** The owner still has to send this visible draft; loading it never runs a search. */
export function vaultFollowupDraft(proposal: VaultSearchProposal): string {
  const stage = proposal.stage ? `\nStage: ${proposal.stage.number} of ${proposal.stage.total}\nStage goal: ${proposal.stage.goal}` : ''
  return `${OWNER_MARKER}\nThe owner must send this visible draft; loading it runs nothing. Search the chat’s already-approved read-only vault scope for these exact follow-up queries, then answer using only cited returned excerpts. If search is not approved for this chat, stop before model dispatch and tell me where to enable it.${stage}\n${proposal.queries.map(query => `Query: ${query}`).join('\n')}${proposal.reason ? `\nReason from the model’s visible proposal: ${proposal.reason}` : ''}`
}

/** Main-process parser: only the app-authored marker enables multi-query follow-up semantics. */
export function ownerConfirmedVaultRequest(prompt: string): { queries: string[]; stage?: VaultStage } {
  const text = String(prompt || '')
  if (!text.startsWith(OWNER_MARKER + '\n')) return { queries: [] }
  const queries: string[] = []
  let number = 0, total = 0, goal = ''
  for (const line of text.split(/\r?\n/)) {
    const match = /^Query:\s*(.+)$/i.exec(line)
    const stage = /^Stage:\s*(\d+)\s+of\s+(\d+)\s*$/i.exec(line)
    const stageGoal = /^Stage goal:\s*(.+)$/i.exec(line)
    if (match && queries.length < 3) {
      const value = clean(match[1])
      if (value && !queries.includes(value)) queries.push(value)
    } else if (stage) { number = Number(stage[1]); total = Number(stage[2]) }
    else if (stageGoal && !goal) goal = clean(stageGoal[1])
  }
  const validStage = number >= 1 && total >= number && total <= 12 && goal
  return { queries, ...(validStage ? { stage: { number, total, goal } } : {}) }
}
export function ownerConfirmedVaultQueries(prompt: string): string[] { return ownerConfirmedVaultRequest(prompt).queries }

export const VAULT_SEARCH_PROPOSAL_GUIDANCE = `When supplied evidence is insufficient and a narrow vault search could materially help, add a visible section titled "### Vault search request" with one to three bullets labelled Query and one optional Why bullet. Propose search words only, never commands, paths, permissions or actions. Do not claim the search ran. The app will merely prepare a visible follow-up draft; the owner must send it, and existing read-only vault approval is still required. If the work is larger than the supplied excerpts, complete only the current bounded stage, state what that stage covered, preserve cited findings and the next stage in the Working Notes proposal, and add "- Stage: N of T" plus "- Stage goal: ..." to the next vault-search request (at most 12 stages). Each stage requires the owner to review and send its visible draft; never continue automatically or claim the whole vault was read.`
