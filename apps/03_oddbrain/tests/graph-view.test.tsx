// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import ConnectionGraph from '../src/renderer/src/components/ConnectionGraph'
import { GRAPH_KEY } from '../src/renderer/src/state/graph'
const fixture = vi.hoisted(() => ({ links: vi.fn(), vault: vi.fn(), refresh: vi.fn(), reset: vi.fn(), zoom: vi.fn(), dispose: vi.fn(), mount: vi.fn() }))
vi.mock('../src/renderer/src/platform/bridge', () => ({ bridge: { structure: { linkCheck: fixture.links } } }))
vi.mock('../src/shared/lib/vault', () => ({ vaultGet: fixture.vault }))
vi.mock('../src/renderer/src/motion/Mascot', () => ({ Mascot: () => null }))
vi.mock('../src/renderer/src/lib/graphCanvas', () => ({ mountGraph: fixture.mount }))
let host: HTMLDivElement, root: Root
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fixture.mount.mockReturnValue({ refresh: fixture.refresh, reset: fixture.reset, zoom: fixture.zoom, dispose: fixture.dispose })
  fixture.links.mockResolvedValue({ files: 3, checked: 3, dead: [{ from: 'a.md', target: 'missing' }], ambiguous: [], edges: [{ from: 'a.md', to: 'b.md' }] })
  fixture.vault.mockResolvedValue({ ok: true, files: ['a.md', 'b.md', 'lonely.md'] })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(() => root.unmount()); host.remove() })
async function render(isDemo = false, path = '/fixture') { await act(async () => { root.render(<ConnectionGraph path={path} isDemo={isDemo} variant="full" />) }) }
const button = (name: string) => [...host.querySelectorAll('button')].find(b => b.textContent === name)!
async function click(name: string) { await act(async () => { button(name).click(); await Promise.resolve() }) }
async function select(name: string) { await act(() => { const element = host.querySelector('[aria-label="Select graph note"]') as HTMLSelectElement; element.value = name; element.dispatchEvent(new Event('change', { bubbles: true })) }) }

test('browser preview never invents a graph or reads native files', async () => {
  await render(true); expect(fixture.links).not.toHaveBeenCalled(); expect(fixture.vault).not.toHaveBeenCalled(); expect(host.querySelector('canvas')).toBeNull(); expect(host.textContent).toContain('desktop app')
})
test('one real link check supplies the view, including isolated notes and unresolved counts', async () => {
  await render(); expect(fixture.links).toHaveBeenCalledTimes(1); expect(host.textContent).toContain('3 of 3 notes · 1 connections'); expect(host.textContent).toContain('1 unresolved'); expect(host.querySelectorAll('select option')).toHaveLength(4)
  const scene = fixture.mount.mock.calls[0][1]; expect(scene.names).not.toContain('missing'); expect(scene.names).toContain('lonely.md')
})
test('dimension choice and appearance survive remount, controls call the renderer', async () => {
  await render(); await click('2D'); await click('Fit view'); await click('Appearance')
  expect(host.querySelector('[aria-label="Graph appearance"]')).not.toBeNull(); expect(JSON.parse(localStorage.getItem(GRAPH_KEY)!)).toMatchObject({ mode: '2d' }); expect(fixture.reset).toHaveBeenCalled()
  await act(() => root.render(null)); await render(); expect(button('2D').getAttribute('aria-pressed')).toBe('true'); expect(fixture.dispose).toHaveBeenCalled()
})
test('failed file listing still draws real links and explicitly discloses missing orphans', async () => {
  fixture.vault.mockRejectedValue(Error('offline')); await render(); expect(host.textContent).toContain('Unlinked notes could not be loaded'); expect(host.textContent).toContain('2 of 2 notes')
})
test('link-check errors and retry are visible instead of a blank or invented canvas', async () => {
  fixture.links.mockRejectedValueOnce(Error('Fixture vault denied')); await render(); expect(host.textContent).toContain('Fixture vault denied'); expect(host.querySelector('canvas')).toBeNull()
  await click('Refresh'); expect(host.querySelector('canvas')).not.toBeNull()
})
test('changing selection prevents a stale note read from replacing the current note', async () => {
  await render(); await select('a.md')
  let resolve!: (value: unknown) => void
  fixture.vault.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  await click('Read note'); await select('b.md')
  await act(() => resolve({ ok: true, content: 'STALE NOTE BODY' }))
  expect(host.textContent).not.toContain('STALE NOTE BODY'); expect(host.querySelector('.ob-graph-selection')?.textContent).toContain('b.md')
  fixture.vault.mockResolvedValueOnce({ ok: true, content: 'Selected note body', truncated: true }); await click('Read note')
  expect(host.querySelector('pre')?.textContent).toContain('Selected note body'); expect(host.querySelector('pre')?.textContent).toContain('Preview truncated')
})
test('a late old-vault response cannot replace the new vault', async () => {
  let resolve!: (value: unknown) => void
  fixture.links.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  await render(); await render(false, '/new-vault')
  await act(() => resolve({ files: 1, checked: 1, dead: [], ambiguous: [], edges: [{ from: 'OLD.md', to: 'GONE.md' }] }))
  expect(host.textContent).not.toContain('OLD.md'); expect(host.textContent).toContain('3 of 3 notes')
})
