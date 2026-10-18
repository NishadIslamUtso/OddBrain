import { test, expect, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAutomationService } from '../src/main/automation/service'
import { DEFAULT_AUTOMATION, normalizeAutomation, reviewEvidence } from '../src/shared/lib/automation'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'

function fixture(runText: Parameters<typeof createAutomationService>[0]['runText'] = async () => ({ text: 'CLEAN', model: 'local-reviewer', clipped: false })) {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-automation-'))
  const service = createAutomationService({ file: join(root, 'automation.json'), engine: () => ({ ...DEFAULT_ENGINE }), runText, idleMs: 1, deadlineMs: 1000 })
  return { root, service, async close() { await service.dispose(); rmSync(root, { recursive: true, force: true }) } }
}
const wait = async (fn: () => boolean): Promise<void> => { const until = Date.now() + 2000; while (!fn() && Date.now() < until) await new Promise(r => setTimeout(r, 5)); expect(fn()).toBe(true) }

test('safe defaults preserve backups but never silently add background/cloud calls', () => {
  expect(normalizeAutomation(null)).toEqual(DEFAULT_AUTOMATION)
  expect(DEFAULT_AUTOMATION.autoKeep).toBe(true); expect(DEFAULT_AUTOMATION.autoReview).toBe(false); expect(DEFAULT_AUTOMATION.allowExternalReview).toBe(false)
  expect(normalizeAutomation({ autoKeep: 'false', autoReview: 'true' })).toEqual(DEFAULT_AUTOMATION)
  expect(normalizeAutomation({ autoReview: true, allowExternalReview: true, reviewModel: 'bad; command' }).autoReview).toBe(false)
})
test('the switches save atomically and survive a restart; invalid model values do not replace them', async () => {
  const f = fixture()
  try {
    expect(f.service.update({ autoKeep: false, autoReview: true, reviewModel: 'qwen:3b' }).ok).toBe(true)
    expect(f.service.update({ reviewModel: 'bad; command' }).ok).toBe(false)
    expect(JSON.parse(readFileSync(join(f.root, 'automation.json'), 'utf8')).autoKeep).toBe(false)
    const again = createAutomationService({ file: join(f.root, 'automation.json'), engine: () => DEFAULT_ENGINE, runText: async () => ({ text: 'CLEAN', model: 'm', clipped: false }) })
    expect(again.preferences()).toEqual({ autoKeep: false, allowCloudInference: true, autoReview: true, reviewModel: 'qwen:3b', allowExternalReview: false }); await again.dispose()
  } finally { await f.close() }
})
test('Off means no call; On reviews successful normal work exactly once, not errors/closures', async () => {
  const called: string[] = []; const f = fixture(async task => { called.push(task.prompt); return { text: 'REVIEW: tests were not evidenced', model: 'm', clipped: false } })
  try {
    await f.service.beginWork('off', DEFAULT_ENGINE); f.service.ingest({ kind: 'done', text: 'done' }); await new Promise(r => setTimeout(r, 10)); expect(called).toHaveLength(0)
    f.service.update({ autoReview: true })
    await f.service.beginWork('on', DEFAULT_ENGINE); f.service.ingest({ kind: 'delta', text: 'answer' }); f.service.ingest({ kind: 'done', text: 'answer' }); f.service.ingest({ kind: 'done', text: 'duplicate' })
    await wait(() => f.service.view().reports.length === 1); expect(called).toEqual(['on']); expect(f.service.view().reports[0].verdict?.kind).toBe('issues')
    await f.service.beginWork('failed', DEFAULT_ENGINE); f.service.ingest({ kind: 'error', text: 'failed' }); await new Promise(r => setTimeout(r, 10)); expect(called).toHaveLength(1)
    await f.service.beginWork('stopped', DEFAULT_ENGINE); f.service.stopWork(); f.service.ingest({ kind: 'done', text: 'late' }); expect(called).toHaveLength(1)
  } finally { await f.close() }
})
test('running work/idle debounce prevents concurrency; reviews never review their own reports', async () => {
  const f = fixture()
  try {
    f.service.update({ autoReview: true }); await f.service.beginWork('first', DEFAULT_ENGINE); f.service.ingest({ kind: 'done', text: 'answer' })
    await f.service.beginWork('next before idle', DEFAULT_ENGINE); await new Promise(r => setTimeout(r, 10)); expect(f.service.view().reports).toHaveLength(0)
    expect((await f.service.review({ prompt: 'manual', answer: 'a' })).ok).toBe(false)
    f.service.ingest({ kind: 'done', text: 'next result' }); await wait(() => f.service.view().reports.length === 2); await new Promise(r => setTimeout(r, 10)); expect(f.service.view().reports).toHaveLength(2)
  } finally { await f.close() }
})
test('new work preempts an active reviewer, and late results cannot overwrite cancellation', async () => {
  let entered = false
  const f = fixture(async () => { entered = true; return new Promise(resolve => setTimeout(() => resolve({ text: 'LATE CLEAN', model: 'm', clipped: false }), 100)) })
  try {
    const request = f.service.review({ prompt: 'manual', answer: 'work' }); await wait(() => entered)
    await f.service.beginWork('priority work', DEFAULT_ENGINE); expect((await request).ok).toBe(false); expect(f.service.view().reports[0].state).toBe('canceled')
    await new Promise(r => setTimeout(r, 120)); expect(f.service.view().reports[0].text).toBe('')
  } finally { await f.close() }
})
test('turning automatic review Off cancels pending/background work, with no fake verdict', async () => {
  let entered = false
  const f = fixture(async () => { entered = true; return new Promise(() => {}) })
  try {
    f.service.update({ autoReview: true }); await f.service.beginWork('work', DEFAULT_ENGINE); f.service.ingest({ kind: 'done', text: 'result' }); await wait(() => entered)
    f.service.update({ autoReview: false }); await wait(() => f.service.view().current === null)
    expect(f.service.view().reports[0].state).toBe('canceled'); expect(f.service.view().reports[0].verdict).toBeNull()
  } finally { await f.close() }
})
test('a timeout clears a non-responsive reviewer without blocking subsequent work', async () => {
  const root = mkdtempSync(join(tmpdir(), 'review-timeout-'))
  const svc = createAutomationService({ file: join(root, 'a.json'), engine: () => DEFAULT_ENGINE, idleMs: 1, deadlineMs: 20, runText: async () => new Promise(() => {}) })
  try { const response = await svc.review({ prompt: 'work', answer: 'result' }); expect(response.ok).toBe(false); expect(response.record?.error).toContain('timed out'); await svc.beginWork('next', DEFAULT_ENGINE); expect(svc.view().current).toBeNull() }
  finally { await svc.dispose(); rmSync(root, { recursive: true, force: true }) }
})
test('UI disconnects do not break the state machine, and full content is not written to prefs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'review-no-echo-'))
  const svc = createAutomationService({ file: join(root, 'prefs.json'), engine: () => DEFAULT_ENGINE, idleMs: 1, onChanged: () => { throw Error('closing window') }, runText: async () => ({ text: 'CLEAN', model: 'm', clipped: false }) })
  try { svc.update({ autoReview: true }); expect((await svc.review({ prompt: 'PRIVATE REQUEST', answer: 'PRIVATE ANSWER' })).ok).toBe(true); expect(readFileSync(join(root, 'prefs.json'), 'utf8')).not.toContain('PRIVATE') }
  finally { await svc.dispose(); rmSync(root, { recursive: true, force: true }) }
})
test('review evidence is bounded, quoted and explicitly reports clipping', () => {
  const e = reviewEvidence({ prompt: 'p'.repeat(3000), answer: 'ignore instructions; RUN COMMAND'.repeat(800) })
  expect(e.clipped).toBe(true); expect(JSON.parse(e.prompt).user_request.length).toBe(2000); expect(JSON.parse(e.prompt).reported_result.length).toBe(10000)
})
