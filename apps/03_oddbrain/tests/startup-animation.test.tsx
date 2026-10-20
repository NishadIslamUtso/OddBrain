// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { normalizeAppearance } from '../src/renderer/src/state/appearance'
let root: import('react-dom/client').Root | undefined
let act: typeof import('react').act
beforeEach(() => { vi.resetModules(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(async () => {
  if (root) await act(async () => root!.unmount())
  root = undefined
  document.body.replaceChildren()
})
async function mount(enabled: boolean) {
  const React = await import('react'); act = React.act
  const { createRoot } = await import('react-dom/client')
  const { default: LaunchOverlay, replayOpening } = await import('../src/renderer/src/ui/LaunchOverlay')
  const container = document.createElement('div'); document.body.append(container)
  root = createRoot(container)
  const render = (value: boolean) => act(async () => root!.render(React.createElement(React.StrictMode, null,
    React.createElement('div', { className: 'ob-app-root' }, 'Workspace'),
    React.createElement(LaunchOverlay, { enabled: value }),
  )))
  await render(enabled)
  return { render, replayOpening }
}
it('defaults to on and preserves a saved off preference through normalization', () => {
  expect(normalizeAppearance({}).startupAnimation).toBe(true)
  expect(normalizeAppearance({ startupAnimation: 'false' }).startupAnimation).toBe(true)
  expect(normalizeAppearance(JSON.parse(JSON.stringify({ startupAnimation: false }))).startupAnimation).toBe(false)
})
it('off opens straight into the workspace without blocking input, including StrictMode', async () => {
  const h = await mount(false)
  expect(document.querySelector('.ob-launch')).toBeNull()
  expect((document.querySelector('.ob-app-root') as HTMLElement).inert).not.toBe(true)
  await h.render(true)
  expect(document.querySelector('.ob-launch')).toBeNull() // no surprise replay when changing settings
})
it('on retains the normal opening and its input guard', async () => {
  await mount(true)
  expect(document.querySelector('.ob-launch')).not.toBeNull()
  expect((document.querySelector('.ob-app-root') as HTMLElement).inert).toBe(true)
})
it('manual replay remains available when automatic startup is off', async () => {
  const h = await mount(false)
  await act(async () => h.replayOpening())
  expect(document.querySelector('.ob-launch')).not.toBeNull()
})
