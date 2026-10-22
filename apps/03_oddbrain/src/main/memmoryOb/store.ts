import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Chat, Message } from '../../shared/types'
import type { Project } from '../../shared/lib/projects'
import type { WorkingNotesRead } from '../../shared/lib/workingNotesStore'
import { workingNotesText } from '../../shared/lib/chatContext'
import type { AttachmentCenterState } from '../../shared/lib/attachmentCenter'
import type { TranscriptHeader } from '../../shared/lib/transcripts'
import type { ProcessingLedger } from '../../shared/lib/processingLedger'
import type { MemoryWorkspace } from '../../shared/lib/memoryWorkspace'
import {
  MEMMORY_OB_FORMAT,
  MEMMORY_OB_VERSION,
  memmoryChatLifecycle,
  memmoryProjectLifecycle,
  normalizeMemmoryObject,
  normalizeMemmoryRelationship,
  type MemmoryManifest,
  type MemmoryLifecycle,
  type MemmoryObject,
  type MemmoryRelationship,
  type MemmoryProjectView,
  type MemmoryReadView,
  type MemmorySearchHit,
} from '../../shared/lib/memmoryOb'
import { readRecoverableJson, writeRecoverableJson } from '../recoverableJson'

const sha = (value: string): string => createHash('sha256').update(value).digest('hex')
const nowIso = (): string => new Date().toISOString()
const recordId = (kind: 'app-chat' | 'native-transcript' | 'imported-conversation' | 'project' | 'working-note' | 'attachment' | 'job', id: string): string => `${kind}:${id}`
const words = (value: string): string[] => [...new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) || [])].slice(0, 32)
const excerpt = (text: string, terms: string[], maximum = 3_000): { text: string; start: number; end: number } => {
  if (text.length <= maximum) return { text, start: 0, end: text.length }
  const lower = text.toLocaleLowerCase(), first = terms.map(term => lower.indexOf(term)).filter(index => index >= 0).sort((a, b) => a - b)[0] ?? 0
  const start = Math.max(0, Math.min(text.length - maximum, first - Math.floor(maximum / 3)))
  return { text: text.slice(start, start + maximum), start, end: start + maximum }
}

function emptyManifest(): MemmoryManifest {
  const at = nowIso()
  return { format: MEMMORY_OB_FORMAT, version: MEMMORY_OB_VERSION, revision: 0, createdAt: at, updatedAt: at, records: 0, relationships: 0, lastChatStoreRevision: 0 }
}

function manifest(value: unknown): MemmoryManifest {
  const row = value as MemmoryManifest
  if (!row || row.format !== MEMMORY_OB_FORMAT || row.version !== MEMMORY_OB_VERSION || !Number.isSafeInteger(row.revision) || row.revision < 0 || !Number.isSafeInteger(row.records) || row.records < 0 || !Number.isSafeInteger(row.relationships) || row.relationships < 0 || !Number.isSafeInteger(row.lastChatStoreRevision) || row.lastChatStoreRevision < 0 || !Number.isFinite(Date.parse(row.createdAt)) || !Number.isFinite(Date.parse(row.updatedAt))) throw Error('The Memmory_OB manifest is unreadable. Original object files were not changed.')
  return structuredClone(row)
}

export function createMemmoryObStore(root: string) {
  const manifestFile = join(root, 'manifest.json'), objectRoot = join(root, 'objects'), relationshipRoot = join(root, 'relationships')
  const records = new Map<string, MemmoryObject>(), relationships = new Map<string, MemmoryRelationship>(), chats = new Map<string, Chat>(), projects = new Map<string, Project>()
  const workingNoteText = new Map<string, { revisionId: string; text: string; author: 'user' | 'ai' }>()
  let state = readRecoverableJson(manifestFile, manifest, emptyManifest()).value
  const fileFor = (base: string, id: string): string => {
    const digest = sha(id)
    return join(base, digest.slice(0, 2), `${digest}.json`)
  }
  const load = (): void => {
    records.clear(); relationships.clear()
    const scan = <T extends { id: string }>(base: string, target: Map<string, T>, normalize: (value: unknown) => T, label: string): void => {
      if (!existsSync(base)) return
      for (const bucket of readdirSync(base)) {
        const folder = join(base, bucket)
        if (!/^[a-f0-9]{2}$/.test(bucket) || !lstatSync(folder).isDirectory()) continue
        for (const name of readdirSync(folder)) {
          if (!/^[a-f0-9]{64}\.json$/.test(name)) continue
          const value = readRecoverableJson(join(folder, name), normalize, null as never).value
          if (sha(value.id) !== name.slice(0, 64) || target.has(value.id)) throw Error(`Memmory_OB contains a conflicting ${label} identity. Originals were not changed.`)
          target.set(value.id, value)
        }
      }
    }
    scan(objectRoot, records, normalizeMemmoryObject, 'object')
    scan(relationshipRoot, relationships, normalizeMemmoryRelationship, 'relationship')
    if (state.records !== records.size || state.relationships !== relationships.size) {
      state = { ...state, records: records.size, relationships: relationships.size, updatedAt: nowIso() }
      writeRecoverableJson(manifestFile, state)
    }
  }
  load()

  const commit = (changed: MemmoryObject[], changedRelationships: MemmoryRelationship[] = [], chatRevision = state.lastChatStoreRevision): void => {
    if (!changed.length && !changedRelationships.length && chatRevision === state.lastChatStoreRevision) return
    mkdirSync(objectRoot, { recursive: true, mode: 0o700 }); mkdirSync(relationshipRoot, { recursive: true, mode: 0o700 })
    for (const row of changed) { writeRecoverableJson(fileFor(objectRoot, row.id), row); records.set(row.id, row) }
    for (const row of changedRelationships) { writeRecoverableJson(fileFor(relationshipRoot, row.id), row); relationships.set(row.id, row) }
    state = { ...state, revision: state.revision + 1, updatedAt: nowIso(), records: records.size, relationships: relationships.size, lastChatStoreRevision: Math.max(state.lastChatStoreRevision, chatRevision) }
    writeRecoverableJson(manifestFile, state)
  }

  const nextObject = (previous: MemmoryObject | undefined, candidate: Omit<MemmoryObject, 'revision' | 'createdAt' | 'updatedAt' | 'useCount'>): MemmoryObject | null => {
    const comparable = previous ? { ...previous, revision: 0, createdAt: '', updatedAt: '', useCount: 0, lastUsedAt: undefined } : null
    const proposed = { ...candidate, revision: 0, createdAt: '', updatedAt: '', useCount: 0, lastUsedAt: undefined }
    if (comparable && JSON.stringify(comparable) === JSON.stringify(proposed)) return null
    const at = nowIso()
    return normalizeMemmoryObject({ ...candidate, revision: (previous?.revision || 0) + 1, createdAt: previous?.createdAt || at, updatedAt: at, useCount: previous?.useCount || 0, ...(previous?.lastUsedAt ? { lastUsedAt: previous.lastUsedAt } : {}) })
  }

  const nextRelationship = (previous: MemmoryRelationship | undefined, candidate: Omit<MemmoryRelationship, 'revision' | 'createdAt' | 'updatedAt'>): MemmoryRelationship | null => {
    const comparable = previous ? { ...previous, revision: 0, createdAt: '', updatedAt: '' } : null
    const proposed = { ...candidate, revision: 0, createdAt: '', updatedAt: '' }
    if (comparable && JSON.stringify(comparable) === JSON.stringify(proposed)) return null
    const at = nowIso()
    return normalizeMemmoryRelationship({ ...candidate, revision: (previous?.revision || 0) + 1, createdAt: previous?.createdAt || at, updatedAt: at })
  }

  const syncChats = (value: Chat[], chatRevision = state.lastChatStoreRevision): void => {
    const changed: MemmoryObject[] = [], changedRelationships: MemmoryRelationship[] = []
    chats.clear()
    for (const chat of value) {
      chats.set(chat.id, chat)
      const id = recordId('app-chat', chat.id), previous = records.get(id), lifecycle = memmoryChatLifecycle(chat)
      const relationshipId = chat.projectId ? `belongs-to-project:${chat.id}:${chat.projectId}` : ''
      for (const relationship of relationships.values()) {
        if (relationship.from !== id || relationship.kind !== 'belongs-to-project' || relationship.state !== 'active' || relationship.id === relationshipId) continue
        const rejected = nextRelationship(relationship, { id: relationship.id, from: relationship.from, to: relationship.to, kind: relationship.kind, state: 'rejected', sourceIds: relationship.sourceIds })
        if (rejected) changedRelationships.push(rejected)
      }
      if (chat.projectId) {
        const relation = nextRelationship(relationships.get(relationshipId), { id: relationshipId, from: id, to: recordId('project', chat.projectId), kind: 'belongs-to-project', state: 'active', sourceIds: [id] })
        if (relation) changedRelationships.push(relation)
      }
      const chatRelationshipIds = relationshipId ? [relationshipId] : []
      const branchSource = chat.branchedFrom?.chatId || chat.branchOf || ''
      const branchRelationshipId = branchSource && branchSource !== chat.id ? `branch-of:${chat.id}:${branchSource}` : ''
      for (const relationship of relationships.values()) {
        if (relationship.from !== id || relationship.kind !== 'branch-of' || relationship.state !== 'active' || relationship.id === branchRelationshipId) continue
        const rejected = nextRelationship(relationship, { id: relationship.id, from: relationship.from, to: relationship.to, kind: relationship.kind, state: 'rejected', sourceIds: relationship.sourceIds })
        if (rejected) changedRelationships.push(rejected)
      }
      if (branchRelationshipId) {
        const sourceIds = [id, recordId('app-chat', branchSource), ...(chat.branchedFrom?.messageId ? [`message:${chat.branchedFrom.messageId}`] : [])]
        const relation = nextRelationship(relationships.get(branchRelationshipId), { id: branchRelationshipId, from: id, to: recordId('app-chat', branchSource), kind: 'branch-of', state: 'active', sourceIds })
        if (relation) changedRelationships.push(relation)
        chatRelationshipIds.push(branchRelationshipId)
      }
      for (const message of chat.messages) {
        if (message.contextReceipt) {
          const receiptId = `receipt:model:${chat.id}:${message.id}`, relationship = `derived-from:${receiptId}:${id}`, previousReceipt = records.get(receiptId)
          const relation = nextRelationship(relationships.get(relationship), { id: relationship, from: receiptId, to: id, kind: 'derived-from', state: 'active', sourceIds: [receiptId, id] })
          if (relation) changedRelationships.push(relation)
          chatRelationshipIds.push(relationship)
          const receiptTrash = lifecycle === 'trash' ? (chat.trash || previousReceipt?.trash || { at: nowIso(), by: 'owner' as const, reason: 'Parent app chat moved to Trash', previous: 'active' as const }) : undefined
          const receipt = nextObject(previousReceipt, {
            id: receiptId, kind: 'receipt', title: `${chat.title || 'Conversation'} · model context receipt`, scope: chat.projectId ? { kind: 'project', projectId: chat.projectId } : { kind: 'chat', chatId: chat.id }, authority: 'raw', lifecycle,
            source: { domain: 'generated', externalId: receiptId, conversation: chat.id, message: message.id }, projectIds: chat.projectId ? [chat.projectId] : [], relationshipIds: [relationship], attachmentIds: [],
            contentHash: sha(JSON.stringify(message.contextReceipt)), summary: { messages: message.contextReceipt.includedMessages, references: message.contextReceipt.omitted.length }, sensitivity: 'local-only', neverSend: false, ...(receiptTrash ? { trash: receiptTrash } : {}),
          })
          if (receipt) changed.push(receipt)
        }
        if (!message.nativeRecord?.transcriptId) continue
        const transcriptId = recordId('native-transcript', message.nativeRecord.transcriptId), previousTranscript = records.get(transcriptId)
        const sourceRelationshipId = `source-of:${message.nativeRecord.transcriptId}:${chat.id}`
        const relation = nextRelationship(relationships.get(sourceRelationshipId), { id: sourceRelationshipId, from: transcriptId, to: id, kind: 'source-of', state: 'active', sourceIds: [transcriptId, id] })
        if (relation) changedRelationships.push(relation)
        chatRelationshipIds.push(sourceRelationshipId)
        const transcriptRelationships = [sourceRelationshipId]
        const transcriptTrash = lifecycle === 'trash' ? (chat.trash || previousTranscript?.trash || { at: nowIso(), by: 'owner' as const, reason: 'Parent app chat moved to Trash', previous: 'active' as const }) : undefined
        const descriptor = message.nativeRecord
        if (descriptor.context) {
          const receiptId = `receipt:native:${descriptor.transcriptId}`, relationship = `derived-from:${receiptId}:${transcriptId}`, previousReceipt = records.get(receiptId)
          const receiptRelation = nextRelationship(relationships.get(relationship), { id: relationship, from: receiptId, to: transcriptId, kind: 'derived-from', state: 'active', sourceIds: [receiptId, transcriptId] })
          if (receiptRelation) changedRelationships.push(receiptRelation)
          transcriptRelationships.push(relationship)
          const receiptTrash = lifecycle === 'trash' ? (chat.trash || previousReceipt?.trash || { at: nowIso(), by: 'owner' as const, reason: 'Parent app chat moved to Trash', previous: 'active' as const }) : undefined
          const receipt = nextObject(previousReceipt, {
            id: receiptId, kind: 'receipt', title: `${chat.title || 'Conversation'} · native context receipt`, scope: chat.projectId ? { kind: 'project', projectId: chat.projectId } : { kind: 'chat', chatId: chat.id }, authority: 'raw', lifecycle,
            source: { domain: 'generated', externalId: receiptId, conversation: chat.id, message: message.id, provider: descriptor.engine }, projectIds: chat.projectId ? [chat.projectId] : [], relationshipIds: [relationship], attachmentIds: [],
            contentHash: sha(JSON.stringify(descriptor.context)), summary: { characters: descriptor.context.characters, references: descriptor.context.sources.length }, sensitivity: 'local-only', neverSend: false, ...(receiptTrash ? { trash: receiptTrash } : {}),
          })
          if (receipt) changed.push(receipt)
        }
        const transcript = nextObject(previousTranscript, {
          id: transcriptId, kind: 'native-transcript', title: `${chat.title || 'Untitled conversation'} · native turn`, scope: chat.projectId ? { kind: 'project', projectId: chat.projectId } : { kind: 'chat', chatId: chat.id }, authority: 'raw', lifecycle,
          source: { domain: 'native-transcript', externalId: descriptor.transcriptId, conversation: chat.id, message: message.id, provider: descriptor.engine }, projectIds: chat.projectId ? [chat.projectId] : [], relationshipIds: transcriptRelationships,
          attachmentIds: [...(descriptor.images || []).map(item => `${descriptor.transcriptId}:${item.id}`), ...(descriptor.attachments || []).map(item => `${descriptor.transcriptId}:${item.id}`), ...(descriptor.artifacts || []).map(item => `${descriptor.transcriptId}:${item.id}`)],
          contentHash: sha(JSON.stringify({ descriptor, messageId: message.id, content: message.content })), summary: { messages: 1, characters: message.content.length }, sensitivity: 'local-only', neverSend: false, ...(transcriptTrash ? { trash: transcriptTrash } : {}),
        })
        if (transcript) changed.push(transcript)
      }
      const importedMessages = chat.messages.filter(message => message.origin === 'import')
      const importedId = recordId('imported-conversation', chat.id), previousImport = records.get(importedId)
      if (importedMessages.length) {
        const relationship = `source-of:import:${chat.id}`
        const relation = nextRelationship(relationships.get(relationship), { id: relationship, from: importedId, to: id, kind: 'source-of', state: 'active', sourceIds: [importedId, id] })
        if (relation) changedRelationships.push(relation)
        chatRelationshipIds.push(relationship)
        const importTrash = lifecycle === 'trash' ? (chat.trash || previousImport?.trash || { at: nowIso(), by: 'owner' as const, reason: 'Parent app chat moved to Trash', previous: 'active' as const }) : undefined
        const imported = nextObject(previousImport, {
          id: importedId, kind: 'imported-conversation', title: `${chat.title || 'Conversation'} · imported turns`, scope: chat.projectId ? { kind: 'project', projectId: chat.projectId } : { kind: 'chat', chatId: chat.id }, authority: 'raw', lifecycle,
          source: { domain: 'import', externalId: chat.recoveredFrom?.originalChatId || chat.id, conversation: chat.id, ...(chat.recoveredFrom ? { provider: 'OddBrain recovery import' } : {}) }, projectIds: chat.projectId ? [chat.projectId] : [], relationshipIds: [relationship],
          attachmentIds: importedMessages.flatMap(message => (message.attachments || []).map(attachment => attachment.id)), contentHash: sha(JSON.stringify(importedMessages)), summary: { messages: importedMessages.length, characters: importedMessages.reduce((total, message) => total + message.content.length, 0) }, sensitivity: 'local-only', neverSend: false, ...(importTrash ? { trash: importTrash } : {}),
        })
        if (imported) changed.push(imported)
      } else if (previousImport && previousImport.lifecycle !== 'archived') {
        const archived = nextObject(previousImport, {
          id: previousImport.id, kind: 'imported-conversation', title: previousImport.title, scope: previousImport.scope, authority: 'stale', lifecycle: 'archived', source: previousImport.source, projectIds: previousImport.projectIds, relationshipIds: previousImport.relationshipIds, attachmentIds: previousImport.attachmentIds,
          contentHash: previousImport.contentHash, summary: previousImport.summary, sensitivity: previousImport.sensitivity, neverSend: previousImport.neverSend,
        })
        if (archived) changed.push(archived)
      }
      const priorNote = records.get(recordId('working-note', chat.id))
      if (priorNote?.kind === 'working-note') {
        const noteTrash = lifecycle === 'trash' ? (chat.trash || priorNote.trash || { at: nowIso(), by: 'owner' as const, reason: 'Parent app chat moved to Trash', previous: 'active' as const }) : undefined
        const note = nextObject(priorNote, {
          id: priorNote.id, kind: 'working-note', title: `${chat.title || 'Conversation'} · Working Notes`, scope: chat.projectId ? { kind: 'project', projectId: chat.projectId } : { kind: 'chat', chatId: chat.id }, authority: priorNote.authority, lifecycle,
          source: priorNote.source, projectIds: chat.projectId ? [chat.projectId] : [], relationshipIds: priorNote.relationshipIds, attachmentIds: priorNote.attachmentIds,
          contentHash: priorNote.contentHash, summary: priorNote.summary, sensitivity: priorNote.sensitivity, neverSend: priorNote.neverSend, ...(noteTrash ? { trash: noteTrash } : {}), ...(priorNote.text !== undefined ? { text: priorNote.text } : {}),
        })
        if (note) changed.push(note)
      }
      const characters = chat.messages.reduce((sum, message) => sum + message.content.length, 0)
      const trash = lifecycle === 'trash' ? (chat.trash || previous?.trash || { at: nowIso(), by: 'owner' as const, reason: 'Moved from app chats', previous: 'active' as const }) : undefined
      const candidate = nextObject(previous, {
        id, kind: 'app-chat', title: chat.title || 'Untitled conversation', scope: chat.projectId ? { kind: 'project', projectId: chat.projectId } : { kind: 'unscoped' }, authority: 'raw', lifecycle,
        source: { domain: 'app-chat', externalId: chat.id, conversation: chat.id }, projectIds: chat.projectId ? [chat.projectId] : [], relationshipIds: chatRelationshipIds, attachmentIds: [],
        contentHash: sha(JSON.stringify(chat)), summary: { messages: chat.messages.length, characters }, sensitivity: 'ordinary', neverSend: false, ...(trash ? { trash } : {}),
      })
      if (candidate) changed.push(candidate)
    }
    commit(changed, changedRelationships, chatRevision)
  }

  const syncProjects = (value: Project[]): void => {
    const changed: MemmoryObject[] = []
    projects.clear()
    for (const project of value) {
      projects.set(project.id, project)
      const id = recordId('project', project.id), previous = records.get(id), lifecycle = memmoryProjectLifecycle(project)
      const trash = lifecycle === 'trash' ? (project.trash || previous?.trash || { at: nowIso(), by: 'owner' as const, reason: 'Moved from Projects', previous: 'active' as const }) : undefined
      const candidate = nextObject(previous, {
        id, kind: 'project', title: project.name, scope: { kind: 'project', projectId: project.id }, authority: 'confirmed', lifecycle,
        source: { domain: 'project', externalId: project.id }, projectIds: [project.id], relationshipIds: [], attachmentIds: project.references.map(reference => `project-reference:${reference.id}`),
        contentHash: sha(JSON.stringify(project)), summary: { references: project.references.length, chats: [...chats.values()].filter(chat => chat.projectId === project.id).length }, sensitivity: 'ordinary', neverSend: false, ...(trash ? { trash } : {}),
      })
      if (candidate) changed.push(candidate)
    }
    commit(changed)
  }

  const syncWorkingNotes = (view: WorkingNotesRead): void => {
    if (!view.ok || !view.current) return
    const current = view.current, chat = chats.get(current.chatId), id = recordId('working-note', current.chatId), previous = records.get(id)
    workingNoteText.set(current.chatId, { revisionId: current.id, text: workingNotesText(current.notes), author: current.notes.author })
    const lifecycle = chat ? memmoryChatLifecycle(chat) : 'active'
    const relationshipId = `derived-from:working-note:${current.chatId}`
    const relation = nextRelationship(relationships.get(relationshipId), { id: relationshipId, from: id, to: recordId('app-chat', current.chatId), kind: 'derived-from', state: 'active', sourceIds: [id, recordId('app-chat', current.chatId)] })
    const trash = lifecycle === 'trash' ? (chat?.trash || previous?.trash || { at: nowIso(), by: 'owner' as const, reason: 'Parent app chat moved to Trash', previous: 'active' as const }) : undefined
    const serialized = JSON.stringify(current)
    const candidate = nextObject(previous, {
      id, kind: 'working-note', title: `${chat?.title || 'Conversation'} · Working Notes`, scope: chat?.projectId ? { kind: 'project', projectId: chat.projectId } : { kind: 'chat', chatId: current.chatId }, authority: 'draft', lifecycle,
      source: { domain: 'generated', externalId: current.id, conversation: current.chatId }, projectIds: chat?.projectId ? [chat.projectId] : [], relationshipIds: [relationshipId], attachmentIds: [],
      contentHash: sha(serialized), summary: { characters: serialized.length }, sensitivity: 'local-only', neverSend: false, ...(trash ? { trash } : {}),
    })
    commit(candidate ? [candidate] : [], relation ? [relation] : [])
  }

  const syncTranscriptHeaders = (headers: TranscriptHeader[]): void => {
    const changed: MemmoryObject[] = [], changedRelationships: MemmoryRelationship[] = []
    for (const header of headers) {
      const id = recordId('native-transcript', header.id)
      // A chat-linked object has richer message identity and coverage. Header
      // enumeration fills archive-only gaps; it never downgrades the richer row.
      if (records.has(id)) continue
      const chat = header.chatId ? chats.get(header.chatId) : undefined
      const lifecycle = chat ? memmoryChatLifecycle(chat) : 'archived'
      const relationshipId = header.chatId ? `source-of:${header.id}:${header.chatId}` : ''
      if (relationshipId) {
        const relation = nextRelationship(relationships.get(relationshipId), { id: relationshipId, from: id, to: recordId('app-chat', header.chatId!), kind: 'source-of', state: 'active', sourceIds: [id] })
        if (relation) changedRelationships.push(relation)
      }
      const trash = lifecycle === 'trash' ? (chat?.trash || { at: nowIso(), by: 'owner' as const, reason: 'Parent app chat moved to Trash', previous: 'active' as const }) : undefined
      const candidate = nextObject(undefined, {
        id, kind: 'native-transcript', title: header.title || 'Native turn', scope: chat?.projectId ? { kind: 'project', projectId: chat.projectId } : header.chatId ? { kind: 'chat', chatId: header.chatId } : { kind: 'unscoped' }, authority: 'raw', lifecycle,
        source: { domain: 'native-transcript', externalId: header.id, ...(header.chatId ? { conversation: header.chatId } : {}), provider: header.engine }, projectIds: chat?.projectId ? [chat.projectId] : [], relationshipIds: relationshipId ? [relationshipId] : [],
        attachmentIds: [...(header.images || []).map(item => `${header.id}:${item.id}`), ...(header.attachments || []).map(item => `${header.id}:${item.id}`)],
        contentHash: sha(JSON.stringify(header)), summary: { references: header.pictures + (header.attachments?.length || 0) }, sensitivity: 'local-only', neverSend: false, ...(trash ? { trash } : {}),
      })
      if (candidate) changed.push(candidate)
    }
    commit(changed, changedRelationships)
  }

  const syncAttachments = (stateValue: AttachmentCenterState): void => {
    const changed: MemmoryObject[] = [], changedRelationships: MemmoryRelationship[] = [], seen = new Set<string>()
    for (const attachment of stateValue.records) {
      const id = recordId('attachment', attachment.id), previous = records.get(id); seen.add(id)
      const relationshipIds: string[] = []
      for (const transcript of attachment.turnCopies) {
        const relationshipId = `attachment-of:${attachment.id}:${transcript}`; relationshipIds.push(relationshipId)
        const relation = nextRelationship(relationships.get(relationshipId), { id: relationshipId, from: id, to: recordId('native-transcript', transcript), kind: 'attachment-of', state: 'active', sourceIds: [id] })
        if (relation) changedRelationships.push(relation)
      }
      const candidate = nextObject(previous, {
        id, kind: 'attachment', title: attachment.name, scope: { kind: 'unscoped' }, authority: 'raw', lifecycle: 'active',
        source: { domain: 'attachment-center', externalId: attachment.id, locator: `attachment-center:${attachment.id}` }, projectIds: [], relationshipIds, attachmentIds: [attachment.sha256],
        contentHash: sha(JSON.stringify(attachment)), summary: { characters: attachment.coverage.length, references: attachment.turnCopies.length }, sensitivity: 'local-only', neverSend: false,
      })
      if (candidate) changed.push(candidate)
    }
    for (const previous of records.values()) {
      if (previous.kind !== 'attachment' || seen.has(previous.id) || previous.lifecycle === 'archived') continue
      const archived = nextObject(previous, {
        id: previous.id, kind: 'attachment', title: `${previous.title} · removed private copy`, scope: previous.scope, authority: 'stale', lifecycle: 'archived', source: previous.source, projectIds: previous.projectIds, relationshipIds: previous.relationshipIds, attachmentIds: previous.attachmentIds,
        contentHash: previous.contentHash, summary: previous.summary, sensitivity: previous.sensitivity, neverSend: previous.neverSend, ...(previous.text !== undefined ? { text: previous.text } : {}),
      })
      if (archived) changed.push(archived)
      for (const relationshipId of previous.relationshipIds) {
        const relationship = relationships.get(relationshipId)
        if (!relationship || relationship.state !== 'active') continue
        const rejected = nextRelationship(relationship, { id: relationship.id, from: relationship.from, to: relationship.to, kind: relationship.kind, state: 'rejected', sourceIds: relationship.sourceIds })
        if (rejected) changedRelationships.push(rejected)
      }
    }
    commit(changed, changedRelationships)
  }

  const syncJobs = (ledger: ProcessingLedger): void => {
    const changed: MemmoryObject[] = [], changedRelationships: MemmoryRelationship[] = []
    for (const job of ledger.jobs) {
      const id = recordId('job', job.id), previous = records.get(id), lifecycle = job.state === 'done' ? 'archived' : 'active'
      const sourceAttachment = [...records.values()].find(row => row.kind === 'attachment' && row.attachmentIds.includes(job.source.sha256))
      const relationshipId = sourceAttachment ? `derived-from:${id}:${sourceAttachment.id}` : ''
      if (relationshipId) {
        const relation = nextRelationship(relationships.get(relationshipId), { id: relationshipId, from: id, to: sourceAttachment!.id, kind: 'derived-from', state: 'active', sourceIds: [id, sourceAttachment!.id] })
        if (relation) changedRelationships.push(relation)
      }
      const candidate = nextObject(previous, {
        id, kind: 'job', title: `${job.processor} · ${job.source.name}`, scope: { kind: 'unscoped' }, authority: 'raw', lifecycle,
        source: { domain: 'generated', externalId: job.id, locator: `processing-job:${job.id}` }, projectIds: [], relationshipIds: relationshipId ? [relationshipId] : [], attachmentIds: [job.source.sha256],
        contentHash: sha(JSON.stringify(job)), summary: { references: job.sections.length }, sensitivity: 'local-only', neverSend: false,
      })
      if (candidate) changed.push(candidate)
    }
    commit(changed, changedRelationships)
  }

  const syncMemoryWorkspace = (workspace: MemoryWorkspace): void => {
    const changed: MemmoryObject[] = [], changedRelationships: MemmoryRelationship[] = []
    const personRelationshipIds = new Map<string, string[]>()
    const memorySources = new Map([...workspace.jobs.map(job => [job.source.id, job.source] as const), ...workspace.proposals.map(proposal => [proposal.source.id, proposal.source] as const)])
    for (const source of memorySources.values()) {
      const id = `raw-source:${source.id}`, previous = records.get(id)
      const domain: MemmoryObject['source']['domain'] = source.path.includes('/Browser/') ? 'browser' : source.path.includes('/Mobile/') ? 'mobile' : source.kind === 'confirmed' ? 'brain-memory' : 'import'
      const sourceChat = chats.get(source.conversation), projectId = sourceChat?.projectId || ''
      const candidate = nextObject(previous, {
        id, kind: 'raw-source', title: source.title || `${source.provider || 'Memory'} source`, scope: projectId ? { kind: 'project', projectId } : { kind: 'global' }, authority: 'raw', lifecycle: 'active',
        source: { domain, externalId: source.id, locator: source.path, provider: source.provider || 'unknown', account: source.account || undefined, conversation: source.conversation, message: source.message, speaker: source.speaker || source.role, role: source.role }, projectIds: projectId ? [projectId] : [], relationshipIds: [], attachmentIds: [],
        contentHash: /^[a-f0-9]{64}$/.test(source.hash) ? source.hash : sha(JSON.stringify(source)), summary: { messages: 1, characters: Math.max(0, source.end - source.start) }, sensitivity: 'sensitive', neverSend: false,
      })
      if (candidate) changed.push(candidate)
    }
    for (const merge of workspace.merges) {
      const relationship = `supersedes:person:${merge.from}:person:${merge.to}:${merge.id}`
      const candidate = nextRelationship(relationships.get(relationship), { id: relationship, from: `person:${merge.from}`, to: `person:${merge.to}`, kind: 'supersedes', state: merge.undone ? 'rejected' : 'active', sourceIds: [`memory-merge:${merge.id}`] })
      if (candidate) changedRelationships.push(candidate)
      for (const person of [merge.from, merge.to]) personRelationshipIds.set(person, [...(personRelationshipIds.get(person) || []), relationship])
    }
    for (const person of workspace.people) {
      const id = `person:${person.id}`, previous = records.get(id)
      const candidate = nextObject(previous, {
        id, kind: 'person', title: person.name || 'Unnamed person', scope: { kind: 'global' }, authority: 'confirmed', lifecycle: 'active', source: { domain: 'brain-memory', externalId: person.id }, projectIds: [], relationshipIds: personRelationshipIds.get(person.id) || [], attachmentIds: [],
        contentHash: sha(JSON.stringify({ person, accounts: workspace.accounts.filter(account => account.person === person.id) })), summary: { references: workspace.accounts.filter(account => account.person === person.id).length, characters: person.notes.length }, sensitivity: 'sensitive', neverSend: false,
      })
      if (candidate) changed.push(candidate)
    }
    for (const proposal of workspace.proposals) {
      const id = `interpretation:${proposal.id}`, previous = records.get(id)
      const kind: MemmoryObject['kind'] = proposal.state === 'approved' ? proposal.kind === 'journal' ? 'journal' : proposal.kind === 'story' ? 'life-story' : proposal.kind === 'capsule' ? 'capsule' : 'memory' : 'interpretation'
      const authority: MemmoryObject['authority'] = proposal.state === 'approved' ? 'confirmed' : proposal.state === 'rejected' ? 'rejected' : 'pending'
      const lifecycle: MemmoryLifecycle = proposal.state === 'rejected' ? 'archived' : 'active'
      const relationshipIds: string[] = []
      const rawSourceId = `raw-source:${proposal.source.id}`, sourceRelationship = `derived-from:${id}:${rawSourceId}`
      const rawSourceRelation = nextRelationship(relationships.get(sourceRelationship), { id: sourceRelationship, from: id, to: rawSourceId, kind: 'derived-from', state: 'active', sourceIds: [rawSourceId] })
      if (rawSourceRelation) changedRelationships.push(rawSourceRelation)
      relationshipIds.push(sourceRelationship)
      const sourceChat = chats.get(proposal.source.conversation)
      if (sourceChat) {
        const relationship = `derived-from:${id}:app-chat:${sourceChat.id}`
        const relation = nextRelationship(relationships.get(relationship), { id: relationship, from: id, to: `app-chat:${sourceChat.id}`, kind: 'derived-from', state: 'active', sourceIds: [proposal.source.id, `app-chat:${sourceChat.id}`] })
        if (relation) changedRelationships.push(relation)
        relationshipIds.push(relationship)
      }
      if (proposal.subject !== 'self' && workspace.people.some(person => person.id === proposal.subject)) {
        const relationship = `related:${id}:person:${proposal.subject}`
        const relation = nextRelationship(relationships.get(relationship), { id: relationship, from: id, to: `person:${proposal.subject}`, kind: 'related', state: proposal.state === 'rejected' ? 'rejected' : 'active', sourceIds: [proposal.source.id] })
        if (relation) changedRelationships.push(relation)
        relationshipIds.push(relationship)
      }
      proposal.history.forEach((history, index) => {
        const revisionId = `interpretation-revision:${proposal.id}:${history.revision || index + 1}`
        const relationshipKind: MemmoryRelationship['kind'] = history.state === 'approved' && proposal.state === 'approved' ? 'corrects' : 'supersedes'
        const relationship = `${relationshipKind}:${id}:${revisionId}`
        const relation = nextRelationship(relationships.get(relationship), { id: relationship, from: id, to: revisionId, kind: relationshipKind, state: 'active', sourceIds: [proposal.source.id, revisionId] })
        if (relation) changedRelationships.push(relation)
        relationshipIds.push(relationship)
        const revision = nextObject(records.get(revisionId), {
          id: revisionId, kind: 'interpretation', title: history.title || proposal.title || `${proposal.kind} revision`, scope: sourceChat?.projectId ? { kind: 'project', projectId: sourceChat.projectId } : { kind: 'global' }, authority: history.state === 'approved' ? 'confirmed' : history.state === 'rejected' ? 'rejected' : 'pending', lifecycle: 'archived',
          source: { domain: 'brain-memory', externalId: revisionId, locator: proposal.source.path, conversation: proposal.source.conversation, message: proposal.source.message }, projectIds: sourceChat?.projectId ? [sourceChat.projectId] : [], relationshipIds: [relationship], attachmentIds: [],
          contentHash: sha(JSON.stringify(history)), summary: { messages: 1, characters: history.text.length, references: 1 }, sensitivity: 'sensitive', neverSend: false,
        })
        if (revision) changed.push(revision)
      })
      const candidate = nextObject(previous, {
        id, kind, title: proposal.title || `${proposal.kind} record`, scope: sourceChat?.projectId ? { kind: 'project', projectId: sourceChat.projectId } : { kind: 'global' }, authority, lifecycle,
        source: { domain: 'brain-memory', externalId: proposal.source.id, locator: proposal.source.path, conversation: proposal.source.conversation, message: proposal.source.message, ...(proposal.source.provider ? { provider: proposal.source.provider } : {}), speaker: proposal.source.speaker || proposal.source.role }, projectIds: sourceChat?.projectId ? [sourceChat.projectId] : [], relationshipIds, attachmentIds: [],
        contentHash: sha(JSON.stringify(proposal)), summary: { messages: 1, characters: proposal.text.length, references: proposal.source.basis?.length || 1 }, sensitivity: 'sensitive', neverSend: false,
      })
      if (candidate) changed.push(candidate)
    }
    for (const job of workspace.jobs) {
      const id = `job:memory:${job.id}`, previous = records.get(id), rawSourceId = `raw-source:${job.source.id}`, relationship = `derived-from:${id}:${rawSourceId}`, sourceChat = chats.get(job.source.conversation)
      const relation = nextRelationship(relationships.get(relationship), { id: relationship, from: id, to: rawSourceId, kind: 'derived-from', state: 'active', sourceIds: [rawSourceId] })
      if (relation) changedRelationships.push(relation)
      const candidate = nextObject(previous, {
        id, kind: 'job', title: `Memory review · ${job.source.title || job.source.id}`, scope: sourceChat?.projectId ? { kind: 'project', projectId: sourceChat.projectId } : { kind: 'global' }, authority: 'raw', lifecycle: job.state === 'done' ? 'archived' : 'active', source: { domain: 'generated', externalId: job.id, locator: job.source.path, conversation: job.source.conversation, message: job.source.message }, projectIds: sourceChat?.projectId ? [sourceChat.projectId] : [], relationshipIds: [relationship], attachmentIds: [],
        contentHash: sha(JSON.stringify(job)), summary: { messages: 1, references: job.attempts }, sensitivity: 'sensitive', neverSend: false,
      })
      if (candidate) changed.push(candidate)
    }
    commit(changed, changedRelationships)
  }

  const scoreText = (text: string, terms: string[]): number => {
    const lower = text.toLocaleLowerCase()
    return terms.reduce((score, term) => score + (lower.includes(term) ? 2 : 0) + (lower.startsWith(term) ? 1 : 0), 0)
  }
  const scoreMessage = (message: Message, terms: string[]): number => scoreText(message.content, terms)

  const search = (input: { query: string; projectId?: string; currentChatId?: string; limit?: number; kinds?: MemmoryObject['kind'][] }): MemmorySearchHit[] => {
    const terms = words(input.query), limit = Math.max(1, Math.min(20, Number.isSafeInteger(input.limit) ? input.limit! : 6))
    if (!terms.length) return []
    const hits: MemmorySearchHit[] = []
    if (!input.kinds || input.kinds.includes('app-chat')) for (const chat of chats.values()) {
      if (memmoryChatLifecycle(chat) !== 'active' || chat.id === input.currentChatId || (input.projectId && chat.projectId !== input.projectId)) continue
      for (const message of chat.messages) {
        const score = scoreMessage(message, terms)
        if (!score) continue
        const slice = excerpt(message.content, terms), digest = sha(message.content)
        const coverage = slice.start === 0 && slice.end === message.content.length ? 'Complete stored message' : `Exact characters ${slice.start}–${slice.end} of ${message.content.length}; open the source for the remainder`
        hits.push({ recordId: recordId('app-chat', chat.id), kind: 'app-chat', title: chat.title, projectId: chat.projectId || null, chatId: chat.id, messageId: message.id, role: message.role, text: slice.text, start: slice.start, end: slice.end, totalCharacters: message.content.length, sha256: digest, coverage: message.origin === 'import' ? `Imported raw unconfirmed evidence; ${coverage}` : coverage, score })
      }
    }
    if (!input.kinds || input.kinds.includes('working-note')) for (const [chatId, note] of workingNoteText) {
      const chat = chats.get(chatId), record = records.get(recordId('working-note', chatId))
      if (!record || record.lifecycle !== 'active' || chatId === input.currentChatId || (input.projectId && chat?.projectId !== input.projectId)) continue
      const score = scoreText(note.text, terms)
      if (!score) continue
      const slice = excerpt(note.text, terms), digest = sha(note.text)
      hits.push({ recordId: record.id, kind: 'working-note', title: record.title, projectId: chat?.projectId || null, chatId, speaker: note.author, text: slice.text, start: slice.start, end: slice.end, totalCharacters: note.text.length, sha256: digest, coverage: slice.start === 0 && slice.end === note.text.length ? `Complete normalized Working Notes revision ${note.revisionId}` : `Exact characters ${slice.start}–${slice.end} of normalized Working Notes revision ${note.revisionId}; open the source for the remainder`, score })
    }
    return hits.sort((a, b) => b.score - a.score || b.end - b.start - (a.end - a.start) || a.recordId.localeCompare(b.recordId)).slice(0, limit)
  }

  const project = (projectId: string): MemmoryProjectView => {
    if (!projects.has(projectId) && !records.has(recordId('project', projectId))) throw Error('That Project is not indexed by Memmory_OB.')
    const relevant = [...records.values()].filter(row => row.projectIds.includes(projectId) || (row.scope.kind === 'project' && row.scope.projectId === projectId))
    return {
      projectId, revision: state.revision, sources: relevant.filter(row => ['raw','draft'].includes(row.authority)).length,
      chats: relevant.filter(row => row.kind === 'app-chat').length,
      messages: relevant.reduce((sum, row) => sum + (row.kind === 'app-chat' ? row.summary.messages || 0 : 0), 0),
      confirmed: relevant.filter(row => row.authority === 'confirmed' && row.kind !== 'project').length,
      pending: relevant.filter(row => row.authority === 'pending').length,
      conflicts: 0, trash: relevant.filter(row => row.lifecycle === 'trash').length,
      notice: 'Project sessions share relevant bounded sources through Memmory_OB. Raw chats remain evidence; Working Notes and native provider histories are not silently merged.',
    }
  }

  const read = (input: { lifecycle?: 'active' | 'archived' | 'trash'; projectId?: string; limit?: number } = {}): MemmoryReadView => {
    const limit = Math.max(1, Math.min(5_000, Number.isSafeInteger(input.limit) ? input.limit! : 500))
    const selected = [...records.values()].filter(row => (!input.lifecycle || row.lifecycle === input.lifecycle) && (!input.projectId || row.projectIds.includes(input.projectId) || (row.scope.kind === 'project' && row.scope.projectId === input.projectId))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit)
    const selectedIds = new Set(selected.map(row => row.id)), selectedRelationships = [...relationships.values()].filter(row => selectedIds.has(row.from) || selectedIds.has(row.to))
    return { manifest: structuredClone(state), records: structuredClone(selected), relationships: structuredClone(selectedRelationships), notice: selected.length === limit && records.size > selected.length ? `Showing ${limit.toLocaleString()} records; originals were not clipped or evicted.` : 'Memmory_OB catalogue loaded.', root }
  }

  return { read, project, search, syncChats, syncProjects, syncWorkingNotes, syncTranscriptHeaders, syncAttachments, syncJobs, syncMemoryWorkspace, revision: () => state.revision }
}

export type MemmoryObStore = ReturnType<typeof createMemmoryObStore>
