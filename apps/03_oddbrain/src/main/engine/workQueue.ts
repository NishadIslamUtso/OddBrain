import { randomUUID, createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { configBytes, commitConfigs, noLinkedPath } from './configTransaction'
import { checkNativeConversation, type NativeConversation } from '../../shared/lib/nativeConversation'
import { engineCommandRefusal } from '../../shared/lib/engineCommandPolicy'
import type { WorkQueueItem } from '../../shared/lib/workQueue'
const ID = /^\d{13}-[a-f0-9-]{36}$/
const newId = () => `${Date.now()}-${randomUUID()}`
const terminal = (row: WorkQueueItem) => row.status === 'accepted' || row.status === 'canceled'
/** Main-process single-writer queue. "starting" is persisted BEFORE any engine
 * handoff; uncertain work is never automatically replayed after a restart. */
export function createWorkQueue(root: string, route: () => string, authority: () => string = route) {
  const owners = new Map<string, { owner: number; seal: string; phase: 'queued' | 'starting' }>(), pending = join(root, 'pending'), archive = join(root, 'archive')
  let problem = ''
  // Authorization stays in the running main process, not in editable queue JSON.
  // JSON framing matches the persisted payload and preserves complete text.
  const seal = (row: WorkQueueItem) => createHash('sha256').update(JSON.stringify({ id: row.id, prompt: row.prompt, conversation: row.conversation, route: row.route, authority: row.authority })).digest('hex')
  const authorize = (row: WorkQueueItem, owner: number) => owners.set(row.id, { owner, seal: seal(row), phase: 'queued' })
  const unchanged = (row: WorkQueueItem) => {
    const lease = owners.get(row.id)
    if (lease && lease.seal !== seal(row)) throw Error('Queued content changed outside the app after authorization. No changed task was dispatched or receipt substituted. Inspect the saved file; append reviewed text to a new draft.')
  }
  const path = (id: string, folder = pending) => { if (!ID.test(id)) throw Error('Invalid queue identifier.'); return join(folder, id + '.json') }
  const rows = (folder = pending): WorkQueueItem[] => {
    noLinkedPath(folder)
    if (!existsSync(folder)) return []
    const files = readdirSync(folder).filter(name => name.endsWith('.json'))
    if (files.length > (folder === pending ? 200 : 20_000)) throw Error('Queue history exceeds the supported file count. No records were deleted.')
    let size = 0
    return files.map(name => {
      const id = name.slice(0, -5), bytes = configBytes(path(id, folder))
      if (!bytes) throw Error('Queue entry disappeared. Reload before continuing.')
      size += bytes.length; if (bytes.length > 200_000 || (folder === pending && size > 2_000_000)) throw Error('Queue storage exceeds its supported budget. Originals are unchanged.')
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as WorkQueueItem
      if (value?.id !== id || typeof value.prompt !== 'string' || typeof value.route !== 'string' || typeof value.at !== 'string' || typeof value.notice !== 'string' || !['queued', 'held', 'starting', 'accepted', 'canceled', 'blocked', 'uncertain'].includes(value.status)) throw Error('Queue entry is damaged. Originals are unchanged.')
      checkNativeConversation(value.conversation)
      return value
    })
  }
  const healthy = () => { if (problem) throw Error(problem) }
  const save = (row: WorkQueueItem, expected: Buffer | null) => {
    const { eligible: _eligible, ...stored } = row
    const text = JSON.stringify({ ...stored, events: [...(row.events || []), { at: new Date().toISOString(), status: row.status, notice: row.notice, ...(row.transcriptId ? { transcriptId: row.transcriptId } : {}) }] })
    if (Buffer.byteLength(text) > 200_000) throw Error('Queued task exceeds its storage budget. Nothing was clipped.')
    commitConfigs([{ path: path(row.id), text, expected }])
  }
  const read = (id: string) => {
    healthy(); const file = path(id), bytes = configBytes(file)
    if (!bytes) throw Error('That pending task is no longer available.')
    const row = rows().find(row => row.id === id)
    if (!row) throw Error('That queued task cannot be read.')
    return { row, bytes }
  }
  const retire = (row: WorkQueueItem) => {
    if (!terminal(row)) return
    const destination = path(row.id, archive); noLinkedPath(destination)
    mkdirSync(archive, { recursive: true, mode: 0o700 })
    if (existsSync(destination)) throw Error('An archived entry already has this ID. Both originals were retained.')
    renameSync(path(row.id), destination); owners.delete(row.id)
  }
  // Recovery is conservative: prepared work stays held, and a possible handoff
  // requires explicit acknowledgement. Recovery does not execute anything.
  try {
    for (const row of rows()) {
      if (terminal(row)) { retire(row); continue }
      if (!['queued', 'starting'].includes(row.status)) continue
      const next = { ...row, status: (row.status === 'starting' || row.status === 'uncertain' ? 'uncertain' : 'held') as WorkQueueItem['status'],
        notice: row.status === 'starting' || row.status === 'uncertain' ? 'A previous handoff may have started. Inspect transcripts and files before retrying; no automatic retry was made.' : 'Recovered after restart. Review the saved task and resume explicitly. ' + row.notice }
      save(next, configBytes(path(row.id)))
    }
  } catch { problem = 'The saved work queue could not be recovered safely. No queued task was started or overwritten; inspect its original files.' }
  const view = (owner: number) => { healthy(); return rows().filter(row => !terminal(row)).sort((a,b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)).map(row => { unchanged(row); return { ...row, eligible: row.status === 'queued' && owners.get(row.id)?.owner === owner && owners.get(row.id)?.phase === 'queued' } }) }
  return {
    view,
    enqueue(owner: number, prompt: string, conversation?: NativeConversation) {
      healthy()
      if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 20_000) throw Error('Queue tasks need text up to 20,000 characters. Nothing was clipped or saved.')
      const refusal = engineCommandRefusal(prompt); if (refusal) throw Error(refusal)
      const context = checkNativeConversation(conversation), currentRoute = route()
      if (context?.expectedRoute && context.expectedRoute !== currentRoute) throw Error('The engine selection changed. Your draft was not queued.')
      const all = rows(), current = all.filter(row => !terminal(row))
      const item: WorkQueueItem = { id: newId(), prompt, ...(context ? { conversation: context } : {}), route: currentRoute, authority: authority(), at: new Date().toISOString(), status: 'queued', notice: '' }
      if (current.length >= 100 || Buffer.byteLength(JSON.stringify([...all, item])) > 2_000_000) throw Error('Saved queue is at its 100-task/2 MB limit. Nothing was evicted; your draft is unchanged.')
      save(item, null); authorize(item, owner); return view(owner)
    },
    start(owner: number, id: string, prompt: string, conversation?: NativeConversation): void {
      const { row, bytes } = read(id)
      if (row.status !== 'queued' || owners.get(id)?.owner !== owner || owners.get(id)?.phase !== 'queued') throw Error('This queued task is not authorized for a new handoff in this window.')
      unchanged(row)
      if (row.prompt !== prompt || !isDeepStrictEqual(row.conversation, conversation) || row.route !== route() || row.authority !== authority()) throw Error('The queued task or engine selection changed. Review it before running; no substitute was sent.')
      save({ ...row, transcriptId: undefined, status: 'starting', notice: 'Handoff started. This is not proof of task completion.' }, bytes)
      owners.get(id)!.phase = 'starting'
    },
    finish(id: string, answer: { ok: boolean; answer: string; transcriptId?: string }): void {
      const { row, bytes } = read(id)
      if (row.status !== 'starting' || owners.get(id)?.phase !== 'starting') throw Error('The queue handoff no longer matches this result.')
      unchanged(row)
      const next: WorkQueueItem = { ...row, status: answer.ok ? 'accepted' : 'blocked', notice: answer.answer, ...(answer.transcriptId ? { transcriptId: answer.transcriptId } : {}) }
      save(next, bytes); retire(next); owners.delete(id)
    },
    block(id: string, notice: string, owner?: number): void {
      const { row, bytes } = read(id)
      if (owner !== undefined && owners.get(id)?.owner !== owner) return
      if (row.status !== 'queued' || owners.get(id)?.phase !== 'queued') return // never relabel an accepted/uncertain handoff as unsent
      unchanged(row)
      save({ ...row, status: 'blocked', notice }, bytes); owners.delete(id)
    },
    resume(owner: number, id: string, acknowledgeUncertain = false) {
      const { row, bytes } = read(id)
      if (owners.get(id)?.phase === 'starting') throw Error('This handoff already started in the current process. Inspect active work; it cannot be reauthorized by editing its saved state.')
      unchanged(row)
      if (!['held', 'blocked', 'uncertain'].includes(row.status)) throw Error('Only held or refused tasks can be resumed. Inspect active work first.')
      if (row.status === 'uncertain' && !acknowledgeUncertain) throw Error('Inspect the previous work and explicitly acknowledge possible duplication before retrying.')
      if (row.route !== route() || row.authority !== authority()) throw Error('The saved task targets a different engine configuration. Append its text to a draft and choose the new route explicitly.')
      if (row.status === 'uncertain') {
        const next = { ...row, id: newId(), events: [], transcriptId: undefined, retryOf: row.id, at: new Date().toISOString(), status: 'queued' as const, notice: 'Explicit retry after uncertainty; may duplicate earlier work.' }
        // Archive the uncertain attempt before authorizing a distinct new one.
        const previous = { ...row, status: 'canceled' as const, notice: 'Owner explicitly chose a new attempt after inspecting uncertainty.' }
        save(previous, bytes); retire(previous); save(next, null); authorize(next, owner)
      } else { save({ ...row, transcriptId: undefined, status: 'queued', notice: '' }, bytes); authorize(row, owner) }
      return view(owner)
    },
    cancel(owner: number, id: string) {
      const { row, bytes } = read(id)
      if (owners.get(id)?.phase === 'starting' || !['queued', 'held', 'blocked', 'uncertain'].includes(row.status)) throw Error('This is no longer waiting work. Inspect the active task or its accepted record instead.')
      const next = { ...row, status: 'canceled' as const, notice: 'Removed from the waiting queue by the owner. This does not stop any possibly running external work.' }
      save(next, bytes); retire(next); return view(owner)
    },
    ownerClosed(owner: number) {
      for (const row of rows()) if (owners.get(row.id)?.owner === owner && owners.get(row.id)?.phase === 'queued' && row.status === 'queued') {
        unchanged(row)
        save({ ...row, status: 'held', notice: 'The originating window closed. Resume explicitly in another window.' }, configBytes(path(row.id))); owners.delete(row.id)
      }
    },
    history(before = ''): { items: WorkQueueItem[]; next: string } {
      healthy(); if (before && !ID.test(before)) throw Error('Invalid queue history cursor.')
      noLinkedPath(archive)
      const archived = existsSync(archive) ? readdirSync(archive).filter(name => name.endsWith('.json')).map(name => name.slice(0, -5)) : []
      const stranded = rows().filter(terminal)
      if (archived.some(id => !ID.test(id))) throw Error('Unrecognized queue history filenames. Originals were retained.')
      const ids = [...new Set([...archived, ...stranded.map(row => row.id)])].sort().reverse().filter(id => !before || id < before)
      const items = ids.slice(0, 20).map(id => {
        const pendingRow = stranded.find(row => row.id === id); if (pendingRow) return pendingRow
        const bytes = configBytes(path(id, archive)); if (!bytes) throw Error('Queue history changed while reading.')
        const row = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as WorkQueueItem
        if (row.id !== id || typeof row.prompt !== 'string' || !terminal(row)) throw Error('Invalid archived queue record. Original unchanged.')
        return row
      })
      return { items, next: ids.length > 20 ? ids[19] : '' }
    },
  }
}
