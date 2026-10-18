/** The window's honest totals, structurally the store's own. */
export type ContextTotals = {
  turns: number
  inTokens: number
  outTokens: number
  costUsd: number
}

/**
 * Small honest formatters for the card's Copy/Edit and the context line.
 * Everything here reformats what the app already truly holds — nothing is
 * inferred, nothing invented.
 */

export type CopyItem = { kind: 'status' | 'text' | 'thinking' | 'tool' | 'error'; text?: string; name?: string; summary?: string }

/** The turn as one copyable text: the work order, then the engine's words. */
export function turnCopyText(prompt: string, items: CopyItem[]): string {
  const words = items
    .filter(item => item.kind === 'text' && typeof item.text === 'string' && item.text.trim())
    .map(item => (item.text ?? '').trim())
    .join('\n\n')
  return [`Work order: ${prompt}`, '', words || '(the engine said nothing)'].join('\n')
}

/** The context line: honest numbers, scoped to this window. */
export function formatTotals(totals: ContextTotals): string {
  const cost = totals.costUsd > 0 ? ` · $${totals.costUsd.toFixed(4)}` : ''
  const thing = totals.turns === 1 ? 'turn' : 'turns'
  return `${totals.turns} ${thing} this window · ${totals.inTokens} in · ${totals.outTokens} out${cost}`
}
