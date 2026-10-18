// @vitest-environment jsdom
import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import SkillsCatalogSection from '../src/renderer/src/components/SkillsCatalogSection'
const fixture = vi.hoisted(() => ({ installCatalog: vi.fn() }))
vi.mock('../src/renderer/src/platform/bridge', () => ({ bridge: { skills: fixture }, isDemo: false }))
let root: Root, host: HTMLDivElement
beforeEach(() => { vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(() => root.unmount()); host.remove() })
async function clickFirst() { await act(async () => { host.querySelector('button')!.click() }) }
async function mount() { await act(async () => { root.render(createElement(SkillsCatalogSection)) }) }
test('a refused installation shows its error, not Installed, and can be retried successfully', async () => {
  fixture.installCatalog.mockResolvedValueOnce({ ok: false, answer: 'Download refused' }).mockResolvedValueOnce({ ok: true, answer: 'Skill deployed' })
  await mount(); await clickFirst()
  expect(host.textContent).toContain('Download refused'); expect(host.querySelector('button')?.textContent).toBe('Install')
  expect(host.querySelector('.text-warn')).not.toBeNull()
  await clickFirst(); expect(host.querySelector('button')?.textContent).toBe('Installed'); expect(host.textContent).toContain('Skill deployed')
})
test('a rejected IPC request releases busy state and never claims installation', async () => {
  fixture.installCatalog.mockRejectedValue(Error('network failure'))
  await mount(); await clickFirst()
  expect(host.textContent).toContain('Installation failed'); expect(host.querySelector('button')?.textContent).toBe('Install'); expect(host.querySelector('button')?.disabled).toBe(false)
})
test('successful labels remain tied to their skill while another install is pending', async () => {
  let finish!: (value: unknown) => void
  fixture.installCatalog.mockResolvedValueOnce({ ok: true, answer: 'Installed first' }).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await mount(); await clickFirst()
  await act(async () => { host.querySelectorAll('button')[1].click() })
  expect(host.querySelector('button')?.textContent).toBe('Installed'); expect([...host.querySelectorAll('button')].every(b => b.disabled)).toBe(true)
  await act(async () => { finish({ ok: false, answer: 'Second failed' }) })
  expect(host.querySelectorAll('button')[1].textContent).toBe('Install')
})
