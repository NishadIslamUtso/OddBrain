import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { claimProcessingSection, emptyProcessingLedger, enqueueProcessingJob, finishProcessingSection, processingSections, recoverProcessingLedger } from '../src/shared/lib/processingLedger'
import { createProcessingLedger } from '../src/main/processing/ledger'

const at = '2026-10-21T10:00:00.000Z'
const source = { id: 'source-1', sha256: 'a'.repeat(64), name: 'long-video.mp4', kind: 'file' as const, bytes: 9_000_000_000, locator: 'owner-selected-file' }

describe('durable processing ledger', () => {
  it('sections a source without imposing a whole-file size cap', () => {
    const ledger = emptyProcessingLedger(at)
    const job = enqueueProcessingJob(ledger, { id: 'job-1', source, processor: 'video-balanced', sections: processingSections(9_000_000_000, 64 * 1024 * 1024, 'bytes', at), ownerRequested: true, outputRoot: 'derived/job-1' }, at)
    expect(job.sections.length).toBeGreaterThan(100)
    expect(job.sections.at(-1)?.end).toBe(source.bytes)
  })

  it('marks in-flight sections uncertain after restart instead of replaying them', () => {
    const ledger = emptyProcessingLedger(at)
    enqueueProcessingJob(ledger, { id: 'job-1', source, processor: 'video-balanced', sections: processingSections(100, 50, 'bytes', at), ownerRequested: true, outputRoot: 'derived/job-1' }, at)
    claimProcessingSection(ledger, 'job-1', at)
    expect(recoverProcessingLedger(ledger, '2026-10-21T10:01:00.000Z')).toBe(1)
    expect(ledger.jobs[0].state).toBe('paused')
    expect(ledger.jobs[0].sections[0].state).toBe('uncertain')
    expect(() => claimProcessingSection(ledger, 'job-1', at)).not.toThrow() // claims the next queued section only
    expect(ledger.jobs[0].sections[0].state).toBe('uncertain')
  })

  it('accounts for real work and pauses cleanly at the owner budget', () => {
    const ledger = emptyProcessingLedger(at, { localSeconds: 10, modelTokens: 20, externalCharacters: 30 })
    enqueueProcessingJob(ledger, { id: 'job-1', source, processor: 'ocr', sections: processingSections(2, 1, 'pages', at), ownerRequested: true, outputRoot: 'derived/job-1' }, at)
    const section = claimProcessingSection(ledger, 'job-1', at, { modelTokens: 10 })
    finishProcessingSection(ledger, 'job-1', section.start, { state: 'done', at, usage: { modelTokens: 18 } })
    expect(() => claimProcessingSection(ledger, 'job-1', at, { modelTokens: 3 })).toThrow(/budget is reached/i)
    expect(ledger.jobs[0].sections[1].state).toBe('queued')
  })

  it('persists and recovers exact coverage with a previous generation', () => {
    const root = mkdtempSync(join(tmpdir(), 'oddbrain-ledger-'))
    const store = createProcessingLedger(root, () => at)
    const job = store.enqueue({ source, processor: 'video-balanced', total: 100, sectionSize: 25, unit: 'milliseconds', outputRoot: 'derived' })
    store.claim(job.id)
    expect(createProcessingLedger(root, () => '2026-10-21T10:02:00.000Z').recover()).toBe(1)
    expect(createProcessingLedger(root).read().jobs[0].sections[0].state).toBe('uncertain')
  })
})
