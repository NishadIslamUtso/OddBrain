// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createCommandRunner } from '../src/main/commands/runner'

const roots: string[] = []
const dir = () => { const path = mkdtempSync(join(tmpdir(), 'oddbrain-parallel-')); roots.push(path); return path }
afterEach(() => { roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })); vi.restoreAllMocks() })

/**
 * Two isolated checkouts beside the selected folder. `acquire` holds each run
 * at the reservation point so concurrency can be observed without launching
 * any OS process.
 */
function fixture() {
  const base = dir(), selected = join(base, 'selected'), one = join(base, 'checkout-one'), two = join(base, 'checkout-two'), three = join(base, 'checkout-three')
  for (const path of [selected, one, two, three]) mkdirSync(path)
  const checkouts = new Set([one, two, three].map(path => resolve(path)))
  const restarts: Array<() => void> = []
  const runner = createCommandRunner({
    root: join(base, 'records'), deadlineMs: 5000,
    scope: request => ({ cwd: request?.cwd ? resolve(request.cwd) : selected, authority: 'fixed', allowed: true, explanation: 'Fixture access' }),
    isolated: path => checkouts.has(resolve(path)),
    acquire: async (_request, _authority, signal) => {
      await new Promise<void>(start => restarts.push(start))
      if (signal.aborted) throw Error('Stopped before launch')
      return { recheck: () => { if (signal.aborted) throw Error('Revoked before spawn') }, release: () => {} }
    },
  })
  return { selected, one, two, three, runner, restarts }
}

test('two runs proceed at once only in separate isolated checkouts', async () => {
  const f = fixture()
  const first = await f.runner.preview(1, { command: 'one', cwd: f.one })
  const pendingFirst = f.runner.decide(1, first.token, 'allow')
  await vi.waitFor(() => expect(f.restarts).toHaveLength(1))
  expect(f.runner.context()).toMatchObject({ activeCount: 1, allowed: true })

  // A second checkout is allowed while the first runs.
  const second = await f.runner.preview(2, { command: 'two', cwd: f.two })
  const pendingSecond = f.runner.decide(2, second.token, 'allow')
  await vi.waitFor(() => expect(f.restarts).toHaveLength(2))
  expect(f.runner.context()).toMatchObject({ activeCount: 2, allowed: false })

  // The same folder twice, the selected folder, and a third checkout are all refused.
  await expect(f.runner.preview(3, { command: 'again', cwd: f.one })).rejects.toThrow(/Another app command is already running in this folder/)
  await expect(f.runner.preview(3, { command: 'selected', cwd: f.selected })).rejects.toThrow(/selected folder runs one command at a time/)
  await expect(f.runner.preview(3, { command: 'third', cwd: f.three })).rejects.toThrow(/2 are the most this app runs at once/)

  // One stop request covers both runs; each is refused before it launches.
  const stopped = f.runner.cancel()
  expect(stopped.requested).toBe(true)
  expect(stopped.answer).toContain('Stop requested')
  f.restarts.forEach(start => start())
  await expect(pendingFirst).rejects.toThrow(/Stopped before launch/)
  await expect(pendingSecond).rejects.toThrow(/Stopped before launch/)
  await vi.waitFor(() => expect(f.runner.context().activeCount).toBe(0))
  expect(f.runner.running()).toBe(false)
  // Nothing was left reserved: a fresh review in the selected folder works.
  await expect(f.runner.preview(4, { command: 'later', cwd: f.selected })).resolves.toMatchObject({ cwd: f.selected })
})

test('a run in the selected folder keeps that folder closed while a checkout may still run beside it', async () => {
  const f = fixture()
  const first = await f.runner.preview(1, { command: 'selected', cwd: f.selected })
  const pending = f.runner.decide(1, first.token, 'allow')
  await vi.waitFor(() => expect(f.restarts).toHaveLength(1))
  // The selected folder itself stays single-file; a separate checkout is the only way to run beside it.
  await expect(f.runner.preview(2, { command: 'selected again', cwd: f.selected })).rejects.toThrow(/Another app command is already running in this folder/)
  const beside = await f.runner.preview(2, { command: 'checkout', cwd: f.one })
  expect(beside.cwd).toBe(f.one); expect(beside.explanation).toContain('outside the engine')
  f.runner.cancel(); f.restarts.forEach(start => start())
  await expect(pending).rejects.toThrow(/Stopped before launch/)
})

test('stopping one window leaves another window’s run alone, and the count is per run', async () => {
  const f = fixture()
  const first = await f.runner.preview(1, { command: 'one', cwd: f.one })
  const one = f.runner.decide(1, first.token, 'allow')
  await vi.waitFor(() => expect(f.restarts).toHaveLength(1))
  const second = await f.runner.preview(2, { command: 'two', cwd: f.two })
  const two = f.runner.decide(2, second.token, 'allow')
  await vi.waitFor(() => expect(f.restarts).toHaveLength(2))
  expect(f.runner.cancel(1).requested).toBe(true)
  expect(f.runner.cancel(3).requested).toBe(false)
  f.restarts.forEach(start => start())
  await expect(one).rejects.toThrow(/Stopped before launch/)
  await vi.waitFor(() => expect(f.runner.context().activeCount).toBe(1))
  expect(f.runner.running()).toBe(true)
  f.runner.cancel(2)
  // This one had already been handed its reservation, so the stop is recorded on a launched
  // run rather than refusing a launch: an interrupted result, never a silent success.
  const stopped = await two as { interrupted?: boolean; outputComplete?: boolean }
  expect(stopped.interrupted).toBe(true); expect(stopped.outputComplete).toBe(false)
  await vi.waitFor(() => expect(f.runner.running()).toBe(false))
})
