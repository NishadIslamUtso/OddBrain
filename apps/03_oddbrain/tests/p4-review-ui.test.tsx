// @vitest-environment jsdom
// NOT RUN. No browser/native/Windows acceptance implied.
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import ChangeReview from '../src/renderer/src/components/ChangeReview'
import PromptEditor from '../src/renderer/src/ui/PromptEditor'
import type { FileReview, FileReviewPort } from '../src/shared/lib/changeReview'
let root: Root | undefined, host: HTMLDivElement
async function mount(node: React.ReactNode) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  if (!root) { host = document.createElement('div'); document.body.append(host); root = createRoot(host) }
  await act(async () => root!.render(node))
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; host?.remove() })
const review: FileReview = { token: 'ticket', path: '/file', diff: '-old\n+new', before: 'old', after: 'new', purpose: 'restore', expiresAt: 100, checks: ['No tests executed'] }
test('late review from replaced adapter cannot display an approvable old command', async () => {
  let resolve!: (value: FileReview) => void
  const decide = vi.fn(), port: FileReviewPort = { preview: () => new Promise(done => { resolve = done }), decide }
  await mount(<ChangeReview port={port} label="Restore" />)
  await act(async () => host.querySelector('button')!.click())
  await mount(<ChangeReview label="Unavailable" />)
  await act(async () => resolve(review))
  expect(host.textContent).not.toContain('Allow this exact change'); expect(host.textContent).toContain('not available'); expect(decide).not.toHaveBeenCalled()
})
test('prompt-editor refusal leaves edited text visible and never closes or sends', async () => {
  const close = vi.fn(), apply = vi.fn(() => { throw Error('Draft changed') })
  await mount(<PromptEditor initial="keep all this text" apply={apply} close={close} />)
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Use edited text')!.click())
  expect(host.querySelector('textarea')!.value).toBe('keep all this text'); expect(host.textContent).toContain('Draft changed'); expect(close).not.toHaveBeenCalled()
})
