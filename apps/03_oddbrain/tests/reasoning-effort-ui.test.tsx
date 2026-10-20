// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'
import { effortTarget, type EngineCapabilityReport } from '../src/shared/lib/engineCapabilities'
import ReasoningEffort from '../src/renderer/src/components/ReasoningEffort'
import Composer from '../src/renderer/src/components/Composer'
import { LookActions, LookContext } from '../src/renderer/src/ui/LookContext'
import { DEFAULT_LOOK } from '../src/renderer/src/state/look'
const fixture = vi.hoisted(() => ({ engine: { settings: {} as typeof DEFAULT_ENGINE, models: { entries: [], loading: false }, detection: { engines: [] }, setThinking: vi.fn() }, capabilities: vi.fn(), send: vi.fn(), pickFiles: vi.fn() }))
vi.mock('../src/renderer/src/state/engine', async importOriginal => ({ ...await importOriginal<object>(), useEngine: () => fixture.engine }))
vi.mock('../src/renderer/src/platform/bridge', async importOriginal => { const actual = await importOriginal<any>(); return { ...actual, isDemo: false, bridge: { ...actual.bridge, engine: { ...actual.bridge.engine, pickFiles: fixture.pickFiles } }, getEngineApi: () => ({ capabilities: fixture.capabilities, setThinking: fixture.engine.setThinking, send: fixture.send }) } })
vi.mock('../src/renderer/src/hooks/useDictation', () => ({ default: () => ({ active: false, toggle: vi.fn(), cancel: vi.fn() }) }))
let host: HTMLDivElement, root: Root
const report = (status: 'reported' | 'unverified' = 'reported'): EngineCapabilityReport => ({ ok: status === 'reported', models: [], effort: { target: effortTarget(fixture.engine.settings), status, levels: status === 'reported' ? ['low', 'high'] : [], note: status === 'reported' ? 'Applies to your next message.' : 'Not verified for this provider.' } })
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fixture.engine.settings = { ...DEFAULT_ENGINE, cloudProvider: 'native', model: 'fixture' }
  fixture.capabilities.mockReset().mockImplementation(async () => report())
  fixture.engine.setThinking.mockReset().mockResolvedValue({ ok: true, answer: 'Requested for your next message.' })
  fixture.send.mockReset(); host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(() => root.unmount()); host.remove() })
const render = () => act(async () => root.render(<ReasoningEffort />))
test('offers only reported levels plus engine default, and passes the current target when saving', async () => {
  await render()
  expect([...host.querySelectorAll('option')].map(x => x.value)).toEqual(['default', 'low', 'high'])
  await act(async () => { const select = host.querySelector('select')!; select.value = 'high'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(fixture.engine.setThinking).toHaveBeenCalledWith('high', effortTarget(fixture.engine.settings))
  expect(host.textContent).toContain('Requested for your next message')
  expect(fixture.send).not.toHaveBeenCalled()
})
test('unknown provider offers default only and explains why without a fake effort slider', async () => {
  fixture.capabilities.mockResolvedValue(report('unverified')); await render()
  expect([...host.querySelectorAll('option')].map(x => x.value)).toEqual(['default'])
  expect(host.textContent).toContain('Not verified for this provider')
})
test('a late model response cannot populate another model’s effort options', async () => {
  let finish!: (value: EngineCapabilityReport) => void
  const old = report()
  fixture.capabilities.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await render()
  fixture.engine.settings = { ...fixture.engine.settings, model: 'different' }
  fixture.capabilities.mockResolvedValue(report('unverified'))
  await render()
  await act(async () => finish(old))
  expect([...host.querySelectorAll('option')].map(x => x.value)).toEqual(['default'])
  expect(host.textContent).toContain('Not verified')
})
test('failed saves explain the refusal; they do not alter the model or request an answer', async () => {
  fixture.engine.setThinking.mockResolvedValue({ ok: false, answer: 'This model no longer reports high effort.' }); await render()
  await act(async () => { const select = host.querySelector('select')!; select.value = 'high'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(host.textContent).toContain('no longer reports high')
  expect(fixture.engine.settings.thinking).toBe('default'); expect(fixture.send).not.toHaveBeenCalled()
})
test('Show thinking changes only display preferences, never effort, inference, or metadata requests', async () => {
  const change = vi.fn()
  await act(async () => root.render(<LookContext.Provider value={{ ...DEFAULT_LOOK, showThinking: false }}><LookActions.Provider value={change}>
    <Composer value="" onChange={() => {}} onSend={() => {}} onStop={() => {}} busy={false} notice="" />
  </LookActions.Provider></LookContext.Provider>))
  await act(async () => (host.querySelector('[aria-label="More chat tools"]') as HTMLButtonElement).click())
  const toggle = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Show thinking'))!
  expect(toggle.title).toContain('does not change reasoning effort')
  await act(async () => toggle.click())
  expect(change).toHaveBeenCalledWith({ showThinking: true })
  expect(fixture.engine.setThinking).not.toHaveBeenCalled(); expect(fixture.send).not.toHaveBeenCalled(); expect(fixture.capabilities).not.toHaveBeenCalled()
})

test('file picker inserts into the latest draft rather than replacing text typed while it was open', async () => {
  let finish!: (paths: string[]) => void
  fixture.pickFiles.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const change = vi.fn(), send = vi.fn()
  const renderComposer = (value: string) => act(async () => root.render(<Composer value={value} onChange={change} onSend={send} onStop={() => {}} busy={false} notice="" />))
  await renderComposer('Original @')
  await act(() => [...host.querySelectorAll('button')].find(b => b.textContent === 'Choose files to mention')!.click())
  await renderComposer('My newer draft')
  await act(async () => finish(['/work/file.txt']))
  expect(change).toHaveBeenCalledWith(expect.stringMatching(/^My newer draft/)); expect(change.mock.calls[0][0]).toContain('/work/file.txt'); expect(send).not.toHaveBeenCalled()
})
test('closing the composer during a file picker cannot write into a later screen', async () => {
  let finish!: (paths: string[]) => void
  fixture.pickFiles.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const change = vi.fn()
  await act(() => root.render(<Composer value="@" onChange={change} onSend={() => {}} onStop={() => {}} busy={false} notice="" />))
  await act(() => [...host.querySelectorAll('button')].find(b => b.textContent === 'Choose files to mention')!.click())
  await act(() => root.render(<p>Different screen</p>)); await act(async () => finish(['/work/old-file.txt']))
  expect(change).not.toHaveBeenCalled()
})
