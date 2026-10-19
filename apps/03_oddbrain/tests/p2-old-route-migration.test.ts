import { describe, expect, it } from 'vitest'
import { migrateHistoryLocation, migrateHistoryStack, resolveSavedView } from '../src/renderer/src/state/viewRoute'

/**
 * p2 — old-route migration (NOT RUN by the implementing agent).
 * The standalone Code screen is retired. A saved `code` location, a menu
 * target, or a Back-stack entry must land in Projects (where the board
 * now lives), keep every other part of the location, and keep Back
 * order — no entry is dropped, reordered, or stripped of its chat.
 */

describe('p2 old route migration', () => {
  it('a saved code screen resolves to projects', () => {
    expect(resolveSavedView('code')).toBe('projects')
    expect(resolveSavedView('projects')).toBe('projects')
    expect(resolveSavedView('chat')).toBe('chat')
    expect(resolveSavedView('nonsense')).toBe('chat')
    expect(resolveSavedView(undefined)).toBe('chat')
    expect(resolveSavedView(null)).toBe('chat')
  })

  it('migration translates only the view, preserving the location', () => {
    const location = { view: 'code', chatId: 'chat-9', projectFocus: '', settings: null }
    const migrated = migrateHistoryLocation(location)
    expect(migrated).toEqual({ view: 'projects', chatId: 'chat-9', projectFocus: '', settings: null })
    // Untouched locations stay the same object (no churn, no copies).
    const chat = { view: 'chat', chatId: 'chat-1', projectFocus: '', settings: null }
    expect(migrateHistoryLocation(chat)).toBe(chat)
  })

  it('a whole Back stack migrates in order, so Back still walks it', () => {
    const stack = [
      { view: 'chat', chatId: 'chat-1' },
      { view: 'code', chatId: '' },
      { view: 'vault', chatId: '' },
      { view: 'code', chatId: 'chat-2' },
    ]
    const migrated = migrateHistoryStack(stack)
    expect(migrated.map((entry) => entry.view)).toEqual(['chat', 'projects', 'vault', 'projects'])
    // Simulate Back: newest first out, each landing somewhere that exists.
    expect(migrated.pop()?.view).toBe('projects')
    expect(migrated.pop()?.view).toBe('vault')
    expect(migrated.pop()?.view).toBe('projects')
    expect(migrated.pop()?.chatId).toBe('chat-1')
  })

  it('no migrated stack can yield the retired screen', () => {
    const stack = migrateHistoryStack([{ view: 'code' }, { view: 'code' }])
    expect(stack.every((entry) => entry.view !== 'code')).toBe(true)
  })
})
