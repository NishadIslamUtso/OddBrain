// @vitest-environment jsdom
import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import EngineStoreSource from '../src/renderer/src/components/EngineStoreSource'
import EngineMarketplace from '../src/renderer/src/components/EngineMarketplace'
import SkillsCatalogSection from '../src/renderer/src/components/SkillsCatalogSection'
import McpServersSection from '../src/renderer/src/components/McpServersSection'
import ExtensionsSection from '../src/renderer/src/components/ExtensionsSection'
import { AGY_MARKETPLACE as source, type StoreEngine } from '../src/shared/lib/marketplace'
const f = vi.hoisted(() => ({ demo: false, market: { sources: vi.fn(), browse: vi.fn(), probe: vi.fn(), installed: vi.fn(), plan: vi.fn(), confirm: vi.fn(), cancel: vi.fn() }, skills: { installCatalog: vi.fn() }, mcp: { read: vi.fn(), write: vi.fn() } }))
vi.mock('../src/renderer/src/platform/bridge', () => ({ get isDemo() { return f.demo }, bridge: { marketplace: f.market, skills: f.skills, mcp: f.mcp } }))
vi.mock('../src/renderer/src/components/ModsSection', () => ({ default: () => createElement('p', null, 'Existing OddBrain packs') }))
let root: Root, host: HTMLDivElement
const catalog = { repo: source, name: source, plugins: [{ name: 'notes', description: 'Fixture notes', author: 'Fixture' }] }
beforeEach(() => {
  vi.resetAllMocks(); f.demo = false; Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  f.market.sources.mockResolvedValue([]); f.market.cancel.mockResolvedValue(undefined)
  f.market.browse.mockResolvedValue({ ok: true, value: catalog })
  f.market.installed.mockResolvedValue({ ok: true, value: '[]' })
  f.market.probe.mockResolvedValue({ ok: true, value: 'CLI checked' })
  f.market.plan.mockImplementation(async (_repo, action, name, engine) => ({ ok: true, value: { token: `token-${engine}`, command: [engine, 'plugin', action, name || ''], explanation: `${engine} owns the whole package` } }))
  f.market.confirm.mockResolvedValue({ ok: true, value: 'Read back: installed and disabled' })
  f.mcp.read.mockResolvedValue({ servers: [], problem: '' })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(() => root.unmount()); host.remove() })
async function mount(element: React.ReactNode) { await act(async () => root.render(element)) }
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent === text)
  expect(button, text).toBeTruthy(); await act(async () => button!.click())
}
async function choose(value: string) {
  await act(async () => { const select = host.querySelector('select')!; select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })) })
}
for (const [kind, Component] of [['skills', SkillsCatalogSection], ['connectors', McpServersSection]] as const) {
  test(`${kind} retains shared controls and browses each engine without changing shared deployment`, async () => {
    await mount(createElement(Component))
    expect(host.querySelector('select')?.textContent).toContain('both engines')
    if (kind === 'skills') expect(host.querySelector('[aria-label="Install the docx skill"]')).not.toBeNull()
    expect(f.market.browse).not.toHaveBeenCalled()
    for (const engine of ['agy', 'claude-code'] as StoreEngine[]) {
      await choose(engine)
      if (engine === 'claude-code') await click('Anthropic · Official marketplace')
      await click('Browse / refresh')
      expect(f.market.browse).toHaveBeenLastCalledWith(engine === 'agy' ? source : 'anthropics/claude-plugins-official', engine)
      expect(host.textContent).toContain('whole package')
    }
    expect(f.skills.installCatalog).not.toHaveBeenCalled(); expect(f.mcp.write).not.toHaveBeenCalled()
    await choose('shared'); expect(host.querySelector('select')?.value).toBe('shared')
  })
}
test('Plugins retains packs and replaces the agy placeholder with its catalog adapter', async () => {
  await mount(createElement(ExtensionsSection, {} as never))
  expect(host.textContent).toContain('Existing OddBrain packs')
  await choose('agy'); await click('Browse / refresh')
  expect(f.market.browse).toHaveBeenCalledWith(source, 'agy'); expect(host.textContent).toContain('Fixture notes')
  expect(host.textContent).not.toContain('No verified agy')
  expect([...host.querySelectorAll('button')].some(b => b.textContent === 'Review update')).toBe(false)
})
test('review and deny cannot mutate; allow passes the same engine and refreshes installed state', async () => {
  await mount(createElement(EngineMarketplace, { engine: 'agy' })); await click('Browse / refresh'); await click('Review install')
  expect(f.market.plan).toHaveBeenCalledWith(source, 'install', 'notes', 'agy')
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain('agy plugin install notes')
  expect(f.market.confirm).not.toHaveBeenCalled(); await click('Deny'); expect(f.market.confirm).not.toHaveBeenCalled()
  expect(f.market.cancel).toHaveBeenCalledWith('agy')
  await click('Review install'); await click('Allow command')
  expect(f.market.confirm).toHaveBeenCalledExactlyOnceWith('token-agy', 'agy')
  expect(f.market.installed).toHaveBeenCalledWith('agy'); expect(host.textContent).toContain('installed and disabled')
})
test('switching engines closes approvals and cancels only the old engine', async () => {
  await mount(createElement(EngineStoreSource, { kind: 'skills', children: 'Shared skills' })); await choose('agy')
  await click('Browse / refresh'); await click('Review install'); await choose('claude-code')
  expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(f.market.cancel).toHaveBeenCalledWith('agy')
  expect(f.market.confirm).not.toHaveBeenCalled(); expect(host.textContent).not.toContain('Fixture notes')
})
test('a late browse from the previous engine never becomes the new engine catalog', async () => {
  let finish!: (r: unknown) => void; f.market.browse.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await mount(createElement(EngineStoreSource, { kind: 'connectors', children: 'Shared MCP' })); await choose('agy'); await click('Browse / refresh')
  await choose('claude-code'); await act(async () => finish({ ok: true, value: catalog }))
  expect(host.textContent).not.toContain('Fixture notes'); expect(f.market.confirm).not.toHaveBeenCalled()
})
test('failed catalog refresh removes stale install choices', async () => {
  await mount(createElement(EngineMarketplace, { engine: 'agy' })); await click('Browse / refresh')
  f.market.browse.mockResolvedValue({ ok: false, error: 'Catalog unavailable' }); await click('Browse / refresh')
  expect(host.textContent).toContain('Catalog unavailable'); expect(host.textContent).not.toContain('Review install')
})
test('engine-reported skills, connectors and disabled state are readable; installed packages work without a catalog fetch', async () => {
  f.market.installed.mockResolvedValue({ ok: true, value: JSON.stringify([{ name: 'notes', source, enabled: false, skills: ['note-writer'], mcpServers: ['notes-api'] }]) })
  await mount(createElement(EngineMarketplace, { engine: 'agy', focus: 'connectors' })); await click('Read installed plugins')
  expect(host.textContent).toContain('Disabled'); expect(host.textContent).toContain('Skills: note-writer'); expect(host.textContent).toContain('Connectors: notes-api')
  await click('Review enable'); expect(f.market.plan).toHaveBeenCalledWith(source, 'enable', 'notes', 'agy')
  expect(f.market.browse).not.toHaveBeenCalled()
})
test('an unsuccessful command remains an error and read-back failure is not presented as a successful install', async () => {
  f.market.confirm.mockResolvedValue({ ok: false, error: 'Command not confirmed by engine' }); f.market.installed.mockRejectedValue(Error('Disconnected'))
  await mount(createElement(EngineMarketplace, { engine: 'agy' })); await click('Browse / refresh'); await click('Review install'); await click('Allow command')
  expect(host.textContent).toContain('Command not confirmed'); expect(host.textContent).toContain('Installed state could not be refreshed')
})
test('browser previews disable engine/network operations instead of fabricating store entries', async () => {
  f.demo = true; await mount(createElement(EngineMarketplace, { engine: 'agy' }))
  for (const text of ['Browse / refresh', 'Check installed CLI', 'Read installed plugins']) expect([...host.querySelectorAll('button')].find(b => b.textContent === text)?.disabled).toBe(true)
  expect(host.textContent).toContain('require the desktop app'); expect(f.market.browse).not.toHaveBeenCalled(); expect(f.market.installed).not.toHaveBeenCalled()
})
test('a failed installed-list refresh removes old status rather than presenting it as current', async () => {
  f.market.installed.mockResolvedValueOnce({ ok: true, value: JSON.stringify([{ name: 'notes', source, enabled: true }]) }).mockResolvedValueOnce({ ok: false, error: 'Cannot read agy' })
  await mount(createElement(EngineMarketplace, { engine: 'agy' })); await click('Read installed plugins')
  expect(host.querySelector('[aria-label="Installed packages"]')).not.toBeNull()
  await click('Read installed plugins')
  expect(host.querySelector('[aria-label="Installed packages"]')).toBeNull(); expect(host.textContent).toContain('Cannot read agy')
})
