import { afterEach, expect, test, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createCommandRunner } from '../src/main/commands/runner'
import { createWorkflowService } from '../src/main/workflows/service'
import { createWorkflowScheduler } from '../src/main/workflows/scheduler'
import { createApprovalSigner } from '../src/main/workflows/approvalSigner'
import type { ApprovalSigner } from '../src/main/workflows/approvalSigner'
const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-workflows-')); roots.push(root)
  let locked = false, allowed = true, epoch = 0, busy = false, time = Date.now()
  const commands = createCommandRunner({ root: join(root, 'commands'), deadlineMs: 5000,
    scope: () => ({ cwd: root, authority: `live-${epoch}`, stableAuthority: 'stable', allowed: allowed && !locked && !busy, busy: locked || busy, explanation: 'Unavailable or busy' }),
    acquire: async (_request, authority, signal) => { if (locked || !allowed || authority !== `live-${epoch}`) throw Error('Denied'); locked = true; return { recheck() { if (!allowed || signal.aborted || authority !== `live-${epoch}`) throw Error('Changed') }, release() { locked = false; epoch++ } } },
  })
  const workflows = createWorkflowService(join(root, 'workflows'), commands)
  const sign = (value: string) => createHmac('sha256', 'fixture-key-only').update(value).digest('hex')
  const signer: ApprovalSigner = { available() {}, sign, verify: (value, signature) => sign(value) === signature }
  const scheduleRoot = join(root, 'schedules')
  const makeScheduler = () => createWorkflowScheduler({ root: scheduleRoot, workflows, signer, now: () => time })
  const scheduler = makeScheduler(); scheduler.list()
  return { root, commands, workflows, scheduler, signer, scheduleRoot, makeScheduler, time: () => time, setTime: (value: number) => { time = value }, deny: () => { allowed = false }, setBusy: (value: boolean) => { busy = value }, locked: () => locked }
}
const say = (text: string) => process.platform === 'win32' ? `[Console]::Write('${text}')` : `printf '%s' '${text}'`
const fail = process.platform === 'win32' ? 'exit 7' : 'exit 7'
const slow = process.platform === 'win32' ? 'Start-Sleep -Seconds 30' : 'sleep 30'
const define = (f: ReturnType<typeof fixture>, commands = [say('one'), say('two')]) => f.workflows.save({ name: 'Checked sequence', cwd: f.root, steps: commands.map((command, i) => ({ name: `Step ${i + 1}`, command })) })
function parallelFixture() {
  const base = mkdtempSync(join(tmpdir(), 'oddbrain-parallel-')); roots.push(base)
  const repo = join(base, 'repo'); mkdirSync(repo)
  execFileSync('git', ['init', '-q'], { cwd: repo }); execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repo }); execFileSync('git', ['config', 'user.name', 'OddBrain test'], { cwd: repo })
  writeFileSync(join(repo, 'source.txt'), 'source\n'); execFileSync('git', ['add', 'source.txt'], { cwd: repo }); execFileSync('git', ['commit', '-qm', 'fixture'], { cwd: repo })
  let locked = false, epoch = 0
  // Windows CI can spend tens of seconds in concurrent PowerShell CreateProcess/Defender startup before either script advances.
  // The product budget is five minutes; this fixture keeps a realistic launch allowance while still bounding a genuine hang.
  const commands = createCommandRunner({ root: join(base, 'commands'), isolationRoot: join(base, 'worktrees'), deadlineMs: 120_000,
    scope: () => ({ cwd: repo, authority: `parallel-${epoch}`, stableAuthority: 'parallel', allowed: !locked, busy: locked, explanation: 'Busy' }),
    acquire: async (_request, authority, signal) => { if (locked || authority !== `parallel-${epoch}`) throw Error('Denied'); locked = true; return { recheck() { if (signal.aborted || authority !== `parallel-${epoch}`) throw Error('Changed') }, release() { locked = false; epoch++ } } },
  })
  return { base, repo, commands, workflows: createWorkflowService(join(base, 'workflows'), commands), locked: () => locked }
}
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`
const isolatedWrite = (name: string, value: string) => process.platform === 'win32' ? `[IO.File]::WriteAllText(${literal(name)}, ${literal(value)})` : `printf '%s' ${literal(value)} > ${literal(name)}`
const approveSchedule = (f: ReturnType<typeof fixture>, workflowId: string) => {
  const review = f.scheduler.preview(1, { workflowId, intervalMinutes: 5, firstAt: f.time() + 10000 })
  const saved = f.scheduler.decide(1, review.token, 'allow'); if ('denied' in saved) throw Error('Unexpected denial'); return saved
}
test('workflow save/preview/deny execute nothing and cannot transfer approval to another window', async () => {
  const f = fixture(), definition = define(f), review = f.workflows.preview(1, definition.id)
  expect(f.commands.history().records).toHaveLength(0)
  await expect(f.workflows.decide(2, review.token, 'allow')).rejects.toThrow(/window/)
  expect(await f.workflows.decide(1, review.token, 'deny')).toEqual({ denied: true })
  expect(f.commands.history().records).toHaveLength(0)
})
test('one approval runs exact steps sequentially and retains real command results', async () => {
  const f = fixture(), definition = define(f), review = f.workflows.preview(1, definition.id)
  const run = await f.workflows.decide(1, review.token, 'allow'); if ('denied' in run) throw Error('Unexpected denial')
  expect(run.state).toBe('succeeded'); expect(run.steps.map(step => step.state)).toEqual(['succeeded', 'succeeded'])
  expect(f.commands.read(run.steps[0].runId!).result.stdout).toBe('one')
  expect(f.commands.read(run.steps[1].runId!).result.stdout).toBe('two')
  expect(f.locked()).toBe(false)
  await expect(f.workflows.decide(1, review.token, 'allow')).rejects.toThrow()
}, 20000)
test('parallel workflow commands use separate retained worktrees and actually overlap, never the source checkout', async () => {
  const f = parallelFixture(), marker = join(f.base, 'second-ready')
  const waitForSecond = process.platform === 'win32'
    ? `for($i=0; $i -lt 1000 -and -not (Test-Path -LiteralPath ${literal(marker)}); $i++){ Start-Sleep -Milliseconds 100 }; if(-not (Test-Path -LiteralPath ${literal(marker)})){ exit 8 }; ${isolatedWrite('one.txt', 'one')}`
    : `i=0; while [ ! -f ${literal(marker)} ] && [ "$i" -lt 50 ]; do sleep 0.1; i=$((i+1)); done; test -f ${literal(marker)}; ${isolatedWrite('one.txt', 'one')}`
  const announceSecond = process.platform === 'win32' ? `${isolatedWrite(marker, 'ready')}; ${isolatedWrite('two.txt', 'two')}` : `${isolatedWrite(marker, 'ready')}; ${isolatedWrite('two.txt', 'two')}`
  const definition = f.workflows.save({ name: 'Isolated pair', cwd: f.repo, mode: 'parallel-worktrees', steps: [{ name: 'Waits for sibling', command: waitForSecond }, { name: 'Signals sibling', command: announceSecond }] })
  expect(() => f.workflows.prepare(definition.id, true)).toThrow(/fresh manual review/)
  const review = f.workflows.preview(1, definition.id)
  expect(review.isolation).toMatchObject({ repositoryRoot: f.repo, maxConcurrency: 2 }); expect(review.isolation?.baseRevision).toMatch(/^[a-f0-9]{40}$/)
  const run = await f.workflows.decide(1, review.token, 'allow'); if ('denied' in run) throw Error('Unexpected denial')
  const resultDetails = JSON.stringify(run.steps.map(step => ({ state: step.state, exitCode: step.exitCode, note: step.note })))
  expect(run.state, resultDetails).toBe('succeeded'); expect(run.steps.map(step => step.state), resultDetails).toEqual(['succeeded', 'succeeded'])
  const paths = run.steps.map(step => step.worktree?.path || ''); expect(new Set(paths).size).toBe(2)
  expect(run.steps.every(step => step.worktree?.retained && step.worktree.changed)).toBe(true)
  expect(readFileSync(join(paths[0], 'one.txt'), 'utf8')).toBe('one'); expect(readFileSync(join(paths[1], 'two.txt'), 'utf8')).toBe('two')
  expect(existsSync(join(f.repo, 'one.txt'))).toBe(false); expect(existsSync(join(f.repo, 'two.txt'))).toBe(false)
  expect(f.commands.history().records).toHaveLength(2); expect(f.locked()).toBe(false)
}, 180_000)
test('one stop request reaches both active parallel commands and no third task starts', async () => {
  const f = parallelFixture(), definition = f.workflows.save({ name: 'Stop pair', cwd: f.repo, mode: 'parallel-worktrees', steps: [{ name: 'Slow one', command: slow }, { name: 'Slow two', command: slow }, { name: 'Never starts', command: say('no') }] })
  const review = f.workflows.preview(1, definition.id), pending = f.workflows.decide(1, review.token, 'allow')
  await vi.waitFor(() => expect(f.commands.history().records).toHaveLength(2))
  expect(f.workflows.cancel().requested).toBe(true)
  const run = await pending; if ('denied' in run) throw Error()
  expect(run.steps.map(step => step.state)).toEqual(['interrupted', 'interrupted', 'skipped']); expect(f.commands.history().records).toHaveLength(2); expect(f.locked()).toBe(false)
}, 30000)
test('source-checkout tampering outside the worktree is detected and never reported as isolated success', async () => {
  const f = parallelFixture(), source = join(f.repo, 'source.txt')
  const definition = f.workflows.save({ name: 'Detect escape', cwd: f.repo, mode: 'parallel-worktrees', steps: [{ name: 'Escapes worktree', command: isolatedWrite(source, 'changed') }, { name: 'Clean sibling', command: say('checked') }] })
  const review = f.workflows.preview(1, definition.id), run = await f.workflows.decide(1, review.token, 'allow'); if ('denied' in run) throw Error()
  expect(run.state).toBe('interrupted'); expect(run.note).toMatch(/uncommitted or untracked/)
  expect(readFileSync(source, 'utf8')).toBe('changed')
}, 30000)
test('a failed parallel task prevents a third checkout while an already-running sibling records reality', async () => {
  const f = parallelFixture(), third = join(f.base, 'third-started')
  const slowSuccess = process.platform === 'win32' ? `Start-Sleep -Milliseconds 300; ${isolatedWrite('sibling.txt', 'done')}` : `sleep 0.3; ${isolatedWrite('sibling.txt', 'done')}`
  const definition = f.workflows.save({ name: 'Fail fast pair', cwd: f.repo, mode: 'parallel-worktrees', steps: [{ name: 'Fails', command: fail }, { name: 'Already running', command: slowSuccess }, { name: 'Must not start', command: isolatedWrite(third, 'bad') }] })
  const review = f.workflows.preview(1, definition.id), run = await f.workflows.decide(1, review.token, 'allow'); if ('denied' in run) throw Error()
  const resultDetails = JSON.stringify(run.steps.map(step => ({ state: step.state, exitCode: step.exitCode, note: step.note })))
  expect(run.steps.map(step => step.state), resultDetails).toEqual(['failed', 'succeeded', 'skipped']); expect(existsSync(third)).toBe(false)
  expect(run.steps[2].worktree).toBeUndefined(); expect(f.commands.history().records).toHaveLength(2)
}, 60_000)
test('a nonzero step prevents every later step, without rolling back earlier work', async () => {
  const f = fixture(), definition = define(f, [say('first'), fail, say('must not run')]), review = f.workflows.preview(1, definition.id)
  const run = await f.workflows.decide(1, review.token, 'allow'); if ('denied' in run) throw Error('Unexpected denial')
  expect(run.state).toBe('failed'); expect(run.steps.map(step => step.state)).toEqual(['succeeded', 'failed', 'skipped'])
  expect(f.commands.history().records).toHaveLength(2); expect(run.steps[1].exitCode).toBe(7)
}, 20000)
test('archive or access changes invalidate pending workflow approval', async () => {
  const f = fixture(), definition = define(f), review = f.workflows.preview(1, definition.id)
  f.workflows.archive(definition.id, true)
  await expect(f.workflows.decide(1, review.token, 'allow')).rejects.toThrow(/archived/)
  expect(f.commands.history().records).toHaveLength(0)
})
test('cancellation stops the current step and never starts its successor', async () => {
  const f = fixture(), definition = define(f, [slow, say('not run')]), review = f.workflows.preview(1, definition.id)
  const pending = f.workflows.decide(1, review.token, 'allow')
  await vi.waitFor(() => expect(f.commands.running()).toBe(true))
  f.workflows.cancel()
  const run = await pending; if ('denied' in run) throw Error('Unexpected denial')
  expect(run.state).toBe('interrupted'); expect(run.steps[1].state).toBe('skipped')
  expect(f.locked()).toBe(false)
}, 20000)
test('workflow definitions retain earlier revisions as separate entries', () => {
  const f = fixture(), first = define(f), second = define(f, [say('revised')])
  expect(first.id).not.toBe(second.id); expect(f.workflows.list().items).toHaveLength(2)
  expect(f.workflows.read(first.id).steps).toEqual(first.steps)
})
test('recurring approval is distinct, signed, one-use, and does not run at save time', async () => {
  const f = fixture(), definition = define(f), schedule = approveSchedule(f, definition.id)
  expect(f.commands.history().records).toHaveLength(0)
  f.setTime(schedule.nextAt); await f.scheduler.tick()
  expect(f.commands.history().records).toHaveLength(2)
  const receipt = f.scheduler.inbox().items[0]; expect(receipt.state).toBe('succeeded'); expect(receipt.runId).toBeTruthy()
  await f.scheduler.tick(); expect(f.commands.history().records).toHaveLength(2)
  f.setTime(schedule.nextAt + schedule.intervalMs); await f.scheduler.tick()
  expect(f.commands.history().records).toHaveLength(4)
}, 30000)
test('startup skips missed slots rather than replaying overdue work', async () => {
  const f = fixture(), definition = define(f), schedule = approveSchedule(f, definition.id)
  f.scheduler.dispose(); f.setTime(schedule.nextAt + 900000)
  const restarted = f.makeScheduler(); const result = restarted.list()
  expect(result.items[0].nextAt).toBeGreaterThan(f.time())
  await restarted.tick(); expect(f.commands.history().records).toHaveLength(0)
  expect(restarted.inbox().items[0].state).toBe('missed')
  restarted.dispose()
})
test('busy work defers briefly, then records a missed slot without running catch-up jobs', async () => {
  const f = fixture(), definition = define(f), schedule = approveSchedule(f, definition.id)
  f.setTime(schedule.nextAt); f.setBusy(true); await f.scheduler.tick()
  expect(f.commands.history().records).toHaveLength(0)
  f.setTime(schedule.nextAt + 61000); await f.scheduler.tick(); f.setBusy(false); await f.scheduler.tick()
  expect(f.commands.history().records).toHaveLength(0); expect(f.scheduler.inbox().items[0].state).toBe('missed')
})
test('failed scheduled commands pause future runs and preserve the actual nonzero result', async () => {
  const f = fixture(), definition = define(f, [fail, say('not run')]), schedule = approveSchedule(f, definition.id)
  f.setTime(schedule.nextAt); await f.scheduler.tick()
  expect(f.scheduler.list().items[0].state).toBe('needs-review')
  expect(f.scheduler.inbox().items[0].state).toBe('failed')
  f.setTime(schedule.nextAt + schedule.intervalMs); await f.scheduler.tick()
  expect(f.commands.history().records).toHaveLength(1)
}, 20000)
test('editing a signed schedule cannot grant execution or rewind its due slot', async () => {
  const f = fixture(), definition = define(f), schedule = approveSchedule(f, definition.id)
  const file = join(f.scheduleRoot, 'schedules', schedule.id + '.json'), value = JSON.parse(readFileSync(file, 'utf8'))
  value.value.nextAt = f.time(); writeFileSync(file, JSON.stringify(value))
  f.setTime(schedule.nextAt); await f.scheduler.tick()
  expect(f.commands.history().records).toHaveLength(0)
  expect(f.scheduler.list().notice).toContain('verified')
})
test('a durable claim surviving an incomplete receipt never authorizes a duplicate slot', async () => {
  const f = fixture(), definition = define(f, [say('once')]), schedule = approveSchedule(f, definition.id)
  f.setTime(schedule.nextAt); await f.scheduler.tick()
  const file = join(f.scheduleRoot, 'schedules', schedule.id + '.json'), envelope = JSON.parse(readFileSync(file, 'utf8'))
  envelope.value.nextAt = schedule.nextAt; envelope.value.lastOutcome = 'claimed'; envelope.signature = f.signer.sign(JSON.stringify(envelope.value))
  writeFileSync(file, JSON.stringify(envelope))
  const restarted = f.makeScheduler(); restarted.list(); await restarted.tick()
  expect(restarted.list().items[0].state).toBe('needs-review'); expect(f.commands.history().records).toHaveLength(1)
  restarted.dispose()
}, 20000)
test('permission revocation pauses schedules without dispatching', async () => {
  const f = fixture(), definition = define(f), schedule = approveSchedule(f, definition.id)
  f.deny(); f.setTime(schedule.nextAt); await f.scheduler.tick()
  expect(f.commands.history().records).toHaveLength(0); expect(f.scheduler.list().items[0].state).toBe('needs-review')
})
test('pause and acknowledge preserve scheduled-work history', async () => {
  const f = fixture(), definition = define(f, [say('done')]), schedule = approveSchedule(f, definition.id)
  f.setTime(schedule.nextAt); await f.scheduler.tick(); const event = f.scheduler.inbox().items[0]
  f.scheduler.acknowledge(event.id); f.scheduler.pause(schedule.id)
  expect(f.scheduler.inbox().items[0].acknowledged).toBe(true)
  f.setTime(schedule.nextAt + schedule.intervalMs); await f.scheduler.tick(); expect(f.commands.history().records).toHaveLength(1)
}, 20000)
test('OS-protected approval storage refuses plaintext fallback and retains a corrupt key', () => {
  const f = fixture(), file = join(f.root, 'key.json')
  const unavailable = createApprovalSigner(file, { available: () => false, encrypt: value => Buffer.from(value), decrypt: value => value.toString() })
  expect(() => unavailable.sign('scope')).toThrow(/unavailable/)
  writeFileSync(file, '{broken')
  const signer = createApprovalSigner(file, { available: () => true, encrypt: value => Buffer.from(value), decrypt: value => value.toString() })
  expect(() => signer.sign('scope')).toThrow(); expect(readFileSync(file, 'utf8')).toBe('{broken')
})
test('a newly created protected approval key validates only the exact signed body', () => {
  const f = fixture(), signer = createApprovalSigner(join(f.root, 'key.json'), { available: () => true, encrypt: value => Buffer.from(value.split('').reverse().join('')), decrypt: value => value.toString().split('').reverse().join('') })
  const signature = signer.sign('exact approved scope')
  expect(signer.verify('exact approved scope', signature)).toBe(true)
  expect(signer.verify('changed command', signature)).toBe(false)
  expect(readdirSync(f.root).filter(name => name === 'key.json')).toHaveLength(1)
})

test('renewing a schedule preserves its previous signed approval and does not create a duplicate', () => {
  const f = fixture(), definition = define(f), original = approveSchedule(f, definition.id)
  expect(() => approveSchedule(f, definition.id)).toThrow(/already has an enabled/)
  f.scheduler.pause(original.id)
  const review = f.scheduler.preview(1, { workflowId: definition.id, intervalMinutes: 10, firstAt: f.time() + 20000, replaceId: original.id })
  const renewed = f.scheduler.decide(1, review.token, 'allow'); if ('denied' in renewed) throw Error()
  expect(renewed.id).toBe(original.id); expect(renewed.intervalMs).toBe(600000)
  expect(f.scheduler.list().items).toHaveLength(1)
  expect(readdirSync(join(f.scheduleRoot, 'revisions'))).toHaveLength(1)
  expect(f.commands.history().records).toHaveLength(0)
})
test('two pending recurring reviews cannot create duplicate enabled schedules', () => {
  const f = fixture(), definition = define(f)
  const one = f.scheduler.preview(1, { workflowId: definition.id, intervalMinutes: 5, firstAt: f.time() + 10000 })
  const two = f.scheduler.preview(2, { workflowId: definition.id, intervalMinutes: 5, firstAt: f.time() + 10000 })
  f.scheduler.decide(1, one.token, 'allow')
  expect(() => f.scheduler.decide(2, two.token, 'allow')).toThrow(/duplicate/)
  expect(f.scheduler.list().items).toHaveLength(1)
})
test('late approval cannot overwrite a schedule paused after its review', () => {
  const f = fixture(), definition = define(f), original = approveSchedule(f, definition.id)
  const review = f.scheduler.preview(1, { workflowId: definition.id, intervalMinutes: 10, firstAt: f.time() + 20000, replaceId: original.id })
  f.scheduler.pause(original.id)
  expect(() => f.scheduler.decide(1, review.token, 'allow')).toThrow(/changed during review/)
  expect(f.scheduler.list().items[0].state).toBe('paused')
})
test('an overdue already-claimed slot is paused, not relabelled as a harmless missed slot', async () => {
  const f = fixture(), definition = define(f, [say('once')]), original = approveSchedule(f, definition.id)
  f.setTime(original.nextAt); await f.scheduler.tick()
  const file = join(f.scheduleRoot, 'schedules', original.id + '.json'), envelope = JSON.parse(readFileSync(file, 'utf8'))
  envelope.value.nextAt = original.nextAt; delete envelope.value.lastSlot; delete envelope.value.lastOutcome; envelope.signature = f.signer.sign(JSON.stringify(envelope.value)); writeFileSync(file, JSON.stringify(envelope))
  f.setTime(original.nextAt + 600000)
  const reopened = f.makeScheduler(); reopened.list(); await reopened.tick()
  expect(reopened.list().items[0].state).toBe('needs-review'); expect(f.commands.history().records).toHaveLength(1)
  reopened.dispose()
}, 20000)

test('a scheduled workflow changed after recurring approval pauses instead of running a substitute', async () => {
  const f = fixture(), definition = define(f), schedule = approveSchedule(f, definition.id)
  f.workflows.archive(definition.id, true)
  f.setTime(schedule.nextAt); await f.scheduler.tick()
  expect(f.commands.history().records).toHaveLength(0)
  expect(f.scheduler.list().items[0].state).toBe('needs-review')
})
test('normal work cannot interleave between reviewed workflow steps', async () => {
  const f = fixture(), definition = define(f), plan = f.workflows.prepare(definition.id)
  const blocked: boolean[] = []
  // Use the same internal batch capability to inspect the shared reservation at each step.
  await plan.capability.run(1, new AbortController().signal, {
    starting() { blocked.push(!f.commands.context().allowed) }, recorded() {}, finished() {},
  })
  expect(blocked).toEqual([true, true]); expect(f.locked()).toBe(false)
})

test('acknowledging a claimed inbox item is preserved when its eventual result arrives', async () => {
  const f = fixture(), definition = define(f, [slow]), schedule = approveSchedule(f, definition.id)
  f.setTime(schedule.nextAt); const pending = f.scheduler.tick()
  await vi.waitFor(() => expect(f.scheduler.inbox().items[0]?.runId).toBeTruthy())
  const receipt = f.scheduler.inbox().items[0]; f.scheduler.acknowledge(receipt.id); f.scheduler.pause(schedule.id)
  await pending
  expect(f.scheduler.inbox().items[0].acknowledged).toBe(true)
  expect(f.scheduler.list().items[0].state).toBe('paused')
}, 20000)
