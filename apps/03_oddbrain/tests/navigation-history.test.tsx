// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, test, expect } from 'vitest'
import useNavigationHistory from '../src/renderer/src/hooks/useNavigationHistory'
import TitleBar from '../src/renderer/src/components/TitleBar'
let host: HTMLDivElement, root: Root, navigate: (page: string) => void, back: () => void
function Harness() {
  const [page, setPage] = useState('chat'), [draft, setDraft] = useState('Unsaved draft')
  const history = useNavigationHistory({ page }, page, location => setPage(location.page))
  navigate = setPage; back = history.back
  return <><TitleBar interactive={false} onNew={() => setPage('chat')} onBack={history.back} canBack={history.canBack} /><p data-page>{page}</p><input aria-label="Draft" value={draft} onChange={e => setDraft(e.target.value)} /></>
}
beforeEach(async () => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); await act(() => root.render(<Harness />)) })
afterEach(async () => { await act(() => root.unmount()); host.remove() })
const button = (label: string) => host.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement

test('brand opens New chat; Back returns to the previous page without clearing the draft', async () => {
  expect(button('Back').disabled).toBe(true)
  await act(() => navigate('settings:appearance')); await act(() => navigate('projects'))
  await act(() => button('OddBrain, new chat').click()); expect(host.querySelector('[data-page]')?.textContent).toBe('chat')
  await act(() => back()); expect(host.querySelector('[data-page]')?.textContent).toBe('projects')
  await act(() => back()); expect(host.querySelector('[data-page]')?.textContent).toBe('settings:appearance')
  expect((host.querySelector('input') as HTMLInputElement).value).toBe('Unsaved draft')
})
test('Back consumes history instead of bouncing between two pages', async () => {
  await act(() => navigate('settings:you')); await act(() => navigate('settings:models'))
  await act(() => back()); await act(() => back())
  expect(host.querySelector('[data-page]')?.textContent).toBe('chat'); expect(button('Back').disabled).toBe(true)
})
test('history is bounded and repeated renders of the same page add no entries', async () => {
  for (let i = 0; i < 70; i++) await act(() => navigate(`page-${i}`))
  await act(() => navigate('page-69'))
  for (let i = 0; i < 64; i++) await act(() => back())
  expect(host.querySelector('[data-page]')?.textContent).toBe('page-5'); expect(button('Back').disabled).toBe(true)
})
test('a read-only miniature cannot start a conversation or navigate', async () => {
  await act(() => root.render(<TitleBar interactive={false} />))
  expect(button('OddBrain, new chat').disabled).toBe(true); expect(button('Back').disabled).toBe(true)
  await act(() => button('OddBrain, new chat').click())
})
