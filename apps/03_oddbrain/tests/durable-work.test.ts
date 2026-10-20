import { afterEach, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkQueue } from '../src/main/engine/workQueue'
import { createAutomationService } from '../src/main/automation/service'
import { createReviewHistory } from '../src/main/automation/history'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'
import type { ReviewRecord, ReviewTask } from '../src/shared/lib/automation'
import { randomUUID } from 'node:crypto'
const dirs: string[] = []
const dir = () => { const value = mkdtempSync(join(tmpdir(), 'oddbrain-durable-')); dirs.push(value); return value }
afterEach(() => dirs.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))

test('queue persists full text/context before it reports success and owner closure holds it', () => {
  const root = dir(), queue = createWorkQueue(root, () => 'route'), prompt = '  ' + 'full text '.repeat(1000) + '\n'
  const [item] = queue.enqueue(10, prompt, { chatId: 'chat-one', history: [{ role: 'user', content: 'Earlier text' }] })
  expect(JSON.parse(readFileSync(join(root, 'pending', item.id + '.json'), 'utf8')).prompt).toBe(prompt)
  expect(queue.view(11)[0].eligible).toBe(false)
  expect(() => queue.start(11, item.id, prompt, item.conversation)).toThrow(/not authorized/)
  queue.ownerClosed(10); expect(queue.view(11)[0].status).toBe('held')
  expect(queue.resume(11, item.id)[0].eligible).toBe(true)
})
test('one durable handoff cannot be consumed twice', () => {
  const queue = createWorkQueue(dir(), () => 'route'), [item] = queue.enqueue(10, 'Task')
  queue.start(10, item.id, item.prompt)
  expect(() => queue.start(10, item.id, item.prompt)).toThrow(/not authorized/)
  queue.finish(item.id, { ok: true, answer: 'Accepted, not completed', transcriptId: 'record-one' })
  expect(queue.view(10)).toHaveLength(0)
  expect(queue.history().items[0]).toMatchObject({ id: item.id, status: 'accepted', transcriptId: 'record-one' })
  expect(queue.history().items[0].events?.map(event => event.status)).toEqual(['queued', 'starting', 'accepted'])
})
test('restart holds queued work and marks possible handoffs uncertain, without dispatching', () => {
  const root = dir(), first = createWorkQueue(root, () => 'route'), [pending] = first.enqueue(1, 'Pending')
  const started = first.enqueue(1, 'Possible execution').find(item => item.id !== pending.id)!
  first.start(1, started.id, started.prompt)
  const reopened = createWorkQueue(root, () => 'route')
  expect(reopened.view(1).find(item => item.id === pending.id)?.status).toBe('held')
  expect(reopened.view(1).find(item => item.id === started.id)?.status).toBe('uncertain')
  expect(reopened.view(1).every(item => !item.eligible)).toBe(true)
  expect(() => reopened.resume(1, started.id)).toThrow(/acknowledge/)
  const retry = reopened.resume(1, started.id, true).find(item => item.retryOf === started.id)!
  expect(retry.id).not.toBe(started.id); expect(retry.prompt).toBe(started.prompt)
  expect(reopened.history().items.find(item => item.id === started.id)?.events?.some(event => event.status === 'uncertain')).toBe(true)
})
test('route, credential/policy authority and queued payload changes refuse before handoff', () => {
  let route = 'original', authority = 'old-key'
  const queue = createWorkQueue(dir(), () => route, () => authority), [item] = queue.enqueue(1, 'Exact task')
  expect(() => queue.start(1, item.id, 'Changed task')).toThrow(/changed/)
  authority = 'new-key'; expect(() => queue.start(1, item.id, item.prompt)).toThrow(/changed/)
  authority = 'old-key'; route = 'other-model'; expect(() => queue.start(1, item.id, item.prompt)).toThrow(/changed/)
  expect(queue.view(1)[0].status).toBe('queued')
})
test('failed handoffs remain available instead of being shifted out of the line', () => {
  const queue = createWorkQueue(dir(), () => 'route'), [item] = queue.enqueue(1, 'Do not lose this')
  queue.start(1, item.id, item.prompt); queue.finish(item.id, { ok: false, answer: 'Provider refused' })
  expect(queue.view(1)[0]).toMatchObject({ status: 'blocked', prompt: item.prompt, notice: 'Provider refused', eligible: false })
})
test('queue corruption cannot turn into an empty editable queue', () => {
  const root = dir(), queue = createWorkQueue(root, () => 'route'), [item] = queue.enqueue(1, 'Original')
  const file = join(root, 'pending', item.id + '.json'); writeFileSync(file, '{broken')
  const reopened = createWorkQueue(root, () => 'route')
  expect(() => reopened.view(1)).toThrow(/recovered safely/)
  expect(() => reopened.enqueue(1, 'Replacement')).toThrow()
  expect(readFileSync(file, 'utf8')).toBe('{broken')
})
test('queue capacity refuses the new task without evicting an older one', () => {
  const queue = createWorkQueue(dir(), () => 'route')
  for (let i = 0; i < 100; i++) queue.enqueue(1, `Task ${i}`)
  expect(() => queue.enqueue(1, 'Would overflow')).toThrow(/Nothing was evicted/)
  expect(queue.view(1)).toHaveLength(100); expect(queue.view(1).some(item => item.prompt === 'Task 0')).toBe(true)
}, 15_000)
test('queue history pages preserve canceled records beyond the visible page', () => {
  const queue = createWorkQueue(dir(), () => 'route')
  for (let i = 0; i < 25; i++) { const [item] = queue.enqueue(1, `Archived ${i}`); queue.cancel(1, item.id) }
  const first = queue.history(), second = queue.history(first.next)
  expect(first.items).toHaveLength(20); expect(second.items).toHaveLength(5)
  expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(25)
})
function service(root: string, runText = vi.fn(async () => ({ text: 'REVIEW: evidence is incomplete', model: 'chosen', clipped: true }))) {
  return createAutomationService({ file: join(root, 'preferences.json'), runText, engine: () => DEFAULT_ENGINE, idleMs: 1, deadlineMs: 1000 })
}
test('more than twenty full review reports survive restart and page through history', async () => {
  const root = dir(), first = service(root), prompt = 'Complete request '.repeat(200), answer = 'Full supplied answer '.repeat(1500)
  for (let i = 0; i < 24; i++) expect((await first.review({ prompt: `${i}\n${prompt}`, answer })).ok).toBe(true)
  await first.dispose()
  const runner = vi.fn(async () => ({ text: 'Must not run', model: '', clipped: false })), reopened = service(root, runner)
  try {
    expect(reopened.view().reports).toHaveLength(20)
    const one = reopened.history(), two = reopened.history(one.next)
    expect([...one.records, ...two.records]).toHaveLength(24)
    const stored = reopened.saved(one.records[0].id)
    expect(stored.task.answer).toBe(answer); expect(stored.record.prompt).toContain(prompt)
    expect(stored.events.map(event => event.state)).toEqual(['queued', 'running', 'done'])
    expect(runner).not.toHaveBeenCalled()
  } finally { await reopened.dispose() }
})
test('incomplete persisted review states are reported as held/interrupted, never restarted', async () => {
  const root = dir(), archive = createReviewHistory(join(root, 'preferences.json.reviews'))
  const make = (state: 'queued' | 'running') => {
    const task: ReviewTask = { id: `${Date.now()}-${randomUUID()}`, prompt: 'Saved input', answer: 'Complete answer', at: new Date().toISOString(), automatic: false, engine: DEFAULT_ENGINE }
    const record: ReviewRecord = { id: task.id, prompt: task.prompt, at: task.at, automatic: false, model: 'chosen', state, text: '', error: '', verdict: null, clipped: false }
    archive.begin(task, record); return task.id
  }
  const queued = make('queued'), running = make('running'), runner = vi.fn(async () => ({ text: 'Unexpected', model: '', clipped: false })), reopened = service(root, runner)
  try {
    expect(reopened.saved(queued).record.state).toBe('held'); expect(reopened.saved(running).record.state).toBe('interrupted')
    expect(runner).not.toHaveBeenCalled()
  } finally { await reopened.dispose() }
})
test('damaged review preferences fail closed and cannot be overwritten by normal toggles', async () => {
  const root = dir(), file = join(root, 'preferences.json'); writeFileSync(file, '{broken')
  const run = vi.fn(async () => ({ text: 'Unexpected', model: '', clipped: false })), review = service(root, run)
  try {
    expect(review.preferences().allowCloudInference).toBe(false)
    expect(review.update({ autoReview: true }).ok).toBe(false)
    expect((await review.review({ prompt: 'Task', answer: 'Answer' })).ok).toBe(false)
    expect(run).not.toHaveBeenCalled(); expect(readFileSync(file, 'utf8')).toBe('{broken')
  } finally { await review.dispose() }
})
test('review refuses oversized input rather than silently shortening it', async () => {
  const root = dir(), run = vi.fn(async () => ({ text: 'Unexpected', model: '', clipped: false })), review = service(root, run)
  try { expect((await review.review({ prompt: 'Task', answer: 'x'.repeat(200_001) })).ok).toBe(false); expect(run).not.toHaveBeenCalled() }
  finally { await review.dispose() }
})
test('review model is never called when the durable record cannot be created', async () => {
  const root = dir(); writeFileSync(join(root, 'preferences.json.reviews'), 'not a directory')
  const run = vi.fn(async () => ({ text: 'Unexpected', model: '', clipped: false })), review = service(root, run)
  try { expect((await review.review({ prompt: 'Task', answer: 'Answer' })).ok).toBe(false); expect(run).not.toHaveBeenCalled() }
  finally { await review.dispose() }
})
test('outside preference edits are not silently replaced by a stale UI update', async () => {
  const root = dir(), review = service(root)
  try {
    const file = join(root, 'preferences.json'); writeFileSync(file, JSON.stringify({ autoReview: false, customOwnerField: 'preserve' }))
    expect(review.update({ autoReview: true }).ok).toBe(false)
    expect(JSON.parse(readFileSync(file, 'utf8')).customOwnerField).toBe('preserve')
  } finally { await review.dispose() }
})
test('one damaged review is reported without hiding the other saved records', async () => {
  const root = dir(), review = service(root)
  try {
    await review.review({ prompt: 'First', answer: 'Answer' }); await review.review({ prompt: 'Second', answer: 'Answer' })
    const folder = join(root, 'preferences.json.reviews'), files = readdirSync(folder).filter(file => file.endsWith('.json'))
    writeFileSync(join(folder, files[0]), '{broken')
    const page = review.history(); expect(page.records).toHaveLength(1); expect(page.notice).toContain('could not be read')
  } finally { await review.dispose() }
})

test('refresh cannot authorize externally changed queued text or conversation scope', () => {
  for (const change of ['prompt', 'conversation'] as const) {
    const root = dir(), queue = createWorkQueue(root, () => 'route')
    const [item] = queue.enqueue(1, 'Original authorized task', { chatId: 'original-chat' })
    const file = join(root, 'pending', item.id + '.json'), value = JSON.parse(readFileSync(file, 'utf8'))
    if (change === 'prompt') value.prompt = 'Unreviewed replacement'
    else value.conversation.chatId = 'different-chat'
    const changed = JSON.stringify(value); writeFileSync(file, changed)
    expect(() => queue.view(1)).toThrow(/changed outside/)
    expect(() => queue.start(1, item.id, value.prompt, value.conversation)).toThrow(/changed outside/)
    expect(() => queue.block(item.id, 'Would otherwise bless the changed record', 1)).toThrow(/changed outside/)
    expect(readFileSync(file, 'utf8')).toBe(changed)
  }
})
test('editing disk state cannot re-arm a consumed handoff in the same process', () => {
  const root = dir(), queue = createWorkQueue(root, () => 'route'), [item] = queue.enqueue(1, 'One authorized attempt')
  queue.start(1, item.id, item.prompt)
  const file = join(root, 'pending', item.id + '.json'), value = JSON.parse(readFileSync(file, 'utf8'))
  value.status = 'queued'; writeFileSync(file, JSON.stringify(value))
  expect(queue.view(1)[0].eligible).toBe(false)
  expect(() => queue.start(1, item.id, item.prompt)).toThrow(/not authorized/)
  value.status = 'held'; writeFileSync(file, JSON.stringify(value))
  expect(() => queue.resume(1, item.id)).toThrow(/already started/)
  expect(() => queue.cancel(1, item.id)).toThrow(/no longer waiting/)
})
test('handoff receipts cannot be attached to an externally rewritten task', () => {
  const root = dir(), queue = createWorkQueue(root, () => 'route'), [item] = queue.enqueue(1, 'Actual task')
  queue.start(1, item.id, item.prompt)
  const file = join(root, 'pending', item.id + '.json'), value = JSON.parse(readFileSync(file, 'utf8'))
  value.prompt = 'Different task'; const changed = JSON.stringify(value); writeFileSync(file, changed)
  expect(() => queue.finish(item.id, { ok: true, answer: 'Accepted', transcriptId: 'actual-record' })).toThrow(/changed outside/)
  expect(readFileSync(file, 'utf8')).toBe(changed)
})
test('restart still requires explicit review instead of trusting a discarded in-memory authorization', () => {
  const root = dir(), first = createWorkQueue(root, () => 'route'), [item] = first.enqueue(1, 'Original')
  const file = join(root, 'pending', item.id + '.json'), value = JSON.parse(readFileSync(file, 'utf8'))
  value.prompt = 'Changed while the app was closed'; writeFileSync(file, JSON.stringify(value))
  const reopened = createWorkQueue(root, () => 'route')
  expect(reopened.view(1)[0]).toMatchObject({ prompt: value.prompt, status: 'held', eligible: false })
  expect(() => reopened.start(1, item.id, value.prompt)).toThrow(/not authorized/)
  reopened.resume(1, item.id)
  expect(() => reopened.start(1, item.id, value.prompt)).not.toThrow()
})
