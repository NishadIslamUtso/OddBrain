// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, test, expect, vi } from 'vitest'
import SettingsView, { SECTIONS, type SectionId } from '../src/renderer/src/components/SettingsView'
import { DEFAULT_APPEARANCE } from '../src/renderer/src/state/appearance'
import { DEFAULT_LOOK, DEFAULT_SIDEBAR } from '../src/renderer/src/state/look'
import { DEFAULT_PERMISSIONS } from '../src/shared/lib/permissions'
import { DEFAULT_INFERENCE } from '../src/renderer/src/state/performance'
import { SETTINGS_AREAS, areaForSection } from '../src/renderer/src/state/settingsNavigation'
import { KNOWN_MARKETPLACES } from '../src/shared/lib/marketplace'

/** Exercise every retained page through its new group. Browser tests own layout. */

const noop = (): void => undefined
let host: HTMLDivElement
let root: Root
let render: (initialSection?: SectionId) => Promise<void>
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }))
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  render = async initialSection => { await act(async () => {
    root.render(createElement(SettingsView, { initialSection,
      open: true, onClose: noop, vault: { state: 'ready', path: '/vault', error: '', files: 3 },
      onChanged: noop, appearance: DEFAULT_APPEARANCE, onAppearanceChange: noop,
      look: DEFAULT_LOOK, onLookChange: noop, sidebar: DEFAULT_SIDEBAR, onSidebarChange: noop,
      profileName: 'Friend', onProfileNameChange: noop, onTryWorkspace: noop, onReplaySetup: noop,
      inference: DEFAULT_INFERENCE, onInferenceChange: noop,
      permissions: DEFAULT_PERMISSIONS, onPermissionsChange: noop,
    }))
    await new Promise(resolve => setTimeout(resolve, 40))
  }) }
  await render()
})
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.unstubAllGlobals() })

const destinations = (): HTMLButtonElement[] => [...host.querySelectorAll('.ob-settings-area')] as HTMLButtonElement[]
const click = async (button: HTMLButtonElement): Promise<void> => { await act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 20)) }) }
const open = async (title: string): Promise<void> => {
  const section = SECTIONS.find(s => s.title === title)!
  const area = areaForSection(section.id)
  await click(destinations().find(node => node.querySelector('.ob-settings-area-title')?.textContent === area.title)!)
  if (area.sections.length > 1) await click(host.querySelector(`.ob-settings-subsections [aria-label="Section: ${title}"]`) as HTMLButtonElement)
}

test('eight task groups expose all seventeen retained pages without nested buttons', async () => {
  expect(destinations()).toHaveLength(8)
  expect(destinations().map(button => button.querySelector('.ob-settings-area-title')?.textContent)).toEqual(SETTINGS_AREAS.map(area => area.title))
  const ids = SETTINGS_AREAS.flatMap(area => area.sections)
  expect(new Set(ids).size).toBe(17)
  expect([...ids].sort()).toEqual(SECTIONS.filter(s => s.id !== 'maps').map(s => s.id).sort())
  expect(host.querySelector('[aria-label="Section: Capture sources"]')).toBeNull()
  for (const { title } of SECTIONS.filter(s => s.id !== 'maps')) {
    await open(title)
    expect(host.querySelector('.ob-settings-content > header h1')?.textContent).toBe(title)
    expect(host.querySelectorAll('.ob-settings-content button button')).toHaveLength(0)
    expect(host.textContent).not.toContain('This page could not render')
  }
})

test('returning to a group remembers its last page instead of restarting setup', async () => {
  await open('Performance')
  await open('Appearance')
  await click(destinations().find(node => node.querySelector('.ob-settings-area-title')?.textContent === 'AI & connections')!)
  expect(host.querySelector('h1')?.textContent).toBe('Performance')
})

test('legacy capture-settings links go directly to Vault, not another settings page', async () => {
  let opened = 0
  const onOpen = () => { opened++ }
  window.addEventListener('app:capture-sources', onOpen)
  try {
    await render('maps'); expect(opened).toBe(1); expect(host.querySelector('.ob-settings-view')).toBeNull()
    await render('engine'); await render()
    await click(destinations().find(node => node.querySelector('.ob-settings-area-title')?.textContent === 'Appearance')!)
    expect(host.querySelector('h1')?.textContent).toBe('Appearance')
    expect(opened).toBe(1)
  }
  finally { window.removeEventListener('app:capture-sources', onOpen) }
})

test('direct links open the correct group and extra AI review is kept with advanced tools', async () => {
  await render('hooks')
  expect(host.querySelector('.ob-settings-area[aria-current="page"] .ob-settings-area-title')?.textContent).toBe('Advanced tools')
  expect(host.querySelector('h1')?.textContent).toBe('Hooks')
  await render() // return to an uncontrolled test instance
  await open('Engine')
  expect(host.querySelector('[aria-label="Automatic second-pass review"]')).toBeNull()
  await open('House rules')
  expect(host.querySelector('[aria-label="Automatic second-pass review"]')).not.toBeNull()
})

test('Connectors carries the sign-in checks, the Ollama version and the one tool-server list', async () => {
  await open('Connectors')
  expect([...host.querySelectorAll('[aria-label$=" connector"]')].map(node => node.getAttribute('aria-label')))
    .toEqual(['Claude Code connector', 'agy connector', 'Ollama connector'])
  const buttons = [...host.querySelectorAll('button')].map(button => button.textContent)
  expect(buttons.filter(text => text === 'Check sign-in')).toHaveLength(2)
  expect(buttons).toContain('Start Ollama')
  const tools = host.querySelector('[aria-label="Tool servers (MCP)"]')
  expect(tools).not.toBeNull()
  // In an empty browser preview it says what it needs, instead of drawing an
  // Add button that cannot write anything.
  expect(tools?.textContent).toContain('needs the desktop app')
})

test('Plugins offers the two catalogs that actually resolve, and one click fills the source', async () => {
  await open('Plugins')
  const source = host.querySelector('select[aria-label="Plugin source"]') as HTMLSelectElement
  await act(async () => {
    source.value = 'claude'
    source.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 20))
  })
  const input = host.querySelector('input[aria-label="Marketplace repository"]') as HTMLInputElement
  expect(input).not.toBeNull()
  for (const catalog of KNOWN_MARKETPLACES) {
    const button = [...host.querySelectorAll('button')].find(node => node.textContent === catalog.label) as HTMLButtonElement
    expect(button, `${catalog.repo} is offered`).toBeTruthy()
    await act(async () => { button.click(); await Promise.resolve() })
    expect(input.value).toBe(catalog.repo)
  }
})

 test('group descriptions, inline pages, store shortcuts and companion instructions stay discoverable', async () => {
  expect(host.querySelectorAll('.ob-settings-area-description')).toHaveLength(8)
  await open('Connectors')
  expect(host.querySelector('.ob-settings-navigation .ob-settings-subsections [aria-label="Section: Models & API keys"]')).not.toBeNull()
  expect(host.querySelector('.ob-settings-content .ob-settings-subsections')).toBeNull()
  const buttons = () => [...host.querySelectorAll('button')]
  await click(buttons().find(b => b.textContent === 'Engine plugin store')!)
  expect(host.querySelector('h1')?.textContent).toBe('Plugins')
  await open('Connectors'); await click(buttons().find(b => b.textContent === 'Browse skills')!)
  expect(host.querySelector('h1')?.textContent).toBe('Skills')
  await open('Connectors')
  expect(host.querySelector('[aria-label="Install browser companion"]')?.textContent).toContain('Load unpacked')
  await click(buttons().find(b => b.textContent === 'Save extension to Downloads')!)
  expect(host.textContent).toContain('No files were created.')
})
