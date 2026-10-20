// @vitest-environment jsdom
import { test, expect, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import EngineBay from '../src/renderer/src/components/EngineBay'
const fixture = vi.hoisted(() => ({ engine: {
  settings: { id: 'claude-code', model: '', cloudProvider: '', workspace: '', approval: 'ask' },
  models: { loading: false, error: 'Ollama unavailable.', entries: [{ name: 'provider-fixture', cloud: true, sizeGB: null, provider: 'anthropic' }] },
  alive: false, ambient: { busy: false, note: '', updatedAt: null },
    detection: { loading: false, engines: [] }, loadModels: vi.fn(), checkEngines: vi.fn(), setModel: vi.fn(),
} }))
vi.mock('../src/renderer/src/state/engine', () => ({ useEngine: () => fixture.engine }))
test('a partial discovery failure does not hide usable provider models in the real picker', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host)
  try {
    await act(async () => { root.render(createElement(EngineBay)) })
    await act(async () => { host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!.click() })
    const option = host.querySelector<HTMLButtonElement>('[role="menuitemradio"]')!
    expect(option.textContent).toContain('provider-fixture'); expect(option.textContent).toContain('Anthropic')
    await act(async () => { option.click() })
    expect(fixture.engine.setModel).toHaveBeenCalledWith('provider-fixture', 'anthropic')
  } finally { await act(() => root.unmount()); host.remove() }
})
