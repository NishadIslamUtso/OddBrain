// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, test, expect, vi } from 'vitest'
import Composer from '../src/renderer/src/components/Composer'
vi.mock('../src/renderer/src/hooks/useDictation', () => ({ default: () => ({ active: false, toggle: vi.fn(), cancel: vi.fn() }) }))
let container: HTMLDivElement, root: Root
const send = vi.fn(), change = vi.fn(), stop = vi.fn()
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.clear(); send.mockClear(); change.mockClear(); stop.mockClear()
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(() => root.unmount()); container.remove() })
async function render(value: string, busy = false) { await act(() => root.render(<Composer value={value} onChange={change} onSend={send} onStop={stop} busy={busy} notice="" onFiles={() => {}} onProject={() => {}} />)) }
async function key(key: string, shiftKey = false) { await act(() => { container.querySelector('textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })) }) }

test('slash menu arrows select templates; Tab and Enter insert without sending', async () => {
  await render('/')
  expect(container.querySelector('[role="listbox"]')).not.toBeNull()
  const first = container.querySelector('[role="option"]')!
  expect(first.getAttribute('aria-selected')).toBe('true')
  await key('ArrowDown'); expect(first.getAttribute('aria-selected')).toBe('false')
  await key('ArrowUp'); expect(first.getAttribute('aria-selected')).toBe('true')
  await key('Tab'); expect(change).toHaveBeenCalledTimes(1); expect(send).not.toHaveBeenCalled()
  await render('/sum'); await key('Enter'); expect(change).toHaveBeenCalledTimes(2); expect(send).not.toHaveBeenCalled()
})
test('Escape dismisses a template; normal Enter sends, Shift+Enter does not, busy Escape stops', async () => {
  await render('/'); await key('Escape'); expect(container.querySelector('[role="listbox"]')).toBeNull()
  await render('A normal draft'); await key('Enter', true); expect(send).not.toHaveBeenCalled()
  await key('Enter'); expect(send).toHaveBeenCalledTimes(1)
  await render('A normal draft', true)
  expect(container.querySelector('[aria-label="Add request to queue"]')).not.toBeNull()
  await key('Enter'); expect(send).toHaveBeenCalledTimes(2)
  await key('Escape'); expect(stop).toHaveBeenCalledTimes(1)
})
test('busy work queues text but keeps exact files for a later send', async () => {
  await act(() => root.render(<Composer value="Use this picture" onChange={change} onSend={send} onStop={stop} busy notice="" attachments={[{ id: 'image-1', name: 'photo.png', kind: 'image', data: 'AA==' }]} />))
  const button = container.querySelector('[aria-label="Files cannot be queued"]') as HTMLButtonElement
  expect(button.disabled).toBe(true)
  expect(container.textContent).toContain('Exact files can’t enter the text queue. Remove them to queue text, or wait.')
  await key('Enter'); expect(send).not.toHaveBeenCalled()
})
test('attachment picker accepts broad formats and all chat tools remain reachable', async () => {
  await render('A normal draft')
  expect(container.querySelector('input[type="file"]')!.hasAttribute('accept')).toBe(false)
  await act(() => { (container.querySelector('[aria-label="More chat tools"]') as HTMLButtonElement).click() })
  const tools = container.querySelector('[aria-label="Chat tools"]')!
  for (const label of ['Project', 'Cook context', 'Brain battle', 'Split a task', 'Show thinking', 'Turn journal']) expect(tools.textContent).toContain(label)
})
