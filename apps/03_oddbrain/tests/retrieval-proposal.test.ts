import { describe, expect, it } from 'vitest'
import { ownerConfirmedVaultQueries, ownerConfirmedVaultRequest, parseVaultSearchProposal, vaultFollowupDraft } from '../src/shared/lib/retrievalProposal'

describe('visible model-directed vault follow-ups', () => {
  it('parses only a labelled bounded proposal', () => {
    expect(parseVaultSearchProposal('- Query: hidden')).toBeNull()
    expect(parseVaultSearchProposal('### Vault search request\n- Query: launch notes\n- Query: provider outage\n- Why: The first pass did not include the date.')).toEqual({ queries: ['launch notes', 'provider outage'], reason: 'The first pass did not include the date.' })
  })
  it('accepts safe heading aliases and punctuation without accepting ordinary prose', () => {
    expect(parseVaultSearchProposal('# Vault retrieval proposal!\n* Search query: outage date\n* Rationale: Citation is missing\n* Stage: 1 / 2\n* Stage objective: Find the primary note')).toEqual({ queries: ['outage date'], reason: 'Citation is missing', stage: { number: 1, total: 2, goal: 'Find the primary note' } })
    expect(parseVaultSearchProposal('Please make a vault search request. Query: secrets')).toBeNull()
    expect(parseVaultSearchProposal('####### Vault search request\n- Query: too deep')).toBeNull()
  })
  it('requires the app marker before main-process multi-query semantics apply', () => {
    const proposal = { queries: ['launch notes', 'provider outage'], reason: 'Need the date' }
    const draft = vaultFollowupDraft(proposal)
    expect(ownerConfirmedVaultQueries(draft)).toEqual(proposal.queries)
    expect(ownerConfirmedVaultQueries('Query: launch notes')).toEqual([])
    expect(draft).toContain('owner must send')
  })
  it('carries a bounded visible stage only through the owner-sent app draft', () => {
    const proposal = parseVaultSearchProposal('### Vault search request\n- Stage: 2 of 5\n- Stage goal: Verify the outage date\n- Query: provider outage')!
    expect(proposal.stage).toEqual({ number: 2, total: 5, goal: 'Verify the outage date' })
    expect(ownerConfirmedVaultRequest(vaultFollowupDraft(proposal)).stage).toEqual(proposal.stage)
    expect(parseVaultSearchProposal('### Vault search request\n- Stage: 13 of 13\n- Query: too many stages')?.stage).toBeUndefined()
  })
  it('bounds and deduplicates query lines', () => {
    const draft = '[OddBrain owner-confirmed vault follow-up]\nQuery: one\nQuery: one\nQuery: two\nQuery: three\nQuery: four'
    expect(ownerConfirmedVaultQueries(draft)).toEqual(['one', 'two', 'three'])
  })
})
