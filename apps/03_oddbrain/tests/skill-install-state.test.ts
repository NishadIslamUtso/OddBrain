// @vitest-environment jsdom
import { test, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import SkillsCatalogSection from '../src/renderer/src/components/SkillsCatalogSection'
const fixture = vi.hoisted(() => ({ planCatalog: vi.fn(), decideCatalog: vi.fn(), cancelCatalog: vi.fn() }))
vi.mock('../src/renderer/src/platform/bridge', () => ({ bridge: { skills: fixture }, isDemo: false }))
let root: Root, host: HTMLDivElement
const plan = { token: 'one', name: 'docx', revision: 'a'.repeat(40), manifest: 'Full reviewed manifest', files: ['SKILL.md'], destinations: ['/claude', '/agy'], notice: 'No scripts executed.', expiresAt: Date.now() + 10000 }
beforeEach(() => {
  vi.resetAllMocks(); fixture.planCatalog.mockResolvedValue(plan); fixture.decideCatalog.mockResolvedValue({ ok: true, answer: 'Reviewed skill deployed' }); fixture.cancelCatalog.mockResolvedValue(undefined)
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(() => root.unmount()); host.remove() })
const install = () => host.querySelector('[aria-label="Install the docx skill"]') as HTMLButtonElement
async function click(button: HTMLButtonElement) { await act(async () => button.click()) }
async function choose(label: string) { await click([...host.querySelectorAll('button')].find(b => b.textContent === label)!) }
async function mount() { await act(async () => root.render(createElement(SkillsCatalogSection))) }
test('refused inspection leaves Install available and never claims a write', async () => {
  fixture.planCatalog.mockRejectedValueOnce(Error('Download refused'))
  await mount(); await click(install())
  expect(host.textContent).toContain('Download refused'); expect(install().textContent).toBe('Install'); expect(install().disabled).toBe(false)
  expect(fixture.decideCatalog).not.toHaveBeenCalled()
  await click(install()); expect(host.textContent).toContain('Full reviewed manifest'); expect(fixture.decideCatalog).not.toHaveBeenCalled()
  await choose('Allow pinned installation'); expect(install().textContent).toBe('Installed'); expect(fixture.decideCatalog).toHaveBeenCalledExactlyOnceWith('one', 'allow')
})
test('denial never paints Installed and can be reviewed again', async () => {
  await mount(); await click(install()); await choose('Deny installation')
  expect(install().textContent).toBe('Install'); expect(fixture.decideCatalog).toHaveBeenCalledExactlyOnceWith('one', 'deny')
  await click(install()); expect(host.querySelector('[aria-label="Review skill installation"]')).not.toBeNull()
})
test('failed approval releases busy state without claiming success', async () => {
  fixture.decideCatalog.mockRejectedValue(Error('IPC disconnected'))
  await mount(); await click(install()); await choose('Allow pinned installation')
  expect(host.textContent).toContain('could not be confirmed'); expect(install().textContent).toBe('Install'); expect(install().disabled).toBe(false)
})
test('approval cannot be double-clicked into a second installation', async () => {
  let finish!: (value: unknown) => void
  fixture.decideCatalog.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  await mount(); await click(install()); await choose('Allow pinned installation')
  expect([...host.querySelectorAll('[aria-label="Review skill installation"] button')].every((button: any) => button.disabled)).toBe(true)
  await act(async () => { finish({ ok: true, answer: 'Installed pinned files' }) })
  expect(fixture.decideCatalog).toHaveBeenCalledTimes(1); expect(install().textContent).toBe('Installed')
})
