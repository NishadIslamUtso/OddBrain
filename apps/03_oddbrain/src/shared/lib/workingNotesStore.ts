import type { WorkingNotes } from './chatContext'

export type WorkingNotesRevision = {
  id: string
  parent: string | null
  chatId: string
  at: string
  notes: WorkingNotes
  source: 'owner' | 'legacy-migration' | 'proposal-reviewed' | 'proposal-rejected' | 'recovery-import' | 'branch-copy'
  /** Present on an isolated branch copy so its exact source revision remains inspectable. */
  branchedFromRevision?: string
  /** Exact model proposal retained separately from the approved notes. */
  proposal?: WorkingNotes
  /** Proposal items absent from the owner-approved result. Never model authority. */
  notApproved?: string[]
}

export type WorkingNotesRead = {
  ok: boolean
  current: WorkingNotesRevision | null
  revisions: WorkingNotesRevision[]
  recovered?: boolean
  answer: string
}

export type WorkingNotesBridge = {
  read: (chatId: string) => Promise<WorkingNotesRead>
  save: (input: { chatId: string; expected: string | null; notes: WorkingNotes; proposal?: WorkingNotes }) => Promise<WorkingNotesRead>
  rejectProposal: (input: { chatId: string; expected: string | null; notes: WorkingNotes; proposal: WorkingNotes }) => Promise<WorkingNotesRead>
  migrate: (input: { chatId: string; notes: WorkingNotes[] }) => Promise<WorkingNotesRead>
  fork: (input: { sourceChatId: string; targetChatId: string; expectedSource: string | null }) => Promise<WorkingNotesRead>
  exportRecovery: (chatId: string) => Promise<{ ok: boolean; answer: string }>
  importRecovery: (chatId: string) => Promise<WorkingNotesRead>
}
