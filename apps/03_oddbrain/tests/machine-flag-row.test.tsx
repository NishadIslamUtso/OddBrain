// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import MachineFlagRow from '../src/renderer/src/components/MachineFlagRow'

const mock = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), demo: false }))
vi.mock('../src/renderer/src/platform/bridge', () => ({
  get isDemo() { return mock.demo }, bridge: { app: { flags: { get: mock.get, set: mock.set } } },
}))
const flags = { loginItem: false, warmRuntime: false, keepLoadedAlways: false }
let root: Root, host: HTMLDivElement
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mock.demo = false; mock.get.mockReset().mockResolvedValue(flags); mock.set.mockReset()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
async function render(flag: keyof typeof flags = 'loginItem') {
  await act(async () => root.render(<MachineFlagRow flag={flag} onLabel="Enabled" offLabel="Disabled" />))
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
function retry() { return [...host.querySelectorAll('button')].find(button => button.textContent === 'Read setting again')! }

test('unknown initial state is not shown as Off and cannot be changed before reading', async () => {
  const pending = deferred<typeof flags>(); mock.get.mockReturnValue(pending.promise)
  await render(); expect(host.textContent).toContain('Reading setting'); expect(host.querySelector('button')).toBeNull()
  await act(async () => pending.resolve({ ...flags, loginItem: true }))
  expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true')
})
for (const flag of Object.keys(flags) as (keyof typeof flags)[]) {
  test(`${flag}: waits for confirmation and prevents overlapping saves`, async () => {
    const pending = deferred<typeof flags>(); mock.set.mockReturnValue(pending.promise)
    await render(flag)
    const button = flag === 'keepLoadedAlways' ? host.querySelectorAll('button')[1] : host.querySelector('button')!
    await act(async () => { button.click(); button.click() })
    expect(mock.set).toHaveBeenCalledTimes(1); expect(mock.set).toHaveBeenCalledWith({ [flag]: true }); expect(button.disabled).toBe(true)
    expect(button.getAttribute(flag === 'keepLoadedAlways' ? 'aria-pressed' : 'aria-checked')).toBe('false')
    expect(host.textContent).toContain('Saving')
    await act(async () => pending.resolve({ ...flags, [flag]: true }))
    expect(button.disabled).toBe(false)
    expect(button.getAttribute(flag === 'keepLoadedAlways' ? 'aria-pressed' : 'aria-checked')).toBe('true')
  })
}
test('read failure offers a real retry without inventing a value', async () => {
  mock.get.mockRejectedValueOnce(new Error('unavailable'))
  await render(); expect(host.querySelector('[role="switch"]')).toBeNull(); expect(host.textContent).toContain('current value is unknown')
  mock.get.mockResolvedValue({ ...flags, loginItem: true }); await act(async () => retry().click())
  expect(mock.get).toHaveBeenCalledTimes(2); expect(host.querySelector('[role="alert"]')).toBeNull()
  expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true')
})
test('save failure treats a possible partial save as unknown; read-back recovers the actual answer', async () => {
  mock.set.mockRejectedValue(new Error('reply lost after write'))
  await render(); await act(async () => host.querySelector('button')!.click())
  expect(host.querySelector('[role="switch"]')).toBeNull(); expect(host.textContent).toContain('Could not confirm whether this was saved')
  mock.get.mockResolvedValue({ ...flags, loginItem: true }); await act(async () => retry().click())
  expect(mock.set).toHaveBeenCalledTimes(1)
  expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true')
})
test('a rejected choice uses the returned setting, not the requested one', async () => {
  mock.set.mockResolvedValue(flags); await render(); await act(async () => host.querySelector('button')!.click())
  expect(host.textContent).toContain('did not accept this change')
  expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false')
})
test('malformed replies never become a confirmed false', async () => {
  mock.get.mockResolvedValueOnce({ loginItem: 'true' }); await render()
  expect(host.querySelector('[role="switch"]')).toBeNull()
  await act(async () => retry().click()); mock.set.mockResolvedValue(undefined)
  await act(async () => host.querySelector('button')!.click()); expect(host.querySelector('[role="switch"]')).toBeNull()
  expect(host.textContent).toContain('Could not confirm')
})
test('a late answer from the previous flag cannot overwrite the next setting', async () => {
  const pending = deferred<typeof flags>(); mock.set.mockReturnValue(pending.promise)
  await render(); await act(async () => host.querySelector('button')!.click()); await render('warmRuntime')
  await act(async () => pending.resolve({ ...flags, loginItem: true }))
  const button = host.querySelector('[role="switch"]')!
  expect(button.getAttribute('aria-label')).toBe('Warm runtime'); expect(button.getAttribute('aria-checked')).toBe('false')
})
test('browser preview never reads or changes machine settings', async () => {
  mock.demo = true; await render(); expect(host.textContent).toContain('desktop-app switch')
  expect(mock.get).not.toHaveBeenCalled(); expect(mock.set).not.toHaveBeenCalled(); expect(host.querySelector('button')).toBeNull()
})
