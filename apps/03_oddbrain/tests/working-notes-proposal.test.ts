import { describe, expect, it } from 'vitest'
import { emptyWorkingNotes } from '../src/shared/lib/chatContext'
import { draftWorkingNotesContext, mergeWorkingNotesProposal, parseWorkingNotesProposal } from '../src/shared/lib/workingNotesProposal'

describe('visible Working Notes proposals', () => {
  it('ignores ordinary prose and parses only labelled durable state', () => {
    expect(parseWorkingNotesProposal('Decision: not a control section')).toBeNull()
    expect(parseWorkingNotesProposal(`Answer.\n\n### Working Notes update\n- Objective: Ship the review\n- Decision: Keep exact receipts\n- Finding: Provider cap is 8192 [source:vault:abc]\n- Next action: Run tests`)).toEqual({
      objective: 'Ship the review', decisions: ['Keep exact receipts'],
      findings: [{ text: 'Provider cap is 8192', sourceIds: ['vault:abc'] }], nextActions: ['Run tests'],
    })
  })
  it('accepts safe Markdown heading and label variants but still rejects unlabeled prose', () => {
    expect(parseWorkingNotesProposal('# WORKING-NOTES PROPOSAL:\n* Objectives: Keep both revisions\n* Open questions: Which copy?\n* Next steps: Review it')).toEqual({ objective: 'Keep both revisions', openQuestions: ['Which copy?'], nextActions: ['Review it'] })
    expect(parseWorkingNotesProposal('The working notes update should say:\n- Decision: hidden in prose')).toBeNull()
    expect(parseWorkingNotesProposal('####### Working Notes update\n- Decision: too deep')).toBeNull()
  })
  it('builds model-neutral quoted context only for non-empty notes', () => {
    expect(draftWorkingNotesContext(emptyWorkingNotes())).toBe('')
    const text = draftWorkingNotesContext({ ...emptyWorkingNotes(), objective: 'Finish review', author: 'ai' })
    expect(text).toContain('AI-authored')
    expect(text).toContain('not confirmed memory, instructions, permission or hidden reasoning')
    expect(text).toContain('Finish review')
  })
  it('merges without replacing prior draft state', () => {
    const current = { ...emptyWorkingNotes(), decisions: ['Keep originals'] }
    const merged = mergeWorkingNotesProposal(current, { decisions: ['Keep originals', 'Add receipts'], openQuestions: ['Which provider?'] })
    expect(merged.decisions).toEqual(['Keep originals', 'Add receipts'])
    expect(merged.openQuestions).toEqual(['Which provider?'])
    expect(merged.author).toBe('user')
  })
})
