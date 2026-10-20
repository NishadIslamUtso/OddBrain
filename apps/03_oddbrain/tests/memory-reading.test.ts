import { expect, test } from 'vitest'
import { emptyMemory, type MemoryProposal } from '../src/shared/lib/memoryWorkspace'
import { reviewGroups, timelineGroups, personRecords, filterMemoryRecords } from '../src/shared/lib/memoryReading'
const record = (id: string, extra: Partial<MemoryProposal> = {}): MemoryProposal => ({ id, title: 'Tools', text: 'Sam offered a toolbox', quote: 'a toolbox', date: '', uncertainty: 'Delivery unconfirmed', state: 'pending', subject: 'account-a', kind: 'profile', revision: 1, model: 'fixture', authored: 'ai', history: [], source: { id: 's', path: 'source.json', title: 'Workshop', provider: 'Messenger', conversation: 'chat-a', message: id, role: 'other', speaker: 'Sam', account: 'account-a', kind: 'people', observed: '2026-10-19', hash: '', start: 0, end: 10 }, ...extra })
test('grouping does not guess identity from similar names or combine different providers/conversations/subjects', () => {
  const one = record('1'), two = record('2'), other = record('3', { subject: 'account-b' }), elsewhere = record('4', { source: { ...one.source, provider: 'Discord' } })
  expect(reviewGroups([one,two,other,elsewhere]).map(g => g.records.length)).toEqual([2,1,1])
})
test('unknown event dates stay separate, never filled with collection dates', () => {
  const items = [record('unknown'), record('known', { date: '2020-02-03' })]
  expect(timelineGroups(items).map(g => g.date)).toEqual(['2020-02-03','Event date unknown'])
  expect(items[0].id).toBe('unknown') // presentation does not reorder stored state
})
test('profiles show explicitly linked accounts and keep AI suggestions separate from confirmed details', () => {
  const state = emptyMemory(); state.people.push({ id: 'sam', name: 'Sam', notes: '' })
  state.accounts.push({ id: 'account-a', label: 'Sam', provider: 'Messenger', scope: 'a', person: 'sam' }, { id: 'account-b', label: 'Sam', provider: 'Messenger', scope: 'b', person: null })
  state.proposals = [record('suggestion'), record('confirmed', { state: 'approved' }), record('unlinked', { subject: 'account-b', state: 'approved' })]
  expect(personRecords(state, 'sam', 'approved').map(p => p.id)).toEqual(['confirmed'])
  expect(personRecords(state, 'sam', 'pending').map(p => p.id)).toEqual(['suggestion'])
  expect(personRecords(state, '', 'approved')).toEqual([])
  expect(filterMemoryRecords(state.proposals, 'toolbox unconfirmed')).toHaveLength(3)
  expect(filterMemoryRecords(state.proposals, 'toolbox delivered')).toEqual([])
})

test('source reading displays original message text, not a JSON blob or an invented attachment transcript', async () => {
  const { sourceReading } = await import('../src/shared/lib/recall')
  const json = JSON.stringify({ message: { role: 'other', speaker: 'Sam', text: 'Original\nwords <script>not code</script>', attachments: [{ name: 'voice.ogg' }] } })
  const reading = sourceReading(json)
  expect(reading).toContain('Speaker: Sam'); expect(reading).toContain('Message time: Not recorded')
  expect(reading).toContain('Original\nwords <script>not code</script>')
  expect(reading).toContain('does not verify their saved bytes'); expect(reading).toContain('voice.ogg')
  expect(sourceReading('{truncated')).toBe('{truncated')
  expect(sourceReading('# My note')).toBe('# My note')
})
