// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, test, expect, vi } from 'vitest'
import ConnectorsSection from '../src/renderer/src/components/ConnectorsSection'
const fixture = vi.hoisted(() => ({
  engine: { settings: { id: 'claude-code' }, detection: { loading: false, engines: [{ id: 'claude-code', found: true, version: 'fixture', path: '/fixture/claude' }, { id: 'agy', found: true, version: 'fixture', path: '/fixture/agy' }] }, checkEngines: vi.fn(), pick: vi.fn() },
  api: { binaryOverride: vi.fn(), clearBinary: vi.fn(), pickBinary: vi.fn(), models: vi.fn(), downloads: { serveStatus: vi.fn(), serveStart: vi.fn(), serveStop: vi.fn(), start: vi.fn(), run: vi.fn() } },
}))
vi.mock('../src/renderer/src/state/engine', () => ({ useEngine: () => fixture.engine }))
vi.mock('../src/renderer/src/platform/bridge', () => ({ getEngineApi: () => fixture.api, isDemo: false }))
let host: HTMLDivElement, root: Root
beforeEach(() => {
  vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fixture.engine.settings.id = 'claude-code'
  fixture.api.binaryOverride.mockResolvedValue({ path: '' }); fixture.api.pickBinary.mockResolvedValue({ ok: true }); fixture.api.clearBinary.mockResolvedValue({ ok: true })
  fixture.api.downloads.serveStatus.mockResolvedValue({ ok: true, running: true, answer: 'Fixture runtime is running.' })
  fixture.api.downloads.serveStart.mockResolvedValue({ ok: true, answer: 'Started fixture.' }); fixture.api.downloads.serveStop.mockResolvedValue({ ok: true, answer: 'Stopped fixture.' })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(() => root.unmount()); host.remove() })
async function mount() { await act(async () => { root.render(createElement(ConnectorsSection)) }) }
const button = (name: string, within: Element = host) => [...within.querySelectorAll('button')].find(b => b.textContent === name)!
async function click(button: HTMLButtonElement) { await act(async () => { button.click(); await Promise.resolve() }) }

test('all three connectors render with executable selection and external setup links', async () => {
  await mount()
  for (const label of ['Claude Code', 'agy', 'Ollama']) expect(host.querySelector(`[aria-label="${label} connector"]`)).not.toBeNull()
  expect([...host.querySelectorAll('a')].map(a => a.href)).toEqual(['https://code.claude.com/docs/en/setup', 'https://antigravity.google/', 'https://ollama.com/download'])
  expect([...host.querySelectorAll('button')].filter(b => b.textContent === 'Choose executable…')).toHaveLength(2)
})
test('actual probe results use text and runtime status never borrows the selected engine model list', async () => {
  fixture.engine.settings.id = 'agy'; await mount()
  expect(host.textContent).toContain('Installed · fixture'); expect(host.textContent).toContain('Running')
  expect(host.querySelector('.bg-ok,.bg-muted')).toBeNull()
  expect(fixture.api.downloads.serveStatus).toHaveBeenCalledTimes(1); expect(fixture.api.models).not.toHaveBeenCalled()
})
test('selection and executable buttons use the real bridge methods', async () => {
  await mount(); const agy = host.querySelector('[aria-label="agy connector"]')!
  await click(button('Use this engine', agy)); expect(fixture.engine.pick).toHaveBeenCalledWith('agy')
  await click(button('Choose executable…', agy)); expect(fixture.api.pickBinary).toHaveBeenCalledWith('agy')
})
test('a configured executable can be reset to automatic detection', async () => {
  fixture.api.binaryOverride.mockResolvedValue({ path: '/fixture/chosen' }); await mount()
  await click(button('Use automatic detection', host.querySelector('[aria-label="Claude Code connector"]')!))
  expect(fixture.api.clearBinary).toHaveBeenCalledWith('claude-code')
})
test('runtime start/stop remain available without any download or installer action', async () => {
  await mount(); await click(button('Start Ollama')); await click(button('Stop app-started runtime'))
  expect(fixture.api.downloads.serveStart).toHaveBeenCalledTimes(1); expect(fixture.api.downloads.serveStop).toHaveBeenCalledTimes(1)
  expect(fixture.api.downloads.start).not.toHaveBeenCalled(); expect(fixture.api.downloads.run).not.toHaveBeenCalled()
  expect([...host.querySelectorAll('button')].some(b => /download|install/i.test(b.textContent || ''))).toBe(false)
})
test('failed executable changes show the bridge error rather than claiming success', async () => {
  fixture.api.pickBinary.mockResolvedValue({ ok: false, answer: 'Fixture selection was refused.' }); await mount()
  await click(button('Choose executable…')); expect(host.querySelector('[role=status]')?.textContent).toBe('Fixture selection was refused.')
})
