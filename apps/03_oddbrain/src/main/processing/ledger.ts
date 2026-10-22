import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { emptyProcessingLedger, enqueueProcessingJob, processingLedgerProblem, processingSections, recoverProcessingLedger, resumeProcessingJob, claimProcessingSection, finishProcessingSection, type ProcessingJob, type ProcessingLedger, type ProcessingSource, type ProcessingCoverage } from '../../shared/lib/processingLedger'
import { readRecoverableJson, writeRecoverableJson } from '../recoverableJson'

const validate = (value: unknown): ProcessingLedger => {
  const problem = processingLedgerProblem(value)
  if (problem) throw Error(`Processing state needs repair: ${problem}. It was not reset.`)
  return value as ProcessingLedger
}

/** Main-process durable ledger shared by attachment, document and media processors. */
export function createProcessingLedger(root: string, clock: () => string = () => new Date().toISOString(), onChanged?: (ledger: ProcessingLedger) => void) {
  const file = join(root, 'processing', 'ledger.json')
  const load = (): ProcessingLedger => readRecoverableJson(file, validate, emptyProcessingLedger(clock())).value
  const save = (ledger: ProcessingLedger): ProcessingLedger => { writeRecoverableJson(file, ledger); onChanged?.(structuredClone(ledger)); return ledger }
  const mutate = <T>(change: (ledger: ProcessingLedger) => T): T => {
    const ledger = load(), result = change(ledger); save(ledger); return result
  }
  return {
    read(): ProcessingLedger { return load() },
    recover(): number { return mutate(ledger => recoverProcessingLedger(ledger, clock())) },
    enqueue(input: { source: ProcessingSource; processor: string; total: number; sectionSize: number; unit: ProcessingCoverage['unit']; ownerRequested?: boolean; outputRoot: string }): ProcessingJob {
      return mutate(ledger => enqueueProcessingJob(ledger, { id: randomUUID(), source: input.source, processor: input.processor, sections: processingSections(input.total, input.sectionSize, input.unit, clock()), ownerRequested: input.ownerRequested !== false, outputRoot: input.outputRoot }, clock()))
    },
    resume(id: string): ProcessingJob { return mutate(ledger => resumeProcessingJob(ledger, id, clock())) },
    claim(id: string, expected?: { localSeconds?: number; modelTokens?: number; externalCharacters?: number }): ProcessingCoverage { return mutate(ledger => claimProcessingSection(ledger, id, clock(), expected)) },
    finish(id: string, start: number, result: { state: 'done' | 'blocked' | 'skipped'; output?: string; error?: string; usage?: { localSeconds?: number; modelTokens?: number; externalCharacters?: number } }): ProcessingJob {
      return mutate(ledger => finishProcessingSection(ledger, id, start, { ...result, at: clock() }))
    },
    setLimits(limits: ProcessingLedger['budget']['limits']): ProcessingLedger {
      return mutate(ledger => { for (const value of Object.values(limits)) if (!Number.isFinite(value) || value < 0) throw Error('Processing budgets must be zero or greater.'); ledger.budget.limits = { ...limits }; ledger.revision++; return ledger })
    },
  }
}

export type ProcessingLedgerStore = ReturnType<typeof createProcessingLedger>
