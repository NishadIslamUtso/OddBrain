// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { EngineEvent } from '../src/shared/lib/engine'
import { parseVerdict, REVIEW_ORDER, verdictLine } from '../src/shared/lib/review'
import { resetEngineForTests, engineStore } from '../src/renderer/src/state/engine'
import { clearReviewError, reviewState, runReview } from '../src/renderer/src/state/review'

/**
 * The adversary reviewer: the engine checks its own finished work, REPORT
 * ONLY. CLEAN is CLEAN only as its own word; a shrug is a finding; the
 * review is a normal turn through the one send path — visible, stoppable,
 * cards awake. No second brain is faked: the label says whose words these
 * are, and a real second verdict is a Battle away.
 */

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8')

const settleStore = async (): Promise<void> => {
  for (let i = 0; i < 200; i++) {
    const turn = engineStore().turn
    if (turn && turn.state !== 'running') return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

type FakeApi = {
  listener: ((event: EngineEvent) => void) | null
  sent: string[]
  answer: string
}

function withFakeReviewEngine(): FakeApi {
  const fake: FakeApi = { listener: null, sent: [], answer: 'REVIEW: the second step was claimed, not shown.\nREVIEW: nothing verified the file exists.' }
  ;(window as unknown as Record<string, unknown>).api = {}
  ;(window as unknown as Record<string, unknown>).engineApi = {
    read: async () => ({
      engine: { id: 'claude-code', model: 'gemma4:cloud', baseUrl: '', workspace: '', approval: 'ask' },
      running: true,
      history: [],
    }),
    models: async () => ({ ok: true, models: [{ name: 'gemma4:cloud', cloud: true, sizeGB: null }] }),
    setModel: async () => ({ ok: true, answer: 'brain set' }),
    send: async (prompt: string) => {
      fake.sent.push(prompt)
      setTimeout(() => {
        fake.listener?.({ kind: 'text', text: fake.answer } as EngineEvent)
        fake.listener?.({ kind: 'done', text: fake.answer, usage: { inTokens: 30, outTokens: 20, durationMs: 200, costUsd: 0.0001 } } as EngineEvent)
      }, 15)
      return { ok: true, answer: 'started' }
    },
    answer: async () => ({ ok: true }),
    stop: async () => ({ ok: true }),
    onEvent: (listener: (event: EngineEvent) => void) => {
      fake.listener = listener
      return () => undefined
    },
    onPullEvent: () => () => undefined,
  }
  return fake
}

test('the verdict: CLEAN only counts as its own word; a shrug is a finding', () => {
  assert.deepEqual(parseVerdict('CLEAN'), { kind: 'clean' })
  assert.deepEqual(parseVerdict('CLEAN.'), { kind: 'clean' })
  const issues = parseVerdict('REVIEW:\n- the test was never run\n- the path is guessed')
  assert.equal(issues.kind, 'issues')
  if (issues.kind === 'issues') assert.deepEqual(issues.lines, ['the test was never run', 'the path is guessed'])
  const repeated = parseVerdict('REVIEW: one thing\nREVIEW: another thing')
  assert.equal(repeated.kind, 'issues')
  if (repeated.kind === 'issues') assert.deepEqual(repeated.lines, ['one thing', 'another thing'], 'a repeated REVIEW token rides on no line')
  const shrug = parseVerdict('REVIEW:')
  assert.equal(shrug.kind, 'issues', 'an empty REVIEW is not a clean bill')
  if (shrug.kind === 'issues') assert.match(shrug.lines[0] ?? '', /named no findings/)
  const offFormat = parseVerdict('It mostly worked but the summary file is missing.')
  assert.equal(offFormat.kind, 'issues', 'a review that breaks format has still spoken')
  if (offFormat.kind === 'issues') assert.match(offFormat.lines[0] ?? '', /summary file/)
  const cleanOnlyWhole = parseVerdict('CLEAN except one thing')
  assert.equal(cleanOnlyWhole.kind, 'issues')
  const line = verdictLine({ kind: 'clean' })
  assert.match(line, /said CLEAN/)
  const found = verdictLine({ kind: 'issues', lines: ['a', 'b'] })
  assert.match(found, /2 findings/)
  assert.match(found, /report only/)
})

test('the order: report-only in the words, CLEAN contract, nothing auto-fixes', () => {
  assert.match(REVIEW_ORDER, /report only, change nothing/)
  assert.match(REVIEW_ORDER, /claimed but not shown/)
  assert.match(REVIEW_ORDER, /answer exactly CLEAN/)
  const state = read('../src/renderer/src/state/review.ts')
})

test('a review end to end: the order sent, the verdict kept, the line honest about whose words they are', async () => {
  const fake = withFakeReviewEngine()
  resetEngineForTests()
  const store = engineStore()
  await store.send('the work to be judged')
  await settleStore()
  assert.ok(await runReview())
  assert.equal(fake.sent[1], REVIEW_ORDER)
  const state = reviewState()
  // A clean review reads as clean.
  fake.answer = 'CLEAN'
  await store.send('more work')
  await settleStore()
  assert.ok(await runReview())
  assert.equal(reviewState().verdict?.kind, 'clean')
  assert.match(reviewState().line, /said CLEAN/)
})

test('the honest gates: no work, no review; a busy engine waits; the order is word for word', async () => {
  withFakeReviewEngine()
  resetEngineForTests()
  assert.equal(await runReview(), false)
  assert.match(reviewState().error, /no finished work/)
  clearReviewError()
  assert.equal(reviewState().error, '')
})
