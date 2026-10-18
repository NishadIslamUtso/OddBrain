import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { EngineEvent, EngineSettings } from '../../shared/lib/engine'
import { DEFAULT_AUTOMATION, normalizeAutomation, type AutomationPreferences, type AutomationView, type ReviewInput, type ReviewRecord, type ReviewTask } from '../../shared/lib/automation'
import { parseVerdict } from '../../shared/lib/review'

type Runner = (task: ReviewTask, preferences: AutomationPreferences, signal: AbortSignal) => Promise<{ text: string; model: string; clipped: boolean }>
type Queued = { task: ReviewTask; resolve?: (answer: { ok: boolean; record?: ReviewRecord; error?: string }) => void }
export function createAutomationService(options: { file: string; runText: Runner; engine: () => EngineSettings; onChanged?: (view: AutomationView) => void; idleMs?: number; deadlineMs?: number }) {
  let preferences = { ...DEFAULT_AUTOMATION }
  try { if (existsSync(options.file)) preferences = normalizeAutomation(JSON.parse(readFileSync(options.file, 'utf8'))) } catch { /* Old/corrupt preferences never enable new background calls. */ }
  let work: { task: ReviewTask; finished: boolean } | null = null
  let starting = false, disposed = false, timer: ReturnType<typeof setTimeout> | null = null
  let active: { item: Queued; record: ReviewRecord; controller: AbortController; done: Promise<void> } | null = null
  let queue: Queued[] = [], reports: ReviewRecord[] = []
  const view = (): AutomationView => ({ preferences: { ...preferences }, current: active ? { ...active.record } : null, reports: reports.map(r => ({ ...r })), queued: queue.length, desktop: true })
  const emit = (): void => { try { options.onChanged?.(view()) } catch { /* A closing window never breaks the worker/reviewer state machine. */ } }
  const finishQueued = (item: Queued, record: ReviewRecord): void => { reports = [record, ...reports.filter(r => r.id !== record.id)].slice(0, 20); item.resolve?.({ ok: record.state === 'done', record: { ...record }, error: record.error || undefined }) }
  const stopTimer = (): void => { if (timer) clearTimeout(timer); timer = null }
  const schedule = (): void => {
    stopTimer(); if (disposed || work || starting || active || !queue.length) return
    timer = setTimeout(() => { timer = null; void pump() }, options.idleMs ?? 750)
  }
  const pump = async (): Promise<void> => {
    if (disposed || work || starting || active || !queue.length) return
    const item = queue.shift()!
    if (item.task.automatic && !preferences.autoReview) { item.resolve?.({ ok: false, error: 'Automatic review is off.' }); schedule(); return }
    const record: ReviewRecord = { id: item.task.id, prompt: item.task.prompt.slice(0, 200), model: preferences.reviewModel || item.task.engine.model, automatic: item.task.automatic, at: item.task.at, state: 'running', text: '', error: '', verdict: null, clipped: false }
    const controller = new AbortController(), signal = AbortSignal.any([controller.signal, AbortSignal.timeout(options.deadlineMs ?? 90000)])
    let release!: () => void
    const done = new Promise<void>(resolve => { release = resolve })
    active = { item, record, controller, done }; emit()
    try {
      const aborted = new Promise<never>((_, reject) => {
        if (signal.aborted) reject(signal.reason)
        else signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
      const result = await Promise.race([options.runText(item.task, { ...preferences }, signal), aborted])
      if (signal.aborted) throw signal.reason
      record.text = result.text; record.model = result.model; record.clipped = result.clipped
      record.verdict = parseVerdict(result.text); record.state = 'done'
    } catch (error) {
      record.state = controller.signal.aborted ? 'canceled' : 'error'
      record.error = controller.signal.aborted ? String(controller.signal.reason || 'Review canceled.') : signal.aborted ? 'Review timed out. No actions were run.' : String((error as Error)?.message || error)
    } finally {
      finishQueued(item, record); active = null; release(); emit(); schedule()
    }
  }
  const enqueue = (item: Queued): void => {
    if (queue.length >= 10) {
      const dropped = queue.shift()!
      const record: ReviewRecord = { id: dropped.task.id, prompt: dropped.task.prompt.slice(0, 200), model: '', automatic: true, at: dropped.task.at, state: 'canceled', text: '', error: 'Review queue limit reached; no extra model call was made.', verdict: null, clipped: false }
      finishQueued(dropped, record)
    }
    queue.push(item); emit(); schedule()
  }
  const cancelActive = async (reason: string): Promise<void> => {
    if (!active) return
    const current = active; current.controller.abort(reason); await current.done
  }
  return {
    view,
    preferences: (): AutomationPreferences => ({ ...preferences }),
    update(patch: Partial<AutomationPreferences>): { ok: boolean; view: AutomationView; error?: string } {
      if (patch.reviewModel !== undefined && (typeof patch.reviewModel !== 'string' || !/^[\w.:@/\-]*$/.test(patch.reviewModel) || patch.reviewModel.length > 300)) return { ok: false, view: view(), error: 'That reviewer model id is not valid. Nothing changed.' }
      const next = normalizeAutomation({ ...preferences, ...patch })
      try { mkdirSync(dirname(options.file), { recursive: true }); const temporary = options.file + '.tmp'; writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n', 'utf8'); renameSync(temporary, options.file) }
      catch { return { ok: false, view: view(), error: 'Automation preferences could not be saved. Nothing changed.' } }
      const externalRevoked = (preferences.allowExternalReview && !next.allowExternalReview) || (preferences.allowCloudInference && !next.allowCloudInference)
      preferences = next
      if (!next.autoReview) queue = queue.filter(item => { if (!item.task.automatic) return true; item.resolve?.({ ok: false, error: 'Automatic review is off.' }); return false })
      if (active && ((active.item.task.automatic && !next.autoReview) || externalRevoked)) void cancelActive(externalRevoked ? 'External review permission was revoked.' : 'Automatic review was turned off.')
      emit(); schedule(); return { ok: true, view: view() }
    },
    async beginWork(prompt: string, engine: EngineSettings): Promise<void> {
      starting = true; stopTimer()
      // Normal work has priority. There is never a concurrent reviewer/worker
      // inference deliberately launched by this service.
      await cancelActive('Review canceled because normal work started.')
      work = { task: { id: randomUUID(), prompt: prompt.slice(0, 20000), answer: '', engine: { ...engine }, automatic: true, at: new Date().toISOString() }, finished: false }
      starting = false; emit()
    },
    retargetWork(engine: EngineSettings): void { if (work) work.task.engine = { ...engine } },
    rejectWork(): void { work = null; starting = false; emit(); schedule() },
    ingest(event: EngineEvent): void {
      if (!work || work.finished) return
      if (event.kind === 'delta') work.task.answer = (work.task.answer + event.text).slice(0, 20000)
      if (event.kind === 'text') { const text = event.text || ''; if (!work.task.answer.endsWith(text)) work.task.answer = (work.task.answer + '\n' + text).slice(0, 20000) }
      if (event.kind === 'done' || event.kind === 'error' || event.kind === 'closed') {
        const item = work; item.finished = true; work = null
        if (event.kind === 'done' && preferences.autoReview) {
          if (event.text) item.task.answer = event.text.slice(0, 20000)
          if (item.task.answer.trim()) enqueue({ task: item.task })
        }
        emit(); schedule()
      }
    },
    stopWork(): void { work = null; starting = false; emit(); schedule() },
    review(input: ReviewInput): Promise<{ ok: boolean; record?: ReviewRecord; error?: string }> {
      if (disposed || work || starting) return Promise.resolve({ ok: false, error: 'Wait for the current work to finish before reviewing it.' })
      const prompt = typeof input?.prompt === 'string' ? input.prompt.slice(0, 20000) : '', answer = typeof input?.answer === 'string' ? input.answer.slice(0, 20000) : ''
      if (!answer.trim()) return Promise.resolve({ ok: false, error: 'There is no completed answer to review.' })
      if (active || queue.some(item => !item.task.automatic)) return Promise.resolve({ ok: false, error: 'A review is already running or queued.' })
      return new Promise(resolve => enqueue({ task: { id: randomUUID(), prompt, answer, engine: { ...options.engine() }, automatic: false, at: new Date().toISOString() }, resolve }))
    },
    async cancel(): Promise<void> { queue.splice(0).forEach(item => item.resolve?.({ ok: false, error: 'Review canceled.' })); stopTimer(); await cancelActive('Review canceled by you.'); emit() },
    async dispose(): Promise<void> { disposed = true; queue.splice(0).forEach(item => item.resolve?.({ ok: false, error: 'App closed.' })); stopTimer(); await cancelActive('App closed.') },
  }
}
export type AutomationService = ReturnType<typeof createAutomationService>
