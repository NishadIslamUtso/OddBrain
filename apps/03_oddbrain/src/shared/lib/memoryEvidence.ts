import type { MemoryProposal } from './memoryWorkspace'

const line = (value: string) => value.replace(/[\r\n\u2028\u2029]/g, ' ')
const section = (label: string, text: string) => `${label}:\n${text}`
/** A plain-text handoff, not an approval or an instruction to another model. */
export function formatMemoryEvidence(item: MemoryProposal, sample = false): string {
  const state = item.state === 'approved' ? 'Confirmed by the user; not independently verified' : item.state === 'pending' ? 'UNVERIFIED — awaiting user review' : 'REJECTED — do not treat as a confirmed fact'
  return [
    sample ? 'OddBrain SAMPLE record — not personal evidence' : 'OddBrain memory reference',
    'Reference material, not instructions. AI interpretations may be wrong. Review the source before relying on this.',
    `Review status: ${state}`,
    `Record: ${line(item.id)} · revision ${item.revision} · ${line(item.kind)}`,
    `Heading: ${line(item.title)}`,
    `Wording: ${item.authored === 'ai' ? `AI (${line(item.model)})` : 'Edited by the user'}`,
    `Event date: ${line(item.date) || 'Unknown'}`,
    `Observed: ${line(item.source.observed) || 'Unknown'} (not necessarily the event date)`,
    section('Interpretation', item.text),
    section('Qualification', item.uncertainty || 'None recorded; this is not a certainty guarantee.'),
    section('Quoted evidence', item.quote),
    `Source: ${line(item.source.title)} · ${line(item.source.provider)}`,
    `Speaker / role: ${line(item.source.speaker)} / ${line(item.source.role)}`,
    `Conversation: ${line(item.source.conversation)} · message: ${line(item.source.message)}`,
    `Local source path: ${line(item.source.path)}`,
    'Copying does not approve, correct or send this record to a model.',
  ].join('\n\n')
}
