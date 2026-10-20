import { randomUUID } from 'node:crypto'
import type { EngineEvent, EngineSettings } from '../../shared/lib/engine'
import { DEFAULT_AUTOMATION, normalizeAutomation, type AutomationPreferences, type AutomationView, type ReviewInput, type ReviewRecord, type ReviewTask } from '../../shared/lib/automation'
import { parseVerdict } from '../../shared/lib/review'
import { configBytes, commitConfigs } from '../engine/configTransaction'
import { createReviewHistory } from './history'
type Runner = (task: ReviewTask, preferences: AutomationPreferences, signal: AbortSignal) => Promise<{ text: string; model: string; clipped: boolean }>
type Answer = { ok: boolean; record?: ReviewRecord; error?: string }
type Queued = { task: ReviewTask; preferences: AutomationPreferences; resolve?: (answer: Answer) => void }
const id = () => `${Date.now()}-${randomUUID()}`
const baseRecord = (task: ReviewTask, model: string, state: ReviewRecord['state']): ReviewRecord => ({ id: task.id, prompt: task.prompt, model, automatic: task.automatic, at: task.at, state, text: '', error: '', verdict: null, clipped: false })
export function createAutomationService(options: { file: string; runText: Runner; engine: () => EngineSettings; onChanged?: (view: AutomationView) => void; idleMs?: number; deadlineMs?: number }) {
  let preferenceBytes: Buffer | null = null
  let preferences = { ...DEFAULT_AUTOMATION }, preferenceFault = '', storageNotice = ''
  try {
    const bytes = configBytes(options.file); preferenceBytes = bytes
    if (bytes) { const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); if (!raw || typeof raw !== 'object' || Array.isArray(raw) || ['autoKeep', 'autoReview', 'allowExternalReview', 'allowCloudInference'].some(key => raw[key] !== undefined && typeof raw[key] !== 'boolean') || (raw.reviewModel !== undefined && (typeof raw.reviewModel !== 'string' || !/^[\w.:@/\-]*$/.test(raw.reviewModel) || raw.reviewModel.length > 300))) throw Error(); preferences = normalizeAutomation(raw) }
  } catch { preferences = { ...DEFAULT_AUTOMATION, allowCloudInference: false }; preferenceFault = 'Automation preferences could not be read safely. No reviews will run; the original file is unchanged.' }
  const history = createReviewHistory(options.file + '.reviews')
  let reports: ReviewRecord[] = [], historyNext = ''
  const recover = (record: ReviewRecord): ReviewRecord => record.state === 'queued' ? { ...record, state: 'held', error: 'Saved review was never confirmed started. It was not automatically resumed.' }
    : record.state === 'running' ? { ...record, state: 'interrupted', error: 'No completed report was recorded before restart. Provider activity or cost is uncertain; no automatic retry was made.' } : record
  try { const page = history.list(); reports = page.records.map(recover); historyNext = page.next; storageNotice = page.notice } catch { storageNotice = 'Saved reviews could not be read. Their original files remain unchanged.' }
  let work: { task: ReviewTask; overflow: boolean; lastText: string; lastKind: string } | null = null
  let starting = false, disposed = false, timer: ReturnType<typeof setTimeout> | null = null
  let active: { item: Queued; record: ReviewRecord; controller: AbortController; done: Promise<void> } | null = null
  let queue: Queued[] = []
  const view = (): AutomationView => ({ preferences: { ...preferences }, current: active ? { ...active.record } : null, reports: reports.map(r => ({ ...r })), queued: queue.length, desktop: true, storageNotice: preferenceFault || storageNotice, historyNext })
  const emit = () => { try { options.onChanged?.(view()) } catch { /* closed observers do not affect persistence */ } }
  const recent = (record: ReviewRecord) => { reports = [record, ...reports.filter(r => r.id !== record.id)].slice(0, 20) } // visible cache only; disk is never pruned
  const finish = (item: Queued, record: ReviewRecord) => {
    try { history.append(record) }
    catch (error) { storageNotice = (error as Error).message; record = { ...record, state: 'error', error: 'The review result could not be confirmed saved. Copy the visible result before closing; no retry was made.' } }
    recent(record); item.resolve?.({ ok: record.state === 'done', record: { ...record }, error: record.error || undefined })
  }
  const stopTimer = () => { if (timer) clearTimeout(timer); timer = null }
  const schedule = () => { stopTimer(); if (disposed || work || starting || active || !queue.length) return; timer = setTimeout(() => { timer = null; void pump() }, options.idleMs ?? 750) }
  const cancelItem = (item: Queued, error: string) => finish(item, { ...baseRecord(item.task, '', 'canceled'), error })
  const pump = async () => {
    if (disposed || work || starting || active || !queue.length) return
    const item = queue.shift()!
    if (preferenceFault || (item.task.automatic && !preferences.autoReview) || JSON.stringify(item.preferences) !== JSON.stringify(preferences)) {
      cancelItem(item, preferenceFault || 'Review settings changed before dispatch. No model request was sent; request a new review explicitly.'); emit(); schedule(); return
    }
    const record = baseRecord(item.task, preferences.reviewModel || item.task.engine.model, 'running')
    try { history.append(record) } catch (error) { storageNotice = (error as Error).message; cancelItem(item, 'The review could not be recorded before model access. Nothing was sent.'); emit(); schedule(); return }
    const controller = new AbortController(), signal = AbortSignal.any([controller.signal, AbortSignal.timeout(options.deadlineMs ?? 90000)])
    let release!: () => void; const done = new Promise<void>(resolve => { release = resolve })
    active = { item, record, controller, done }; emit()
    try {
      const aborted = new Promise<never>((_, reject) => { if (signal.aborted) reject(signal.reason); else signal.addEventListener('abort', () => reject(signal.reason), { once: true }) })
      const result = await Promise.race([options.runText(item.task, { ...item.preferences }, signal), aborted])
      if (signal.aborted) throw signal.reason
      record.text = result.text; record.model = result.model; record.clipped = result.clipped; record.verdict = parseVerdict(result.text); record.state = 'done'
    } catch (error) {
      record.state = controller.signal.aborted ? 'canceled' : 'error'
      record.error = controller.signal.aborted ? String(controller.signal.reason || 'Review canceled.') : signal.aborted ? 'Review timed out. Provider activity or cost may have occurred; no app actions were run.' : String((error as Error)?.message || error)
    } finally { finish(item, record); active = null; release(); emit(); schedule() }
  }
  const enqueue = (task: ReviewTask, resolve?: (answer: Answer) => void) => {
    if (preferenceFault || queue.length >= 10) { const error = preferenceFault || 'Review queue is full. Existing work was preserved; no additional model call was made.'; storageNotice = error; resolve?.({ ok: false, error }); emit(); return }
    const item: Queued = { task, preferences: { ...preferences }, resolve }
    try { history.begin(task, baseRecord(task, preferences.reviewModel || task.engine.model, 'queued')) }
    catch (error) { storageNotice = (error as Error).message; resolve?.({ ok: false, error: storageNotice }); emit(); return }
    queue.push(item); emit(); schedule()
  }
  const cancelActive = async (reason: string) => { if (active) { const current = active; current.controller.abort(reason); await current.done } }
  const appendText = (text: string, separate: boolean) => {
    if (!work) return
    const next = (separate && work.task.answer ? '\n\n' : '') + text
    if (!work.overflow && work.task.answer.length + next.length <= 200_000) work.task.answer += next
    else { work.overflow = true; work.task.answer = ''; work.task.sourceComplete = false }
  }
  return {
    view, preferences: () => ({ ...preferences }),
    history(before = '') { const page = history.list(before); return { ...page, records: page.records.map(record => active?.record.id === record.id || queue.some(q => q.task.id === record.id) ? record : recover(record)) } },
    saved(id: string) { const entry = history.read(id); return { ...entry, record: active?.record.id === id || queue.some(q => q.task.id === id) ? entry.record : recover(entry.record) } },
    update(patch: Partial<AutomationPreferences>) {
      if (preferenceFault) return { ok: false, view: view(), error: preferenceFault }
      if (patch.reviewModel !== undefined && (typeof patch.reviewModel !== 'string' || !/^[\w.:@/\-]*$/.test(patch.reviewModel) || patch.reviewModel.length > 300)) return { ok: false, view: view(), error: 'That reviewer model id is invalid. Nothing changed.' }
      const next = normalizeAutomation({ ...preferences, ...patch })
      try { const raw = preferenceBytes ? JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(preferenceBytes)) : {}; const text = JSON.stringify({ ...raw, ...next }); commitConfigs([{ path: options.file, text, expected: preferenceBytes }]); preferenceBytes = Buffer.from(text) }
      catch { return { ok: false, view: view(), error: 'Automation preferences could not be saved. Original unchanged.' } }
      const revoked = (preferences.allowExternalReview && !next.allowExternalReview) || (preferences.allowCloudInference && !next.allowCloudInference)
      preferences = next
      if (!next.autoReview) { const kept: Queued[] = []; for (const item of queue) { if (item.task.automatic) cancelItem(item, 'Automatic review was turned off.'); else kept.push(item) }; queue = kept }
      if (active && ((active.item.task.automatic && !next.autoReview) || revoked)) void cancelActive(revoked ? 'External review permission was revoked.' : 'Automatic review was turned off.')
      emit(); schedule(); return { ok: true, view: view() }
    },
    async beginWork(prompt: string, engine: EngineSettings) {
      starting = true; stopTimer(); await cancelActive('Review canceled because normal work started.')
      work = { task: { id: id(), prompt, answer: '', engine: { ...engine }, automatic: true, at: new Date().toISOString() }, overflow: false, lastText: '', lastKind: '' }; starting = false; emit()
    },
    retargetWork(engine: EngineSettings) { if (work) work.task.engine = { ...engine } },
    rejectWork() { work = null; starting = false; emit(); schedule() },
    ingest(event: EngineEvent) {
      if (!work) return
      if (event.transcriptId) work.task.transcriptId = event.transcriptId
      if (event.kind === 'delta') { appendText(event.text, work.lastKind !== 'text'); work.lastText = work.overflow ? '' : work.lastKind === 'text' ? work.lastText + event.text : event.text; work.lastKind = 'text' }
      else if (event.kind === 'text') { appendText(event.text, true); work.lastText = event.text; work.lastKind = 'text' }
      else if (event.kind === 'done' && event.text && !event.alreadyDisplayed && !(work.lastKind === 'text' && work.lastText === event.text)) appendText(event.text, true)
      else if (!['done', 'error', 'closed'].includes(event.kind)) { work.lastKind = 'other'; work.lastText = '' }
      if (['done', 'error', 'closed'].includes(event.kind)) {
        const item = work; work = null
        if (event.kind === 'done' && preferences.autoReview) {
          if (item.overflow) {
            const record = { ...baseRecord(item.task, '', 'error'), error: 'Automatic review skipped: full text exceeded the 200,000-character input limit. Nothing was shortened for a model call; inspect the original native transcript.', clipped: true }
            try { history.begin(item.task, record); recent(record) } catch (error) { storageNotice = (error as Error).message }
          } else if (item.task.answer.trim()) enqueue(item.task)
        }
        emit(); schedule()
      }
    },
    stopWork() { work = null; starting = false; emit(); schedule() },
    review(input: ReviewInput): Promise<Answer> {
      if (disposed || work || starting || preferenceFault) return Promise.resolve({ ok: false, error: preferenceFault || 'Wait for current work before reviewing it.' })
      if (typeof input?.prompt !== 'string' || typeof input?.answer !== 'string' || !input.answer.trim() || input.prompt.length > 20_000 || input.answer.length > 200_000 || input.sourceComplete === false) return Promise.resolve({ ok: false, error: 'Review needs complete supplied text up to 20,000 request / 200,000 answer characters. Nothing was clipped or sent.' })
      if (active || queue.some(item => !item.task.automatic)) return Promise.resolve({ ok: false, error: 'A review is already running or queued.' })
      return new Promise(resolve => enqueue({ prompt: input.prompt, answer: input.answer, ...(typeof input.transcriptId === 'string' ? { transcriptId: input.transcriptId } : {}), id: id(), engine: { ...options.engine() }, automatic: false, at: new Date().toISOString() }, resolve))
    },
    async cancel() { const removed = queue.splice(0); for (const item of removed) cancelItem(item, 'Review canceled by you.'); stopTimer(); await cancelActive('Review canceled by you.'); emit() },
    async dispose() { disposed = true; const removed = queue.splice(0); for (const item of removed) cancelItem(item, 'App closed. No automatic retry.'); stopTimer(); await cancelActive('App closed. No automatic retry.') },
  }
}
export type AutomationService = ReturnType<typeof createAutomationService>
