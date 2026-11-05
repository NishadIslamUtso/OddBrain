import type { MemoryProposal, MemoryWorkspace } from './memoryWorkspace'

/** Group only by the actual conversation AND subject, never a guessed identity. */
export function reviewGroups(items: MemoryProposal[]) {
  const groups = new Map<string, MemoryProposal[]>()
  for (const item of items) {
    const key = JSON.stringify([item.source.provider, item.source.conversation, item.subject])
    groups.set(key, [...(groups.get(key) || []), item])
  }
  return [...groups].map(([id, records]) => ({ id, records, title: records[0].source.title }))
}
export function personRecords(state: MemoryWorkspace, person: string, status: MemoryProposal['state']) {
  if (!state.people.some(p => p.id === person)) return []
  const accounts = new Set(state.accounts.filter(a => a.person === person).map(a => a.id))
  return state.proposals.filter(p => p.state === status && accounts.has(p.subject))
}
/** Observation time is not an event date. Unknown dates are their own section. */
export function timelineGroups(items: MemoryProposal[]) {
  const groups = new Map<string, MemoryProposal[]>()
  for (const item of [...items].sort((a,b) => (a.date || '9999').localeCompare(b.date || '9999') || a.source.observed.localeCompare(b.source.observed) || a.id.localeCompare(b.id))) {
    const date = item.date || 'Event date unknown'
    groups.set(date, [...(groups.get(date) || []), item])
  }
  return [...groups].map(([date, records]) => ({ date, records }))
}
export function filterMemoryRecords(items: MemoryProposal[], query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return items.filter(p => terms.every(t => `${p.title} ${p.text} ${p.quote} ${p.uncertainty} ${p.date} ${p.source.provider} ${p.source.speaker}`.toLowerCase().includes(t)))
}
