import { createHash, randomUUID } from 'node:crypto'
import { closeSync, constants, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { normalizeWorkingNotes, type WorkingNotes } from '../../shared/lib/chatContext'
import type { WorkingNotesRead, WorkingNotesRevision } from '../../shared/lib/workingNotesStore'

const MAX_REVISIONS = 10_000
const MAX_REVISION_BYTES = 600_000

function checkedNotes(value: unknown): WorkingNotes {
  const notes = normalizeWorkingNotes(value)
  if (JSON.stringify(notes) !== JSON.stringify(value)) throw Error('Working Notes are damaged or exceed their limits. Nothing was shortened.')
  return notes
}

function safeChatId(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 500 || /[\u0000-\u001f]/.test(value)) throw Error('Invalid conversation identity.')
  return value
}

function safeRevision(value: unknown, expectedChatId?: string): WorkingNotesRevision {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('A Working Notes revision is damaged.')
  const row = value as WorkingNotesRevision
  if (!/^[a-f0-9-]{36}$/.test(row.id) || !(row.parent === null || /^[a-f0-9-]{36}$/.test(row.parent)) || typeof row.at !== 'string' || !Number.isFinite(Date.parse(row.at))) throw Error('A Working Notes revision is damaged.')
  safeChatId(row.chatId)
  if (expectedChatId !== undefined && row.chatId !== expectedChatId) throw Error('The recovery file belongs to a different conversation.')
  if (!['owner', 'legacy-migration', 'proposal-reviewed', 'proposal-rejected', 'recovery-import', 'branch-copy'].includes(row.source)) throw Error('A Working Notes revision has an unknown source.')
  if (row.branchedFromRevision !== undefined && !/^[a-f0-9-]{36}$/.test(row.branchedFromRevision)) throw Error('A Working Notes branch source is damaged.')
  const notes = checkedNotes(row.notes), proposal = row.proposal === undefined ? undefined : checkedNotes(row.proposal)
  if (row.notApproved !== undefined && (!Array.isArray(row.notApproved) || row.notApproved.some(item => typeof item !== 'string' || item.length > 10_000))) throw Error('A Working Notes review record is damaged.')
  return { ...row, notes, ...(proposal ? { proposal } : {}), ...(row.notApproved ? { notApproved: [...row.notApproved] } : {}) }
}

function atomicWrite(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  let descriptor: number | null = null
  try {
    descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
    writeFileSync(descriptor, text, 'utf8'); fsyncSync(descriptor); closeSync(descriptor); descriptor = null
    renameSync(temporary, file)
  } finally {
    if (descriptor !== null) closeSync(descriptor)
    if (existsSync(temporary)) unlinkSync(temporary)
  }
}

function writeOnce(file: string, text: string): void {
  if (Buffer.byteLength(text) > MAX_REVISION_BYTES) throw Error('Working Notes revision exceeds 600,000 bytes. Nothing was shortened.')
  if (existsSync(file)) {
    if (readFileSync(file, 'utf8') !== text) throw Error('A conflicting Working Notes revision was preserved for review.')
    return
  }
  atomicWrite(file, text)
}

function flattened(notes: WorkingNotes): string[] {
  const rows = notes.objective ? [`Objective: ${notes.objective}`] : []
  for (const [label, values] of [['Plan', notes.plan], ['Decision', notes.decisions], ['Constraint', notes.constraints], ['Open question', notes.openQuestions], ['Uncertainty', notes.uncertainties], ['Next action', notes.nextActions]] as const) for (const value of values) rows.push(`${label}: ${value}`)
  for (const finding of notes.findings) rows.push(`Finding: ${finding.text} [${finding.sourceIds.join(', ')}]`)
  return rows
}

export function notApproved(proposal: WorkingNotes, approved: WorkingNotes): string[] {
  const kept = new Set(flattened(approved))
  return flattened(proposal).filter(item => !kept.has(item))
}

export class WorkingNotesStore {
  constructor(private readonly root: string) {}
  private folder(chatId: string): string { return join(this.root, createHash('sha256').update(safeChatId(chatId)).digest('hex')) }
  private pointer(chatId: string): string { return join(this.folder(chatId), 'current') }
  private revisionFile(chatId: string, id: string): string { return join(this.folder(chatId), `${id}.json`) }

  read(chatIdValue: string): WorkingNotesRead {
    const chatId = safeChatId(chatIdValue), folder = this.folder(chatId)
    if (!existsSync(folder)) return { ok: true, current: null, revisions: [], answer: 'No Working Notes saved for this conversation.' }
    const files = readdirSync(folder).filter(name => /^[a-f0-9-]{36}\.json$/.test(name))
    if (files.length > MAX_REVISIONS) throw Error(`More than ${MAX_REVISIONS.toLocaleString()} Working Notes revisions need manual recovery. Nothing was deleted.`)
    const revisions = files.map(name => {
      const text = readFileSync(join(folder, name), 'utf8')
      if (Buffer.byteLength(text) > MAX_REVISION_BYTES) throw Error('A Working Notes revision exceeds its recorded limit. Originals were kept.')
      return safeRevision(JSON.parse(text), chatId)
    })
    if (!revisions.length) return { ok: true, current: null, revisions: [], answer: 'No Working Notes saved for this conversation.' }
    const ids = new Set(revisions.map(row => row.id))
    if (ids.size !== revisions.length || revisions.some(row => row.parent && !ids.has(row.parent))) throw Error('Working Notes contain a missing or duplicate revision. Originals were kept.')
    const parents = new Set(revisions.map(row => row.parent).filter(Boolean)), tips = revisions.filter(row => !parents.has(row.id))
    if (tips.length !== 1) throw Error('Conflicting Working Notes revisions need review. Nothing was overwritten.')
    const seen = new Set<string>(); let cursor: WorkingNotesRevision | undefined = tips[0]
    while (cursor) { if (seen.has(cursor.id)) throw Error('Working Notes revision loop detected. Originals were kept.'); seen.add(cursor.id); cursor = cursor.parent ? revisions.find(row => row.id === cursor!.parent) : undefined }
    if (seen.size !== revisions.length) throw Error('Disconnected Working Notes revisions need review. Originals were kept.')
    let pointer = ''
    try { pointer = readFileSync(this.pointer(chatId), 'utf8').trim() } catch { /* immutable revisions are authoritative */ }
    const recovered = pointer !== tips[0].id
    if (recovered) atomicWrite(this.pointer(chatId), tips[0].id)
    return { ok: true, current: tips[0], revisions: revisions.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)), recovered, answer: recovered ? 'Working Notes recovered from complete revisions.' : 'Working Notes loaded.' }
  }

  save(input: { chatId: string; expected: string | null; notes: WorkingNotes; proposal?: WorkingNotes }, source: WorkingNotesRevision['source'] = input.proposal ? 'proposal-reviewed' : 'owner'): WorkingNotesRead {
    const chatId = safeChatId(input.chatId), before = this.read(chatId), expected = input.expected ?? null
    if ((before.current?.id ?? null) !== expected) throw Error('Working Notes changed elsewhere. Reload before saving; nothing was overwritten.')
    if (before.revisions.length >= MAX_REVISIONS) throw Error(`${MAX_REVISIONS.toLocaleString()} Working Notes revisions are retained. Export recovery before continuing; nothing was deleted.`)
    const notes = checkedNotes(input.notes), proposal = input.proposal === undefined ? undefined : checkedNotes(input.proposal)
    const revision: WorkingNotesRevision = { id: randomUUID(), parent: expected, chatId, at: new Date().toISOString(), notes, source,
      ...(proposal ? { proposal, notApproved: notApproved(proposal, notes) } : {}) }
    writeOnce(this.revisionFile(chatId, revision.id), JSON.stringify(revision))
    atomicWrite(this.pointer(chatId), revision.id)
    return this.read(chatId)
  }

  reject(input: { chatId: string; expected: string | null; notes: WorkingNotes; proposal: WorkingNotes }): WorkingNotesRead {
    return this.save(input, 'proposal-rejected')
  }

  migrate(chatIdValue: string, values: WorkingNotes[]): WorkingNotesRead {
    const chatId = safeChatId(chatIdValue), existing = this.read(chatId)
    if (existing.current || !values.length) return existing
    let expected: string | null = null, result = existing
    for (const value of values) { result = this.save({ chatId, expected, notes: checkedNotes(value) }, 'legacy-migration'); expected = result.current!.id }
    return result
  }

  /** Copy the visible current notebook state into an isolated chat without claiming hidden model state. */
  fork(input: { sourceChatId: string; targetChatId: string; expectedSource: string | null }): WorkingNotesRead {
    const sourceChatId = safeChatId(input.sourceChatId), targetChatId = safeChatId(input.targetChatId)
    if (sourceChatId === targetChatId) throw Error('A Working Notes branch needs a different conversation.')
    const source = this.read(sourceChatId), target = this.read(targetChatId)
    if ((source.current?.id ?? null) !== input.expectedSource) throw Error('Working Notes changed while the branch was being made. Nothing was copied; try Branch again.')
    if (target.current) throw Error('The branch already has Working Notes. Nothing was overwritten.')
    if (!source.current) return target
    const current = source.current
    const revision: WorkingNotesRevision = { id: randomUUID(), parent: null, chatId: targetChatId, at: new Date().toISOString(), notes: current.notes, source: 'branch-copy', branchedFromRevision: current.id,
      ...(current.proposal ? { proposal: current.proposal } : {}), ...(current.notApproved ? { notApproved: [...current.notApproved] } : {}) }
    writeOnce(this.revisionFile(targetChatId, revision.id), JSON.stringify(revision))
    atomicWrite(this.pointer(targetChatId), revision.id)
    return this.read(targetChatId)
  }

  exportValue(chatId: string): { format: 'oddbrain-working-notes-v1'; chatId: string; revisions: WorkingNotesRevision[] } {
    const read = this.read(chatId)
    return { format: 'oddbrain-working-notes-v1', chatId: safeChatId(chatId), revisions: read.revisions }
  }

  importValue(chatIdValue: string, value: unknown): WorkingNotesRead {
    const chatId = safeChatId(chatIdValue), current = this.read(chatId)
    if (current.current) throw Error('This conversation already has Working Notes. Import into an empty notes history so neither history is overwritten.')
    const document = value as { format?: unknown; chatId?: unknown; revisions?: unknown }
    if (document?.format !== 'oddbrain-working-notes-v1' || document.chatId !== chatId || !Array.isArray(document.revisions) || !document.revisions.length) throw Error('This is not a Working Notes recovery file for this conversation.')
    const rows = document.revisions.map(row => safeRevision(row, chatId))
    const ids = new Set(rows.map(row => row.id)); if (ids.size !== rows.length) throw Error('Recovery revisions contain duplicates.')
    const parents = new Set(rows.map(row => row.parent).filter(Boolean)), tips = rows.filter(row => !parents.has(row.id))
    if (tips.length !== 1 || rows.some(row => row.parent && !ids.has(row.parent))) throw Error('Recovery revisions are incomplete or conflicting. Nothing was imported.')
    // Recovery restores the original revision records exactly; it does not
    // rewrite their authorship/source history merely because they were copied.
    for (const row of rows) writeOnce(this.revisionFile(chatId, row.id), JSON.stringify(row))
    atomicWrite(this.pointer(chatId), tips[0].id)
    return this.read(chatId)
  }
}
