// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import ShellReview from '../src/renderer/src/components/ShellReview'
import type { CommandBridge } from '../src/shared/lib/commands'
let root: Root | undefined, host: HTMLDivElement
async function mount(port: CommandBridge) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  if (!root) { host = document.createElement('div'); document.body.append(host); root = createRoot(host) }
  await act(async () => root!.render(<ShellReview port={port} />))
}
afterEach(async () => { if (root) await act(() => root!.unmount()); root = undefined; host?.remove() })
const button = (text: string) => [...host.querySelectorAll('button')].find(button => button.textContent === text)!
const input = async (text: string) => { await act(() => { const area = host.querySelector('textarea')!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, text); area.dispatchEvent(new Event('input', { bubbles: true })) }) }
const click = async (text: string) => { await act(async () => button(text).click()) }
function port(): CommandBridge {
  return { context: vi.fn(async () => ({ cwd: '/selected', allowed: true, explanation: 'Fixture permission granted', activeId: null })),
    preview: vi.fn(async request => ({ ...request, token: 'reviewed', expiresAt: Date.now() + 120000, explanation: 'Outside native engine sandbox' })),
    decide: vi.fn(async () => ({ exitCode: 7, stdout: 'real output', stderr: 'failure', interrupted: false, outputComplete: true, runId: 'run' })),
    cancel: vi.fn(async () => ({ requested: true, answer: 'Stop requested, not proof of termination' })), history: vi.fn(async () => ({ records: [], next: '', notice: '' })), read: vi.fn(), output: vi.fn() }
}
test('typing and preview cannot execute; explicit allow reports the actual exit rather than success', async () => {
  const api = port(); await mount(api); await input('echo exact')
  expect(api.decide).not.toHaveBeenCalled(); await click('Prepare command review')
  expect(api.preview).toHaveBeenCalledWith({ command: 'echo exact', cwd: '/selected' }); expect(api.decide).not.toHaveBeenCalled()
  expect(host.textContent).toContain('Nothing has run yet')
  await click('Allow this command once')
  expect(api.decide).toHaveBeenCalledExactlyOnceWith('reviewed', 'allow')
  expect(host.textContent).toContain('Exit: 7'); expect(host.textContent).toContain('not verify the requested outcome')
})
test('late preview cannot expose an old executable approval after the port changes', async () => {
  const api = port(); let resolve!: (value: any) => void
  api.preview = vi.fn(() => new Promise(done => { resolve = done }))
  await mount(api); await input('old command'); await click('Prepare command review')
  await mount(port())
  await act(async () => resolve({ token: 'old', command: 'old command', cwd: '/selected', expiresAt: Date.now()+1000, explanation: 'old' }))
  expect(host.textContent).not.toContain('Allow this command once'); expect(api.decide).not.toHaveBeenCalled()
})
test('an in-flight allow cannot be clicked twice and exposes a real stop control', async () => {
  const api = port(); let finish!: (value: any) => void
  api.decide = vi.fn(() => new Promise(resolve => { finish = resolve }))
  await mount(api); await input('long command'); await click('Prepare command review'); await click('Allow this command once')
  expect(button('Allow this command once').disabled).toBe(true)
  await click('Stop app command'); expect(api.cancel).toHaveBeenCalledTimes(1)
  await act(async () => finish({ exitCode: null, stdout: 'prefix', stderr: '', interrupted: true, outputComplete: false }))
  expect(api.decide).toHaveBeenCalledTimes(1); expect(host.textContent).toContain('incomplete')
})
test('permission refusal keeps preview unavailable without inventing an execution', async () => {
  const api = port(); api.context = vi.fn(async () => ({ cwd: '/selected', allowed: false, explanation: 'Command access is off', activeId: null }))
  await mount(api); await input('not allowed')
  expect(button('Prepare command review').disabled).toBe(true); expect(host.textContent).toContain('Command access is off')
  expect(api.preview).not.toHaveBeenCalled(); expect(api.decide).not.toHaveBeenCalled()
})
