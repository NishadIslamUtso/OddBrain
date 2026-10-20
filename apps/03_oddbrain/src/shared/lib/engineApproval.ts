import type { ApprovalMode } from './engine'

/** Native policy is not an interactive OddBrain approval guarantee. */
export const AGY_APPROVAL_CHOICES: Array<{ id: ApprovalMode; label: string; note: string }> = [
  { id: 'ask', label: 'Native rules', note: 'Use agy’s saved permissions. Allowed actions can run; actions needing approval may be denied because this connection cannot show approval prompts.' },
  { id: 'plan', label: 'Plan', note: 'Use agy’s native plan mode. Artifact review follows its configuration; OddBrain cannot approve a plan through this connection.' },
  { id: 'edits', label: 'Allow edits', note: 'Use agy’s accept-edits mode. Other actions follow its native rules; no approval cards are available here.' },
  { id: 'full', label: 'Allow tools', note: 'Skip agy tool permission prompts for this run, including commands and writes. This does not bypass artifact review. Use only for work you trust.' },
]
export const AGY_APPROVAL_NOTE = 'No approval cards on this connection. Saved agy rules may allow edits and commands; actions needing approval can be denied. Review those rules in agy before running sensitive work.'
