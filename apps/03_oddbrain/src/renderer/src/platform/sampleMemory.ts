import { changeMemory, emptyMemory, type MemoryBridge, type MemoryView, type MemoryWorkspace } from '@shared/lib/memoryWorkspace'
import { readSample, writeSample, sampleEnabled } from '@shared/lib/sampleWorkspace'
function seed(): MemoryWorkspace {
  const state = emptyMemory(); state.preferences.enabled = false
  state.people = [{ id: 'sam', name: 'Sam', notes: 'Sample person. No real messages or personal information.' }, { id: 'sami', name: 'Sami', notes: 'A separate sample identity, available for a merge demonstration.' }]
  state.accounts = [{ id: 'sample-messenger', label: 'Sam', provider: 'Messenger', scope: 'Sample workshop conversation', person: 'sam' }, { id: 'sample-discord', label: 'sami.codes', provider: 'Discord', scope: 'Sample workshop channel', person: 'sami' }]
  const source = { id: 'sample-source', path: '02 Sources/Sample workshop.md', title: 'Workshop planning · sample', provider: 'Messenger', conversation: 'sample-workshop', message: 'sample-message', role: 'self', speaker: 'You', account: '', kind: 'people' as const, observed: '2026-10-18T10:00:00Z', hash: 'sample', start: 0, end: 100 }
  state.proposals = [
    { id: 'sample-journal', source, kind: 'journal', subject: 'self', title: 'Helping at the workshop', text: 'You offered to prepare the repair table for the community workshop.', quote: 'I can get the repair table ready.', date: '', uncertainty: 'The date of the workshop was not established in this message.', model: 'Sample fixture — no model ran', authored: 'ai', state: 'pending', revision: 1, history: [] },
    { id: 'sample-story', source, kind: 'story', subject: 'self', title: 'Making room for shared work', text: 'Preparing the repair table was one small contribution to the community workshop. The source records an offer to help, not evidence that the workshop had already taken place.', quote: 'I can get the repair table ready.', date: '', uncertainty: 'Whether the event took place is still unconfirmed.', model: 'Sample fixture — no model ran', authored: 'ai', state: 'pending', revision: 1, history: [] },
  ]
  return state
}
const read = (): MemoryView => ({ ...(sampleEnabled() ? readSample('memory-workspace', seed()) : emptyMemory()), desktop: false, running: false, status: sampleEnabled() ? 'Sample records only. No background model or real capture is connected.' : 'Run the desktop app to organize your vault. Nothing is sent from this preview.', root: sampleEnabled() ? '/Sample workspace/Vault' : '' })
export const demoMemoryWorkspace: MemoryBridge = {
  read: async () => ({ ok: true, view: read() }),
  act: async action => {
    if (!sampleEnabled()) return { ok: false, error: 'The empty preview cannot write real memory. Open the desktop app or switch to the sample workspace.' }
    try { const next = changeMemory(read(), action, new Date().toISOString(), crypto.randomUUID()); writeSample('memory-workspace', next); return { ok: true, view: read() } }
    catch (e) { return { ok: false, error: (e as Error).message } }
  },
  run: async () => ({ ok: true, view: read() }),
}
