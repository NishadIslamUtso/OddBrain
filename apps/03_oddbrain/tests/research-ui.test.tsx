// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import MemoryMap from '../src/renderer/src/components/MemoryMap'

/**
 * The sources screen may fetch one page the owner names. These tests keep the
 * interface honest: the refusal reason appears before any request, a fetch
 * writes nothing until it is asked, and a failure is shown as the failure.
 */

const fixture = vi.hoisted(() => ({ demo: false, vault: vi.fn(), fetch: vi.fn(), cancel: vi.fn() }))
vi.mock('../src/renderer/src/platform/bridge', () => ({
  get isDemo() { return fixture.demo },
  bridge: { research: { fetch: fixture.fetch, cancel: fixture.cancel } },
}))
vi.mock('../src/shared/lib/vault', () => ({ vaultGet: fixture.vault }))
vi.mock('@shared/lib/sampleWorkspace', () => ({ sampleEnabled: () => false }))

let host: HTMLDivElement, root: Root
beforeEach(() => {
  vi.clearAllMocks(); fixture.demo = false
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  fixture.vault.mockResolvedValue({ ok: true, available: true, entries: [], summary: { total: 0, capped: false, kinds: { conversation: 0, page: 0, visit: 0 }, hosts: [] } })
  fixture.fetch.mockResolvedValue({ ok: true, answer: 'Saved as 02 Sources/Web Pages/2026/web-abc.md · 120 bytes.', source: '02 Sources/Web Pages/2026/web-abc.md', url: 'https://example.com/a', title: 'A', bytes: 120, sha256: 'f'.repeat(64) })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(() => root.unmount()); host.remove() })
const mount = async () => { await act(async () => { root.render(React.createElement(MemoryMap, { open: true, onClose: () => {}, embedded: true })) }) }
const button = (name: string) => [...host.querySelectorAll('button')].find(node => node.textContent === name) as HTMLButtonElement | undefined
const field = () => host.querySelector('[aria-label="Page address to fetch"]') as HTMLInputElement
async function type(value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(field(), value)
    field().dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function click(name: string) {
  const found = button(name); expect(found, name).toBeTruthy()
  await act(async () => { found!.click(); await Promise.resolve() })
}

test('a plain-http address is refused on screen, with the reason, before anything is sent', async () => {
  await mount()
  await type('http://example.com/a')
  expect(host.textContent).toContain('Use https://')
  expect(button('Fetch page')?.disabled).toBe(true)
  await click('Fetch page')
  expect(fixture.fetch).not.toHaveBeenCalled()
})

test('a public https page is fetched only when asked, and the fingerprint is shown', async () => {
  await mount()
  await type('https://example.com/a')
  expect(button('Fetch page')?.disabled).toBe(false)
  expect(fixture.fetch).not.toHaveBeenCalled()
  await click('Fetch page')
  expect(fixture.fetch).toHaveBeenCalledExactlyOnceWith('https://example.com/a')
  expect(host.textContent).toContain('Saved as 02 Sources/Web Pages/2026/web-abc.md')
  expect(host.textContent).toContain(`sha256 ${'f'.repeat(64)}`)
  expect(field().value).toBe('', 'the address clears only after a saved page')
})

test('a refused fetch keeps the address and says what happened', async () => {
  fixture.fetch.mockResolvedValue({ ok: false, answer: 'The site answered 404. Nothing was written.' })
  await mount()
  await type('https://example.com/gone')
  await click('Fetch page')
  expect(host.textContent).toContain('404. Nothing was written')
  expect(field().value).toBe('https://example.com/gone')
})

test('a build without the fetch handler says so instead of failing silently', async () => {
  const { bridge } = await import('../src/renderer/src/platform/bridge')
  const original = bridge.research
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (bridge as any).research
  try {
    await mount()
    await type('https://example.com/a')
    await click('Fetch page')
    expect(host.textContent).toContain('needs the desktop app')
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(bridge as any).research = original
  }
})
