// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, test, expect, vi } from 'vitest'
import ConnectorsSection from '../src/renderer/src/components/ConnectorsSection'
const fixture = vi.hoisted(() => ({
  engine: { settings: { id: 'claude-code' }, detection: { loading: false, engines: [{ id: 'claude-code', found: true, version: 'fixture', path: '/fixture/claude' }, { id: 'agy', found: true, version: 'fixture', path: '/fixture/agy' }] }, checkEngines: vi.fn(), pick: vi.fn() },
  api: { binaryOverride: vi.fn(), clearBinary: vi.fn(), pickBinary: vi.fn(), authStatus: vi.fn(), ollamaVersion: vi.fn(), openLogin: vi.fn(), models: vi.fn(), downloads: { serveStatus: vi.fn(), serveStart: vi.fn(), serveStop: vi.fn(), start: vi.fn(), run: vi.fn() } },
  mcp: { read: vi.fn(), write: vi.fn() },
}))
vi.mock('../src/renderer/src/state/engine', () => ({ useEngine: () => fixture.engine }))
vi.mock('../src/renderer/src/platform/bridge', () => ({ getEngineApi: () => fixture.api, isDemo: false, bridge: { mcp: fixture.mcp } }))
let host: HTMLDivElement, root: Root
beforeEach(() => {
  vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fixture.engine.settings.id = 'claude-code'
  fixture.api.binaryOverride.mockResolvedValue({ path: '' }); fixture.api.pickBinary.mockResolvedValue({ ok: true }); fixture.api.clearBinary.mockResolvedValue({ ok: true })
  fixture.api.downloads.serveStatus.mockResolvedValue({ ok: true, running: true, answer: 'Fixture runtime is running.' })
  fixture.api.authStatus.mockResolvedValue({ ok: true, loggedIn: true, method: 'oauth', provider: 'firstParty', answer: 'Signed in with oauth.' })
  fixture.api.ollamaVersion.mockResolvedValue({ ok: true, version: '0.15.2', compatible: true, answer: 'Ollama 0.15.2 is new enough.' })
  fixture.api.openLogin.mockResolvedValue({ ok: true, answer: 'A terminal should have opened.' })
  fixture.mcp.read.mockResolvedValue({ servers: [] }); fixture.mcp.write.mockResolvedValue({ ok: true, written: [], answer: 'Fixture list written.' })
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
  await click(button('Choose executable…')); expect([...host.querySelectorAll('[role=status]')].some(node => node.textContent === 'Fixture selection was refused.')).toBe(true)
})

test('tool servers are listed, removed and added through the one MCP list', async () => {
  fixture.mcp.read.mockResolvedValue({ servers: [{ name: 'old', command: 'npx', args: ['-y', 'old-mcp'] }] })
  await mount()
  expect(host.textContent).toContain('old-mcp')
  const remove = host.querySelector('[aria-label="Remove old"]') as HTMLButtonElement
  await click(remove)
  expect(fixture.mcp.write).toHaveBeenCalledWith([])

  const set = (label: string, value: string) => {
    const input = host.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  await act(async () => {
    set('Server name', 'files')
    set('Command', 'npx')
    set('Arguments', '-y files-mcp')
  })
  await click(button('Add server'))
  expect(fixture.mcp.write).toHaveBeenCalledWith([{ name: 'files', command: 'npx', args: ['-y', 'files-mcp'] }])
})

test('a bad tool server is refused before anything is written', async () => {
  await mount()
  expect(fixture.mcp.write).not.toHaveBeenCalled()
  const set = (label: string, value: string) => {
    const input = host.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  await act(async () => { set('Server name', 'bad name!'); set('Command', 'npx') })
  await click(button('Add server'))
  expect(fixture.mcp.write).not.toHaveBeenCalled()
  expect(host.textContent).toContain('Server names')
})

test('a not-signed-in engine offers the terminal, and says where the sign-in happened', async () => {
  fixture.api.authStatus.mockResolvedValue({ ok: true, loggedIn: false, method: 'none', provider: 'firstParty', answer: 'Not signed in. Run `claude` once in a terminal to sign in.' })
  await mount()
  const signIn = button('Sign in…')
  expect(signIn).toBeTruthy()
  await click(signIn)
  expect(fixture.api.openLogin).toHaveBeenCalledTimes(1)
  expect(host.textContent).toContain('A terminal should have opened.')
})
