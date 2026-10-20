import { describe, expect, it } from 'vitest'
import { ownerConfirmedVaultQueries, parseVaultSearchProposal, vaultFollowupDraft } from '../src/shared/lib/retrievalProposal'

describe('visible model-directed vault follow-ups', () => {
  it('parses only a labelled bounded proposal', () => {
    expect(parseVaultSearchProposal('- Query: hidden')).toBeNull()
    expect(parseVaultSearchProposal('### Vault search request\n- Query: launch notes\n- Query: provider outage\n- Why: The first pass did not include the date.')).toEqual({ queries: ['launch notes', 'provider outage'], reason: 'The first pass did not include the date.' })
  })
  it('requires the app marker before main-process multi-query semantics apply', () => {
    const proposal = { queries: ['launch notes', 'provider outage'], reason: 'Need the date' }
    const draft = vaultFollowupDraft(proposal)
    expect(ownerConfirmedVaultQueries(draft)).toEqual(proposal.queries)
    expect(ownerConfirmedVaultQueries('Query: launch notes')).toEqual([])
    expect(draft).toContain('owner must send')
  })
  it('bounds and deduplicates query lines', () => {
    const draft = '[OddBrain owner-confirmed vault follow-up]\nQuery: one\nQuery: one\nQuery: two\nQuery: three\nQuery: four'
    expect(ownerConfirmedVaultQueries(draft)).toEqual(['one', 'two', 'three'])
  })
})
