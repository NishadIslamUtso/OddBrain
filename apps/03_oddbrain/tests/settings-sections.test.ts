// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, test, expect } from 'vitest'
import SettingsView, { SECTIONS } from '../src/renderer/src/components/SettingsView'
import { DEFAULT_APPEARANCE } from '../src/renderer/src/state/appearance'
import { DEFAULT_LOOK, DEFAULT_SIDEBAR } from '../src/renderer/src/state/look'
import { DEFAULT_PERMISSIONS } from '../src/shared/lib/permissions'
import { DEFAULT_INFERENCE } from '../src/renderer/src/state/performance'
import { KNOWN_MARKETPLACES } from '../src/shared/lib/marketplace'

/**
 * Every Settings destination, rendered.
 *
 * `scripts/check-ui*.cjs` proves this in a real browser, which is the owner's
 * acceptance bar but cannot run here or in CI. This is the same claim without a
 * browser: all eighteen destinations open, the heading matches, no button sits
 * inside another button, and the two panes the audit asked about really carry
 * their controls. The browser run still owns anything that depends on layout.
 */

const noop = (): void => undefined
let host: HTMLDivElement
let root: Root
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => {
    root.render(createElement(SettingsView, {
      open: true, onClose: noop, vault: { state: 'ready', path: '/vault', error: '', files: 3 },
      onChanged: noop, appearance: DEFAULT_APPEARANCE, onAppearanceChange: noop,
      look: DEFAULT_LOOK, onLookChange: noop, sidebar: DEFAULT_SIDEBAR, onSidebarChange: noop,
      profileName: 'Friend', onProfileNameChange: noop, onTryWorkspace: noop, onReplaySetup: noop,
      inference: DEFAULT_INFERENCE, onInferenceChange: noop,
      permissions: DEFAULT_PERMISSIONS, onPermissionsChange: noop,
    }))
    await new Promise(resolve => setTimeout(resolve, 40))
  })
})
afterEach(async () => { await act(() => root.unmount()); host.remove() })

const destinations = (): HTMLButtonElement[] => [...host.querySelectorAll('.ob-settings-navigation button[aria-label^="Section:"]')] as HTMLButtonElement[]
const open = async (title: string): Promise<void> => {
  const button = destinations().find(node => node.textContent?.trim() === title)
  if (!button) throw new Error(`No destination named ${title}`)
  await act(async () => { button.click(); await new Promise(resolve => setTimeout(resolve, 20)) })
}

test('all eighteen destinations open with their own heading and no nested buttons', async () => {
  expect(destinations()).toHaveLength(18)
  expect(SECTIONS.map(section => section.title)).toEqual(destinations().map(button => button.textContent?.trim()))
  for (const { title } of SECTIONS) {
    await open(title)
    expect(host.querySelector('.ob-settings-content > header h1')?.textContent).toBe(title)
    expect(host.querySelectorAll('.ob-settings-content button button')).toHaveLength(0)
  }
  // Nothing was added to the navigation by inventing a page: the count is the
  // claim in the README, and it is counted from the same list the rail draws.
  expect(SECTIONS).toHaveLength(18)
  expect(new Set(SECTIONS.map(section => section.id)).size).toBe(18)
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
