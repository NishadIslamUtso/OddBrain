// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import DesktopShell, { type CommandItem } from '../src/renderer/src/ui/DesktopShell'

/**
 * Ctrl+K is the one search in the app, and it used to be mouse-only: Enter ran
 * the first result whatever the list said, and the arrow keys did nothing. A
 * palette you cannot drive from the keyboard is a menu with extra steps.
 */

let container: HTMLDivElement
let root: Root
const ran: string[] = []
const commands: CommandItem[] = [
  { id: 'a', title: 'Garden plan', detail: 'Vault note', run: () => ran.push('garden') },
  { id: 'b', title: 'Kitchen notes', detail: 'Vault note', run: () => ran.push('kitchen') },
  { id: 'c', title: 'Mint harvest', detail: 'Claude · Captured conversation', run: () => ran.push('mint') },
]

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  ran.length = 0
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(() => root.render(
    <DesktopShell
      layout="topbar"
      navigation={{ view: 'chat', onView: () => {}, onNew: () => {}, onSettings: () => {}, name: 'Test' }}
      sidebar={<div />}
      commands={commands}
    >
      <div>Main</div>
    </DesktopShell>
  ))
})

afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
})

const dialog = (): HTMLElement | null => container.querySelector('[role="dialog"]')
const options = (): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('[role="option"]')]
const selected = (): string | null => options().find(option => option.getAttribute('aria-selected') === 'true')?.textContent || null

async function open(): Promise<void> {
  await act(() => (container.querySelector('[aria-label="Search chats, screens and the vault"]') as HTMLButtonElement).click())
}

async function press(key: string): Promise<void> {
  await act(() => {
    container.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  })
}

async function type(value: string): Promise<void> {
  const input = container.querySelector('input[role="combobox"]') as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

test('Ctrl+K opens a palette whose first result is already chosen', async () => {
  expect(dialog()).toBeNull()
  await open()
  expect(dialog()).not.toBeNull()
  expect(options().map(option => option.textContent)).toEqual([
    'Garden planVault note',
    'Kitchen notesVault note',
    'Mint harvestClaude · Captured conversation',
  ])
  expect(selected()).toBe('Garden planVault note')
})

test('the arrow keys move the choice and Enter runs that one, not the first', async () => {
  await open()
  await press('ArrowDown')
  expect(selected()).toBe('Kitchen notesVault note')
  expect(container.querySelector('input[role="combobox"]')!.getAttribute('aria-activedescendant')).toBe('ob-command-option-1')
  await press('ArrowDown')
  expect(selected()).toBe('Mint harvestClaude · Captured conversation')
  await press('ArrowDown')
  expect(selected()).toBe('Mint harvestClaude · Captured conversation')
  await press('ArrowUp')
  expect(selected()).toBe('Kitchen notesVault note')
  await press('Enter')
  expect(ran).toEqual(['kitchen'])
  expect(dialog()).toBeNull()
})

test('Home and End reach the ends, and a typed query starts at its best match again', async () => {
  await open()
  await press('End')
  expect(selected()).toBe('Mint harvestClaude · Captured conversation')
  await press('Home')
  expect(selected()).toBe('Garden planVault note')

  await type('mint')
  expect(options().length).toBe(1)
  expect(selected()).toBe('Mint harvestClaude · Captured conversation')
  await press('Enter')
  expect(ran).toEqual(['mint'])
})

test('a query with no match says so, and Enter does nothing', async () => {
  await open()
  await type('nothing matches this')
  expect(options().length).toBe(0)
  expect(container.querySelector('.ob-empty-line')?.textContent).toBe('No matches.')
  await press('Enter')
  expect(ran).toEqual([])
  expect(dialog()).not.toBeNull()
})

test('Escape closes the palette and the highlight does not survive into the next opening', async () => {
  await open()
  await press('ArrowDown')
  await press('Escape')
  expect(dialog()).toBeNull()
  await open()
  expect(selected()).toBe('Garden planVault note')
})

test('the pointer and the keyboard agree on which row is chosen', async () => {
  await open()
  await act(() => {
    options()[2].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  })
  expect(selected()).toBe('Mint harvestClaude · Captured conversation')
  await press('Enter')
  expect(ran).toEqual(['mint'])
})

test('a row still runs on a click', async () => {
  await open()
  await act(() => options()[1].click())
  expect(ran).toEqual(['kitchen'])
  expect(dialog()).toBeNull()
})

test('a note about a search that stopped short appears only once something was typed', async () => {
  const note = 'Searched 4000 files, then stopped at the limit; the rest was not searched.'
  await act(() => root.render(
    <DesktopShell
      layout="topbar"
      navigation={{ view: 'chat', onView: () => {}, onNew: () => {}, onSettings: () => {}, name: 'Test' }}
      sidebar={<div />}
      commands={commands}
      searchNote={note}
    >
      <div>Main</div>
    </DesktopShell>
  ))
  await open()
  expect(container.querySelector('.ob-command-note')).toBeNull()
  await type('mint')
  expect(container.querySelector('.ob-command-note')?.textContent).toBe(note)
  expect(container.querySelector('.ob-command-note')?.getAttribute('role')).toBe('status')
})
