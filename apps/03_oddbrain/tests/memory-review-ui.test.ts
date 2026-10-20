// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import MemoryReviewGroup from '../src/renderer/src/components/MemoryReviewGroup'
import type { MemoryProposal } from '../src/shared/lib/memoryWorkspace'
let host: HTMLDivElement, root: Root
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(() => root.unmount()); host.remove() })
const records = (): MemoryProposal[] => [1,2].map(n => ({ id: String(n), title: `Suggestion ${n}`, text: `Proposed words ${n}`, quote: `Original quote ${n}`, date: '', uncertainty: 'Not certain', kind: 'profile', subject: 'account', state: 'pending', revision: 1, authored: 'ai', model: 'fixture', history: [], source: { id: 's', path: 'source.json', title: 'Conversation', provider: 'Messenger', conversation: 'c', message: String(n), role: 'other', speaker: 'Sam', account: 'account', kind: 'people', observed: '2026-10-19', hash: '', start: 0, end: 10 } }))
const button = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent === text)!
const click = async (node: HTMLElement) => { await act(async () => { node.click() }) }
test('group selection is explicit, previews exact text and quotations, cancellation never writes', async () => {
  const send = vi.fn(async () => true), items = records()
  await act(() => root.render(createElement(MemoryReviewGroup, { records: items, busy: false, act: send, children: p => createElement('p', {}, p.text) })))
  expect(button('Review selected (0)').disabled).toBe(true)
  await click(host.querySelector('input')!)
  await click(button('Review selected (1)'))
  expect(host.textContent).toContain('Original quote 1'); expect(host.textContent).toContain('Not certain'); expect(host.textContent).toContain('not-approved'); expect(host.textContent).toContain('would-be-confirmed')
  expect(send).not.toHaveBeenCalled()
  await click(button('Cancel group review')); expect(send).not.toHaveBeenCalled()
  await click(button('Review selected (1)')); await click(button('Confirm selected interpretations'))
  expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'review-batch', ids: ['1'], decision: 'approve' })
})
test('a changed record invalidates the open preview instead of approving unseen wording', async () => {
  const send = vi.fn(async () => true), items = records()
  const render = async () => { await act(() => root.render(createElement(MemoryReviewGroup, { records: items, busy: false, act: send, children: p => createElement('p', {}, p.text) }))) }
  await render(); await click(host.querySelector('input')!); await click(button('Review selected (1)'))
  items[0] = { ...items[0], text: 'Changed while reading', revision: 2 }; await render()
  expect(button('Confirm selected interpretations').disabled).toBe(true)
  expect(host.querySelector('[role=alert]')?.textContent).toContain('changed')
  expect(send).not.toHaveBeenCalled()
})
