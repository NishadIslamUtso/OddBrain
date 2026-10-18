// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, test, expect, vi } from 'vitest'
import EngineBay from '../src/renderer/src/components/EngineBay'

/**
 * Swapping engines is allowed, and it is not allowed to lie about when it takes
 * effect. A running turn keeps the engine it started on; the next one uses the
 * new choice — and the bay says which is which at the moment of the swap.
 */

const fixture = vi.hoisted(() => ({
  engine: {
    settings: { id: 'claude-code', model: '', baseUrl: '', workspace: '', approval: 'ask' },
    detection: { loading: false, engines: [
      { id: 'claude-code', found: true, version: '2.1.302', path: '/usr/local/bin/claude' },
      { id: 'agy', found: true, version: '1.0.0', path: '/usr/local/bin/agy' },
    ] },
    models: { loading: false, entries: [], error: '' },
    turn: null as null | { state: string },
    pick: vi.fn(async (id: string) => { fixture.engine.settings.id = id }),
    loadModels: vi.fn(), checkEngines: vi.fn(), pickWorkspace: vi.fn(), setModel: vi.fn(),
    setApproval: vi.fn(), removeModel: vi.fn(),
  },
}))
vi.mock('../src/renderer/src/state/engine', () => ({ useEngine: () => fixture.engine }))

let host: HTMLDivElement, root: Root
beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fixture.engine.settings.id = 'claude-code'
  fixture.engine.turn = null
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(() => root.unmount()); host.remove() })

async function mount() { await act(async () => { root.render(createElement(EngineBay)) }) }
const radio = (label: string) => [...host.querySelectorAll('[role=radio]')].find(node => node.textContent?.includes(label)) as HTMLButtonElement
const status = () => host.querySelector('[role=status]')?.textContent ?? ''

test('a swap between turns is simply saved', async () => {
  await mount()
  await act(async () => { radio('agy').click(); await Promise.resolve() })
  expect(fixture.engine.pick).toHaveBeenCalledWith('agy')
  expect(status()).toBe('')
})

test('a swap during a turn says the running turn keeps its engine', async () => {
  fixture.engine.turn = { state: 'running' }
  await mount()
  await act(async () => { radio('agy').click(); await Promise.resolve() })
  expect(status()).toContain('This turn stays on Claude Code until it ends')
  expect(status()).toContain('the next one uses agy')
})

test('picking an engine that is not installed says a turn will refuse', async () => {
  fixture.engine.detection.engines[1] = { id: 'agy', found: false, version: '', path: '' }
  await mount()
  await act(async () => { radio('agy').click(); await Promise.resolve() })
  expect(status()).toContain('not installed on this machine')
})
