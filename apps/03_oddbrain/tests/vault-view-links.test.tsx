// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

/**
 * Backlinks have two halves: notes that link here, and notes that say this
 * note's name without linking. The panel had only the first. This holds the
 * second half: the ranked search for the note's name in quotes, minus the notes
 * that already link (so a relation is never counted twice), and a click opens
 * the note that mentions it.
 */

const mocks = vi.hoisted(() => ({
  vaultGet: vi.fn(),
  linkCheck: vi.fn(async () => ({
    edges: [
      { from: 'Projects/Index.md', to: 'Projects/Kitchen.md' },
      { from: 'Projects/Kitchen.md', to: 'Projects/Garden.md' },
    ],
    dead: [{ from: 'Projects/Kitchen.md', target: 'Nope' }],
  })),
}))

vi.mock('@shared/lib/vault', () => ({ vaultGet: mocks.vaultGet }))
vi.mock('@/platform/bridge', () => ({
  isDemo: false,
  bridge: {
    structure: { linkCheck: mocks.linkCheck },
    vault: { exportCopy: async () => ({ answer: '' }) },
  },
}))
vi.mock('../src/renderer/src/motion/Mascot', () => ({ Mascot: () => null }))
vi.mock('../src/renderer/src/components/MemoryMap', () => ({ default: () => null }))

import VaultView from '../src/renderer/src/components/VaultView'

let container: HTMLDivElement
let root: Root

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.clear()
  mocks.vaultGet.mockReset()
  mocks.vaultGet.mockImplementation((path: string) => {
    if (path === '/files') {
      return Promise.resolve({
        ok: true,
        available: true,
        root: '/notes',
        files: ['Projects/Kitchen.md', 'Projects/Index.md', 'Projects/Elsewhere.md', '02 Sources/Conversations/Browser/aa/messages/bb.md'],
        capped: false,
      })
    }
    if (path === '/file?path=Projects%2FKitchen.md') {
      return Promise.resolve({ ok: true, content: '# Kitchen\n\nSee [[Garden]].', truncated: false })
    }
    if (path === '/file?path=Projects%2FElsewhere.md') {
      return Promise.resolve({ ok: true, content: '# Elsewhere\n\nThe Kitchen door was open.', truncated: false })
    }
    if (path.startsWith('/file?path=02%20Sources')) {
      return Promise.resolve({
        ok: true,
        content: 'a message',
        truncated: false,
        conversation: { title: 'Mint', provider: 'Claude', url: 'https://claude.ai/chat/aa', at: '2026-10-18T12:00:00Z', role: 'user' },
      })
    }
    if (path === '/search?q=%22Kitchen%22&limit=12&kind=note') {
      return Promise.resolve({
        ok: true,
        hits: [
          { path: 'Projects/Index.md', kind: 'note', title: 'Index', snippet: { text: 'Kitchen list' } },
          { path: 'Projects/Elsewhere.md', kind: 'note', title: 'Elsewhere', snippet: { text: 'the Kitchen door' } },
          { path: 'Projects/Kitchen.md', kind: 'note', title: 'Kitchen', snippet: { text: '# Kitchen' } },
        ],
        scanned: { files: 3, bytes: 300, capped: false, partial: 0 },
      })
    }
    return Promise.resolve({ ok: false, error: 'unexpected ' + path })
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<VaultView onAddToComposer={() => {}} />)
    await new Promise(resolve => setTimeout(resolve, 0))
  })
})

afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
})

async function openKitchen(): Promise<void> {
  const button = [...container.querySelectorAll('button')].find(node => node.textContent?.trim() === 'Kitchen.md')
  expect(button).toBeTruthy()
  await act(async () => {
    button!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

const paragraph = (label: string): HTMLElement | undefined =>
  [...container.querySelectorAll('p')].find(node => node.textContent?.startsWith(label))

test('a note that mentions the name without a link is listed, and a note that links is not', async () => {
  await openKitchen()
  expect(mocks.linkCheck).toHaveBeenCalledTimes(1)
  expect(paragraph('Links ·')?.textContent || container.querySelector('summary')?.textContent).toContain('1 in · 1 out · 1 unresolved')
  expect(paragraph('Linked from:')?.textContent).toContain('Index.md')
  expect(paragraph('Links to:')?.textContent).toContain('Garden.md')
  expect(paragraph('Unresolved here:')?.textContent).toContain('Nope')
  expect(mocks.vaultGet).toHaveBeenCalledWith('/search?q=%22Kitchen%22&limit=12&kind=note')
  const mentioned = paragraph('Mentioned in:')?.textContent || ''
  expect(mentioned).toContain('Elsewhere.md')
  expect(mentioned).not.toContain('Index.md')
  expect(mentioned).not.toContain('Kitchen.md')
})

test('clicking a mention opens the note that mentions it', async () => {
  await openKitchen()
  const mention = [...container.querySelectorAll('button')].find(node => node.textContent === 'Elsewhere.md')
  expect(mention).toBeTruthy()
  await act(async () => {
    mention!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  expect(mocks.vaultGet).toHaveBeenCalledWith('/file?path=Projects%2FElsewhere.md')
  expect(container.textContent).toContain('The Kitchen door was open.')
})

test('a captured message does not look for mentions of a message hash', async () => {
  await act(async () => {
    const button = [...container.querySelectorAll('button')].find(node => node.textContent?.trim() === 'bb.md')
    expect(button).toBeTruthy()
    button!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
  expect(mocks.vaultGet).not.toHaveBeenCalledWith(expect.stringContaining('kind=note'))
  expect(container.textContent).toContain('Claude · Mint · user')
})
