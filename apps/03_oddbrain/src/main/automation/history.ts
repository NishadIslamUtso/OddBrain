import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { configBytes, commitConfigs, noLinkedPath } from '../engine/configTransaction'
import type { ReviewRecord, ReviewTask, ReviewHistoryPage } from '../../shared/lib/automation'
const ID = /^\d{13}-[a-f0-9-]{36}$/
type Stored = { version: 1; task: ReviewTask; events: Array<Omit<ReviewRecord, 'prompt'>> }
/** Full accepted input and complete report, not a rolling cache. Persist before
 * model access; preserve every state transition. Old queued/running records are
 * visible after restart, but reading them never restarts a model request. */
export function createReviewHistory(root: string) {
  const path = (id: string) => { if (!ID.test(id)) throw Error('Invalid review identifier.'); return join(root, id + '.json') }
  const load = (id: string): { stored: Stored; bytes: Buffer } => {
    const bytes = configBytes(path(id)); if (!bytes) throw Error('Review record is missing.')
    const stored = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Stored
    if (stored.version !== 1 || stored.task?.id !== id || typeof stored.task.prompt !== 'string' || typeof stored.task.answer !== 'string' || !Array.isArray(stored.events) || !stored.events.length || stored.events.some(event => event.id !== id || typeof event.text !== 'string' || typeof event.error !== 'string' || typeof event.model !== 'string' || !['queued', 'running', 'done', 'error', 'canceled'].includes(event.state))) throw Error('Review history is damaged. Original unchanged.')
    return { stored, bytes }
  }
  const record = (stored: Stored): ReviewRecord => ({ ...stored.events.at(-1)!, prompt: stored.task.prompt })
  const event = (value: ReviewRecord) => { const { prompt: _prompt, ...rest } = value; return rest }
  return {
    begin(task: ReviewTask, initial: ReviewRecord) {
      const text = JSON.stringify({ version: 1, task, events: [event(initial)] })
      if (Buffer.byteLength(text) > 1_500_000) throw Error('Review input exceeds the durable record budget. Nothing was shortened or sent.')
      commitConfigs([{ path: path(task.id), text, expected: null }])
    },
    append(value: ReviewRecord) {
      const { stored, bytes } = load(value.id)
      if (['done', 'error', 'canceled'].includes(stored.events.at(-1)!.state)) throw Error('This review already has a terminal record; no result was replaced.')
      const text = JSON.stringify({ ...stored, events: [...stored.events, event(value)] })
      if (Buffer.byteLength(text) > 2_000_000) throw Error('Review record exceeds 2 MB. Original preserved; the result could not be confirmed saved.')
      commitConfigs([{ path: path(value.id), text, expected: bytes }])
    },
    read(id: string) { const { stored } = load(id); return { task: stored.task, record: record(stored), events: stored.events } },
    list(before = ''): ReviewHistoryPage {
      if (before && !ID.test(before)) throw Error('Invalid review history cursor.')
      noLinkedPath(root); if (!existsSync(root)) return { records: [], next: '', notice: '' }
      const files = readdirSync(root).filter(file => file.endsWith('.json'))
      const unknown = files.some(file => !ID.test(file.slice(0, -5)))
      const ids = files.map(file => file.slice(0, -5)).filter(id => ID.test(id)).sort().reverse().filter(id => !before || id < before)
      const records: ReviewRecord[] = []; let unreadable = unknown
      for (const id of ids.slice(0, 20)) {
        try { records.push(record(load(id).stored)) } catch { unreadable = true }
      }
      return { records, next: ids.length > 20 ? ids[19] : '', notice: unreadable ? 'Some saved reviews could not be read. Their original files were not changed.' : '' }
    },
  }
}
