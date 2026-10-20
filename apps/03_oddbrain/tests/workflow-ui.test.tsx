// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import WorkflowPanel from '../src/renderer/src/ui/WorkflowPanel'
const fixture = vi.hoisted(() => ({ workflows: { list: vi.fn(), save: vi.fn(), preview: vi.fn(), decide: vi.fn(), archive: vi.fn(), cancel: vi.fn(), runs: vi.fn(), readRun: vi.fn() }, schedules: { list: vi.fn(), preview: vi.fn(), decide: vi.fn(), pause: vi.fn(), inbox: vi.fn(), acknowledge: vi.fn() }, commands: { context: vi.fn() } }))
vi.mock('../src/renderer/src/platform/bridge', () => ({ bridge: fixture }))
let root: Root, host: HTMLDivElement
const definition = { id: 'workflow', name: 'Build fixture', cwd: '/selected', platform: 'linux', steps: [{ name: 'Check', command: 'echo check' }, { name: 'Build', command: 'echo build' }], at: '2026-10-20T00:00:00Z', archived: false, digest: 'a'.repeat(64) }
const executions = definition.steps.map(step => ({ program: '/fixture/sh', arguments: ['-c', step.command], script: step.command, environmentKeys: [] }))
beforeEach(() => {
  vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fixture.commands.context.mockResolvedValue({ cwd: '/selected', allowed: true })
  fixture.workflows.list.mockResolvedValue({ items: [definition], next: '', notice: '' })
  fixture.workflows.preview.mockResolvedValue({ token: 'once', workflow: definition, executions, expiresAt: Date.now() + 120000, explanation: 'Fixture only, no native execution.' })
  fixture.workflows.runs.mockResolvedValue({ records: [], next: '', notice: '' })
  fixture.workflows.decide.mockResolvedValue({ denied: true })
  fixture.schedules.list.mockResolvedValue({ items: [], notice: '' })
  fixture.schedules.preview.mockResolvedValue({ token: 'recurring', workflow: definition, executions, input: { workflowId: 'workflow', intervalMinutes: 60, firstAt: Date.now() + 300000 }, expiresAt: Date.now() + 120000, explanation: 'Recurring fixture' })
  fixture.schedules.decide.mockResolvedValue({ denied: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(() => root.unmount()); host.remove() })
const button = (name: string) => [...host.querySelectorAll('button')].find(button => button.textContent === name)!
async function mount() { await act(async () => root.render(createElement(WorkflowPanel))) }
async function click(name: string) { await act(async () => button(name).click()) }
test('opening and previewing a whole workflow cannot dispatch it', async () => {
  await mount(); expect(fixture.workflows.decide).not.toHaveBeenCalled()
  await click('Review workflow Build fixture')
  expect(host.textContent).toContain('echo check'); expect(host.textContent).toContain('echo build')
  expect(fixture.workflows.decide).not.toHaveBeenCalled()
  await click('Deny workflow'); expect(fixture.workflows.decide).toHaveBeenCalledExactlyOnceWith('once', 'deny')
})
test('recurring approval is separate and requires its explicit consent control', async () => {
  await mount(); await click('Set up schedule'); await click('Prepare recurring workflow review')
  expect(fixture.schedules.decide).not.toHaveBeenCalled(); expect(button('Allow recurring execution').disabled).toBe(true)
  await act(() => (host.querySelector('input[type=checkbox]') as HTMLInputElement).click())
  expect(button('Allow recurring execution').disabled).toBe(false)
  await click('Allow recurring execution'); expect(fixture.schedules.decide).toHaveBeenCalledExactlyOnceWith('recurring', 'allow')
  expect(fixture.workflows.decide).not.toHaveBeenCalled()
})
test('isolated parallel review shows its immutable base and cannot be scheduled', async () => {
  const parallel = { ...definition, id: 'parallel', mode: 'parallel-worktrees' as const }
  fixture.workflows.list.mockResolvedValue({ items: [parallel], next: '', notice: '' })
  fixture.workflows.preview.mockResolvedValue({ token: 'isolated', workflow: parallel, executions, expiresAt: Date.now() + 120000, explanation: 'Separate detached checkouts. No merge.', isolation: { repositoryRoot: '/selected', baseRevision: 'b'.repeat(40), maxConcurrency: 2 } })
  await mount()
  expect(button('Set up schedule').disabled).toBe(true)
  await click('Review workflow Build fixture')
  expect(host.textContent).toContain('Detached worktree base'); expect(host.textContent).toContain('b'.repeat(40)); expect(host.textContent).toContain('Maximum concurrency: 2')
  expect(fixture.workflows.decide).not.toHaveBeenCalled()
})
test('a double-click during execution cannot launch the plan twice', async () => {
  let finish!: (value: any) => void
  fixture.workflows.decide.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  await mount(); await click('Review workflow Build fixture'); await click('Allow this whole workflow once')
  expect(button('Allow this whole workflow once').disabled).toBe(true)
  await act(async () => finish({ id: 'run', workflow: definition, state: 'failed', steps: [{ name: 'Check', command: 'echo check', state: 'failed', exitCode: 7 }, { name: 'Build', command: 'echo build', state: 'skipped' }], note: 'Later steps did not run.' }))
  expect(fixture.workflows.decide).toHaveBeenCalledTimes(1); expect(host.textContent).toContain('skipped')
})
test('late workflow preview is denied when its view was closed', async () => {
  let finish!: (value: any) => void
  fixture.workflows.preview.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  await mount(); await click('Review workflow Build fixture'); await act(() => root.render(null))
  await act(async () => finish({ token: 'late', workflow: definition, executions, expiresAt: Date.now() + 1000 }))
  expect(fixture.workflows.decide).toHaveBeenCalledExactlyOnceWith('late', 'deny')
})
