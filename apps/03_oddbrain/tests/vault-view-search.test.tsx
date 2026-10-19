// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

/**
 * The Vault screen's own search box used to call `/grep`: the first matching
 * line per file, in walk order. The palette searched the same vault with the
 * ranked search. Two answers, two qualities, one folder. These tests hold the
 * screen to the palette's search: ranked rows, the chat a captured message came
 * from, and the honest line when the walk stopped short.
 */

const mocks = vi.hoisted(() => ({ vaultGet: vi.fn() }))
vi.mock('@shared/lib/vault', () => ({ vaultGet: mocks.vaultGet }))
vi.mock('../src/renderer/src/motion/Mascot', () => ({ Mascot: () => null }))
vi.mock('../src/renderer/src/components/MemoryMap', () => ({ default: () => null }))

import VaultView from '../src/renderer/src/components/VaultView'

let container: HTMLDivElement
let root: Root

const hits = [
  {
    path: '02 Sources/Conversations/Browser/aa/conversation.md',
    kind: 'conversation',
    title: 'Mint on the balcony',
    line: 1,
    score: 21,
    matches: 2,
    snippet: { text: '# Mint on the balcony', start: 2, end: 6 },
    conversation: { title: 'Mint on the balcony', provider: 'Claude', url: 'https://claude.ai/chat/aa', at: '2026-10-18T12:00:00Z' },
  },
  {
    path: 'Projects/Kitchen.md',
    kind: 'note',
    title: 'Kitchen',
    line: 4,
    score: 12,
    matches: 1,
    snippet: { text: 'mint lives by the window', start: 0, end: 4 },
  },
]

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.clear()
  mocks.vaultGet.mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(() => root.render(<VaultView onAddToComposer={() => {}} />))
})

afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  delete (window as unknown as { api?: unknown }).api
})

async function type(value: string): Promise<void> {
  const input = container.querySelector('input[aria-label="Search the vault"]') as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

test('Enter searches contents with the ranked search, not the old grep', async () => {
  mocks.vaultGet.mockResolvedValue({ ok: true, hits, scanned: { files: 12, bytes: 9000, capped: false, partial: 0 } })
  await type('mint')
  expect(mocks.vaultGet).toHaveBeenCalledWith('/search?q=mint&limit=40')
  expect(mocks.vaultGet).not.toHaveBeenCalledWith(expect.stringContaining('/grep'))
  const rows = [...container.querySelectorAll('li button')]
  expect(rows[0].textContent).toContain('Mint on the balcony')
  expect(rows[0].textContent).toContain('Claude · # Mint on the balcony', 'a captured message names the provider that said it')
  expect(rows[1].textContent).toContain('Kitchen')
  expect(rows[1].textContent).toContain('Vault note · mint lives by the window')
  expect(container.textContent).toContain('2 files mention it')
  expect(container.textContent).not.toContain('stopped at the limit')
})

test('a search that hit a bound says so, and clearing the query clears it', async () => {
  mocks.vaultGet.mockResolvedValue({
    ok: true,
    hits,
    scanned: { files: 4000, bytes: 24_000_000, capped: true, partial: 1 },
  })
  await type('mint')
  expect(container.textContent).toContain('Searched 4000 files, then stopped at the limit; the rest was not searched.')
  expect(container.textContent).toContain('1 file was longer than 64 KB and read in part.')
  await act(() => {
    const input = container.querySelector('input[aria-label="Search the vault"]') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(container.textContent).not.toContain('stopped at the limit')
})

test('a row opens the file, and a captured message offers the original page', async () => {
  const openExternal = vi.fn()
  ;(window as unknown as { api?: unknown }).api = { app: { openExternal } }
  mocks.vaultGet.mockImplementation((path: string) => {
    if (path.startsWith('/search')) return Promise.resolve({ ok: true, hits, scanned: { files: 2, bytes: 10, capped: false, partial: 0 } })
    if (path === '/file?path=02%20Sources%2FConversations%2FBrowser%2Faa%2Fconversation.md') {
      return Promise.resolve({
        ok: true,
        content: '# Mint on the balcony\n\nWe talked about mint.',
        truncated: false,
        conversation: hits[0].conversation,
      })
    }
    return Promise.resolve({ ok: false })
  })
  await type('mint')
  await act(async () => {
    ;(container.querySelectorAll('li button')[0] as HTMLButtonElement).click()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  expect(mocks.vaultGet).toHaveBeenCalledWith('/file?path=02%20Sources%2FConversations%2FBrowser%2Faa%2Fconversation.md')
  expect(container.textContent).toContain('We talked about mint.')
  expect(container.textContent).toContain('Claude · Mint on the balcony · 2026-10-18')
  const original = [...container.querySelectorAll('button')].find(button => button.textContent === 'Open original')
  expect(original).toBeTruthy()
  await act(() => original!.click())
  expect(openExternal).toHaveBeenCalledWith('https://claude.ai/chat/aa')
})

test('a failing search says so instead of showing nothing', async () => {
  mocks.vaultGet.mockResolvedValue({ ok: false, error: 'The vault is not available.' })
  await type('mint')
  expect(container.textContent).toContain('The vault is not available.')
})
