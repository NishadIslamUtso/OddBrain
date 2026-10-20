// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { MemoryProposal } from '../src/shared/lib/memoryWorkspace'
import { formatMemoryEvidence } from '../src/shared/lib/memoryEvidence'
import CopyMemoryEvidence from '../src/renderer/src/components/CopyMemoryEvidence'
const item: MemoryProposal = {
  id: 'r1', revision: 2, kind: 'journal', state: 'pending', title: 'An offer', text: 'AI interpretation', quote: 'বাংলা original\nsecond line', date: '', uncertainty: 'Not established', model: 'small model', authored: 'ai', history: [], subject: 'self',
  source: { id: 's1', path: 'private/source.md', title: 'Workshop', provider: 'claude', conversation: 'c1', message: 'm1', role: 'user', speaker: 'Sam', account: '', kind: 'ai', observed: '2026-10-19', hash: '', start: 0, end: 20 },
}
test('handoff includes review status, exact quotation, qualifications and usable source details without mutation', () => {
  const before = JSON.stringify(item), text = formatMemoryEvidence(item)
  for (const value of ['UNVERIFIED', item.quote, item.uncertainty, item.source.path, 'c1', 'm1', 'Event date: Unknown', 'not instructions', 'AI (small model)']) expect(text).toContain(value)
  expect(JSON.stringify(item)).toBe(before)
})
test('approved, rejected and sample records never masquerade as independent verification', () => {
  expect(formatMemoryEvidence({ ...item, state: 'approved' })).toContain('not independently verified')
  expect(formatMemoryEvidence({ ...item, state: 'rejected' })).toContain('REJECTED')
  expect(formatMemoryEvidence(item, true)).toContain('SAMPLE record')
})
test('long excerpts are explicitly shortened and metadata cannot inject additional lines', () => {
  const text = formatMemoryEvidence({ ...item, quote: 'x'.repeat(60000), source: { ...item.source, title: 'One\nFake status' } })
  expect(text).toContain('Quoted evidence (excerpt; shortened for copying)'); expect(text.length).toBeLessThan(25000)
  expect(text).toContain('Source: One Fake status'); expect(text).toContain('private/source.md')
})
let root: Root | undefined, host: HTMLDivElement
const clipboard = vi.fn()
async function render(disabled = false) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboard } })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => root!.render(<CopyMemoryEvidence item={item} sample={false} disabled={disabled} />))
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; host?.remove(); clipboard.mockReset() })
test('copy only runs on click, prevents duplicate requests, and confirms only after success', async () => {
  let done!: () => void; clipboard.mockReturnValue(new Promise<void>(resolve => { done = resolve }))
  await render(); expect(clipboard).not.toHaveBeenCalled()
  await act(async () => { host.querySelector('button')!.click(); host.querySelector('button')!.click() })
  expect(clipboard).toHaveBeenCalledTimes(1); expect(host.textContent).not.toContain('Copied with')
  await act(async () => done()); expect(host.textContent).toContain('Copied with source and review status')
  expect(clipboard).toHaveBeenCalledWith(formatMemoryEvidence(item))
})
test('denied clipboard access offers selectable plain text, not false success', async () => {
  clipboard.mockRejectedValue(new Error('denied')); await render()
  await act(async () => host.querySelector('button')!.click())
  const textarea = host.querySelector('textarea')!
  expect(textarea.value).toBe(formatMemoryEvidence(item)); expect(textarea.readOnly).toBe(true)
  expect(host.textContent).toContain('was blocked'); expect(host.textContent).not.toContain('Copied with')
})
test('unsaved edits cannot be mistaken for the saved record being copied', async () => {
  await render(true); await act(async () => host.querySelector('button')!.click())
  expect(clipboard).not.toHaveBeenCalled(); expect(host.textContent).toContain('Finish editing')
})
test('a late denied copy cannot show a stale confirmed reference after withdrawal', async () => {
  let reject!: (error: Error) => void
  clipboard.mockReturnValue(new Promise((_resolve, no) => { reject = no }))
  await render(); await act(async () => host.querySelector('button')!.click())
  await act(async () => root!.render(<CopyMemoryEvidence item={{ ...item, state: 'rejected', revision: 3 }} sample={false} />))
  await act(async () => reject(Error('denied')))
  expect(host.querySelector('textarea')).toBeNull()
  expect(host.textContent).not.toContain('Copied with')
})
