export type ProcessingSource = {
  /** Stable identity for the exact bytes or immutable record revision. */
  id: string
  sha256: string
  name: string
  kind: 'file' | 'conversation' | 'vault-record' | 'folder-file'
  bytes: number
  modifiedAt?: string
  locator: string
}

export type ProcessingCoverage = {
  unit: 'bytes' | 'pages' | 'milliseconds' | 'records'
  start: number
  end: number
  state: 'queued' | 'running' | 'done' | 'blocked' | 'uncertain' | 'skipped'
  attempts: number
  updatedAt: string
  error?: string
  output?: string
}

export type ProcessingJob = {
  id: string
  source: ProcessingSource
  processor: string
  createdAt: string
  updatedAt: string
  state: 'queued' | 'running' | 'paused' | 'done' | 'blocked'
  sections: ProcessingCoverage[]
  ownerRequested: boolean
  outputRoot: string
}

export type ProcessingBudget = {
  date: string
  localSeconds: number
  modelTokens: number
  externalCharacters: number
  limits: { localSeconds: number; modelTokens: number; externalCharacters: number }
}

export type ProcessingLedger = {
  version: 1
  revision: number
  jobs: ProcessingJob[]
  budget: ProcessingBudget
  recoveredAt?: string
}

export type ProcessingLedgerBridge = {
  read(): Promise<{ ok: boolean; ledger?: ProcessingLedger; error?: string }>
  resume(id: string): Promise<{ ok: boolean; ledger?: ProcessingLedger; error?: string }>
  setLimits(limits: ProcessingLedger['budget']['limits']): Promise<{ ok: boolean; ledger?: ProcessingLedger; error?: string }>
}

export const DEFAULT_PROCESSING_LIMITS = {
  // These are owner-editable work budgets, not file-size limits.
  localSeconds: 60 * 60,
  modelTokens: 120_000,
  externalCharacters: 120_000,
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const isoDate = (at: string): string => at.slice(0, 10)

export function emptyProcessingLedger(at: string, limits = DEFAULT_PROCESSING_LIMITS): ProcessingLedger {
  return { version: 1, revision: 0, jobs: [], budget: { date: isoDate(at), localSeconds: 0, modelTokens: 0, externalCharacters: 0, limits: { ...limits } } }
}

export function processingLedgerProblem(value: unknown): string {
  const ledger = value as ProcessingLedger
  if (!ledger || ledger.version !== 1 || !Number.isInteger(ledger.revision) || ledger.revision < 0) return 'the processing ledger header is unreadable'
  if (!Array.isArray(ledger.jobs)) return 'the processing jobs are not a list'
  const budget = ledger.budget
  if (!budget || typeof budget.date !== 'string' || !finite(budget.localSeconds) || !finite(budget.modelTokens) || !finite(budget.externalCharacters)) return 'the daily processing budget is unreadable'
  if (!budget.limits || !finite(budget.limits.localSeconds) || !finite(budget.limits.modelTokens) || !finite(budget.limits.externalCharacters)) return 'the processing budget limits are unreadable'
  for (const job of ledger.jobs) {
    if (!job || typeof job.id !== 'string' || typeof job.processor !== 'string' || typeof job.createdAt !== 'string' || typeof job.updatedAt !== 'string') return 'a processing job is unreadable'
    if (!['queued', 'running', 'paused', 'done', 'blocked'].includes(job.state) || !Array.isArray(job.sections)) return `processing job ${job.id || '(unknown)'} has an invalid state`
    const source = job.source
    if (!source || typeof source.id !== 'string' || !/^[a-f0-9]{64}$/.test(source.sha256) || typeof source.name !== 'string' || typeof source.locator !== 'string' || !finite(source.bytes)) return `processing job ${job.id} has an unreadable source identity`
    for (const section of job.sections) if (!section || !finite(section.start) || !finite(section.end) || section.end <= section.start || !Number.isInteger(section.attempts) || section.attempts < 0 || !['queued', 'running', 'done', 'blocked', 'uncertain', 'skipped'].includes(section.state)) return `processing job ${job.id} has unreadable coverage`
  }
  return ''
}

function refreshBudget(ledger: ProcessingLedger, at: string): void {
  const today = isoDate(at)
  if (ledger.budget.date === today) return
  ledger.budget = { date: today, localSeconds: 0, modelTokens: 0, externalCharacters: 0, limits: { ...ledger.budget.limits } }
}

/** Divide work into resumable units. It is deliberately independent of whole-file size. */
export function processingSections(total: number, sectionSize: number, unit: ProcessingCoverage['unit'], at: string): ProcessingCoverage[] {
  if (!Number.isSafeInteger(total) || total < 1 || !Number.isSafeInteger(sectionSize) || sectionSize < 1) throw Error('Processing coverage needs positive safe integer bounds.')
  const sections: ProcessingCoverage[] = []
  for (let start = 0; start < total; start += sectionSize) sections.push({ unit, start, end: Math.min(total, start + sectionSize), state: 'queued', attempts: 0, updatedAt: at })
  return sections
}

export function enqueueProcessingJob(
  ledger: ProcessingLedger,
  input: Omit<ProcessingJob, 'createdAt' | 'updatedAt' | 'state'>,
  at: string,
): ProcessingJob {
  const problem = processingLedgerProblem(ledger)
  if (problem) throw Error(problem)
  const duplicate = ledger.jobs.find(job => job.source.sha256 === input.source.sha256 && job.processor === input.processor && job.sections.length === input.sections.length && job.sections.every((section, i) => section.start === input.sections[i].start && section.end === input.sections[i].end && section.unit === input.sections[i].unit))
  if (duplicate) return duplicate
  if (!input.id || ledger.jobs.some(job => job.id === input.id) || !input.sections.length) throw Error('The processing job identity or coverage is invalid.')
  const job: ProcessingJob = { ...input, createdAt: at, updatedAt: at, state: 'queued' }
  ledger.jobs.push(job); ledger.revision++
  return job
}

/** A process crash never replays in-flight work. The owner can resume those exact sections. */
export function recoverProcessingLedger(ledger: ProcessingLedger, at: string): number {
  let recovered = 0
  for (const job of ledger.jobs) {
    for (const section of job.sections) if (section.state === 'running') {
      section.state = 'uncertain'; section.error = 'OddBrain closed before this section recorded a complete outcome. Review or resume it; it was not replayed automatically.'; section.updatedAt = at; recovered++
    }
    if (job.state === 'running') { job.state = 'paused'; job.updatedAt = at }
  }
  if (recovered) { ledger.revision++; ledger.recoveredAt = at }
  return recovered
}

export function resumeProcessingJob(ledger: ProcessingLedger, id: string, at: string): ProcessingJob {
  const job = ledger.jobs.find(value => value.id === id)
  if (!job) throw Error('Processing job not found.')
  for (const section of job.sections) if (section.state === 'uncertain' || section.state === 'blocked') { section.state = 'queued'; section.error = undefined; section.updatedAt = at }
  job.state = job.sections.every(section => section.state === 'done' || section.state === 'skipped') ? 'done' : 'queued'
  job.updatedAt = at; ledger.revision++
  return job
}

export function claimProcessingSection(ledger: ProcessingLedger, id: string, at: string, expected: { localSeconds?: number; modelTokens?: number; externalCharacters?: number } = {}): ProcessingCoverage {
  refreshBudget(ledger, at)
  const job = ledger.jobs.find(value => value.id === id)
  if (!job) throw Error('Processing job not found.')
  const limit = ledger.budget.limits
  for (const key of ['localSeconds', 'modelTokens', 'externalCharacters'] as const) if ((ledger.budget[key] + (expected[key] || 0)) > limit[key]) throw Error(`Today’s ${key === 'localSeconds' ? 'local processing time' : key === 'modelTokens' ? 'model-token' : 'external handoff'} budget is reached. The queued section remains resumable.`)
  const section = job.sections.find(value => value.state === 'queued')
  if (!section) throw Error('This job has no queued section. Uncertain or blocked work must be resumed explicitly.')
  section.state = 'running'; section.attempts++; section.updatedAt = at
  job.state = 'running'; job.updatedAt = at; ledger.revision++
  return section
}

export function finishProcessingSection(ledger: ProcessingLedger, id: string, start: number, result: { state: 'done' | 'blocked' | 'skipped'; at: string; output?: string; error?: string; usage?: { localSeconds?: number; modelTokens?: number; externalCharacters?: number } }): ProcessingJob {
  refreshBudget(ledger, result.at)
  const job = ledger.jobs.find(value => value.id === id), section = job?.sections.find(value => value.start === start)
  if (!job || !section || section.state !== 'running') throw Error('The claimed processing section is no longer current.')
  section.state = result.state; section.updatedAt = result.at; section.output = result.output; section.error = result.error?.slice(0, 2000)
  for (const key of ['localSeconds', 'modelTokens', 'externalCharacters'] as const) ledger.budget[key] += Math.max(0, result.usage?.[key] || 0)
  const active = job.sections.some(value => value.state === 'running')
  const queued = job.sections.some(value => value.state === 'queued')
  const incomplete = job.sections.some(value => value.state === 'blocked' || value.state === 'uncertain')
  job.state = active ? 'running' : incomplete ? 'blocked' : queued ? 'queued' : 'done'
  job.updatedAt = result.at; ledger.revision++
  return job
}
