/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ChatStoreAnswer, ChatStoreMigration, ChatStoreSnapshot, ChatStoreWrite } from '../src/shared/lib/chatStore'
import type { Chat } from '../src/shared/types'

let host: HTMLDivElement, root: Root
const first: Chat = { id: 'one', title: 'Original', date: 'Today', messages: [] }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.clear(); vi.useFakeTimers(); vi.resetModules()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => {
  await act(() => root.unmount())
  host.remove(); delete window.api; vi.useRealTimers(); vi.restoreAllMocks()
})

test('desktop hook migrates exact legacy strings, sends changed chats only, and verifies commits', async () => {
  const rawChats = JSON.stringify([first]), rawCurrent = JSON.stringify('one')
  localStorage.setItem('ai-assistant.chats', rawChats)
  localStorage.setItem('ai-assistant.current-chat', rawCurrent)
  let snapshot: ChatStoreSnapshot = { initialized: false, revision: 0, chats: [], currentChat: '' }
  const migrate = vi.fn(async (input: ChatStoreMigration): Promise<ChatStoreAnswer> => {
    expect(input.rawChats).toBe(rawChats); expect(input.rawCurrentChat).toBe(rawCurrent)
    snapshot = { initialized: true, revision: 1, chats: input.chats as Chat[], currentChat: input.currentChat as string }
    return { ok: true, snapshot, migrated: true }
  })
  const write = vi.fn(async (input: ChatStoreWrite): Promise<ChatStoreAnswer> => {
    expect(input.expectedRevision).toBe(snapshot.revision)
    const changed = new Map((input.upserts as Chat[]).map(chat => [chat.id, chat]))
    const existing = new Map(snapshot.chats.map(chat => [chat.id, chat]))
    snapshot = {
      initialized: true,
      revision: snapshot.revision + 1,
      chats: (input.order as string[]).map(id => changed.get(id) || existing.get(id)!),
      currentChat: input.currentChat as string,
    }
    return { ok: true, snapshot }
  })
  window.api = { chats: { read: async () => ({ ok: true, snapshot }), migrate, write } } as NonNullable<Window['api']>
  const { useChats } = await import('../src/renderer/src/state/useChats')
  let state!: ReturnType<typeof useChats>
  const warnings: string[] = []
  function Harness() { state = useChats(message => warnings.push(message)); return createElement('span', null, state.ready ? state.chats[0]?.title : 'loading') }
  await act(async () => { root.render(createElement(Harness)); await Promise.resolve(); await Promise.resolve() })
  expect(migrate).toHaveBeenCalledOnce()
  expect(state.ready).toBe(true); expect(state.chats[0].title).toBe('Original'); expect(warnings).toEqual([])

  await act(() => state.rename('one', 'Renamed'))
  await act(async () => { await vi.advanceTimersByTimeAsync(500) })
  expect(write).toHaveBeenCalledOnce()
  expect(write.mock.calls[0][0]).toMatchObject({ order: ['one'], currentChat: 'one', upserts: [{ id: 'one', title: 'Renamed' }] })

  let committed = false
  await act(async () => { committed = await state.commit(chats => [{ ...chats[0], pinned: true }]) })
  expect(committed).toBe(true)
  expect(write).toHaveBeenCalledTimes(2)
  expect((write.mock.calls[1][0].upserts as Chat[])[0]).toMatchObject({ id: 'one', pinned: true })
  // Main-process storage is now authoritative; the exact legacy source is left
  // untouched in localStorage as an additional migration fallback.
  expect(localStorage.getItem('ai-assistant.chats')).toBe(rawChats)
})

test('an open failure stays globally actionable and retry preserves edits made while storage was unavailable', async () => {
  const rawChats = JSON.stringify([first]), rawCurrent = JSON.stringify('one')
  localStorage.setItem('ai-assistant.chats', rawChats); localStorage.setItem('ai-assistant.current-chat', rawCurrent)
  let reads = 0
  let snapshot: ChatStoreSnapshot = { initialized: true, revision: 4, chats: [first], currentChat: 'one' }
  const read = vi.fn(async (): Promise<ChatStoreAnswer> => ++reads === 1 ? { ok: false, error: 'Both conversation indexes are damaged.' } : { ok: true, snapshot })
  const write = vi.fn(async (input: ChatStoreWrite): Promise<ChatStoreAnswer> => {
    const changed = new Map((input.upserts as Chat[]).map(chat => [chat.id, chat]))
    snapshot = { initialized: true, revision: snapshot.revision + 1, chats: (input.order as string[]).map(id => changed.get(id) || snapshot.chats.find(chat => chat.id === id)!), currentChat: input.currentChat as string }
    return { ok: true, snapshot }
  })
  const exportRecovery = vi.fn(async (input: ChatStoreMigration) => ({ ok: true, answer: `exported ${String((input.chats as Chat[])[0]?.title)}` }))
  window.api = { chats: { read, migrate: vi.fn(), write, exportRecovery, importRecovery: async () => ({ ok: false, answer: 'cancelled' }), openLocation: async () => ({ ok: true, answer: 'opened' }) } } as NonNullable<Window['api']>
  const { useChats } = await import('../src/renderer/src/state/useChats')
  let state!: ReturnType<typeof useChats>
  function Harness() { state = useChats(); return createElement('span', null, state.storage.state) }
  await act(async () => { root.render(createElement(Harness)); await Promise.resolve(); await Promise.resolve() })
  expect(state.ready).toBe(true); expect(state.storage).toMatchObject({ state: 'attention', message: expect.stringContaining('damaged') })

  await act(() => state.rename('one', 'Kept while unavailable'))
  expect(write).not.toHaveBeenCalled()
  await act(async () => { expect(await state.retryStorage()).toBe(true) })
  expect(state.chats[0].title).toBe('Kept while unavailable')
  // Retry is not reported successful until the retained edit is durably written.
  expect(write).toHaveBeenCalledOnce()
  expect((write.mock.calls[0][0].upserts as Chat[])[0].title).toBe('Kept while unavailable')
  await act(async () => { expect((await state.exportRecovery()).ok).toBe(true) })
  expect(exportRecovery.mock.calls[0][0].rawChats).toBe(rawChats)
})

test('recovery import reloads the merged library and durably reapplies edits made while its dialogs were open', async () => {
  let snapshot: ChatStoreSnapshot = { initialized: true, revision: 2, chats: [first], currentChat: 'one' }
  const read = vi.fn(async (): Promise<ChatStoreAnswer> => ({ ok: true, snapshot }))
  const write = vi.fn(async (input: ChatStoreWrite): Promise<ChatStoreAnswer> => {
    const changed = new Map((input.upserts as Chat[]).map(chat => [chat.id, chat]))
    const previous = new Map(snapshot.chats.map(chat => [chat.id, chat]))
    snapshot = { initialized: true, revision: snapshot.revision + 1, chats: (input.order as string[]).map(id => changed.get(id) || previous.get(id)!), currentChat: input.currentChat as string }
    return { ok: true, snapshot }
  })
  let finishImport!: (answer: { ok: boolean; answer: string }) => void
  const importRecovery = vi.fn(() => new Promise<{ ok: boolean; answer: string }>(resolve => { finishImport = resolve }))
  window.api = { chats: { read, migrate: vi.fn(), write, exportRecovery: vi.fn(), importRecovery, openLocation: vi.fn() } } as NonNullable<Window['api']>
  const { useChats } = await import('../src/renderer/src/state/useChats')
  let state!: ReturnType<typeof useChats>
  function Harness() { state = useChats(); return createElement('span', null, state.storage.state) }
  await act(async () => { root.render(createElement(Harness)); await Promise.resolve(); await Promise.resolve() })

  let importing!: Promise<{ ok: boolean; answer: string }>
  await act(async () => { importing = state.importRecovery(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
  expect(importRecovery).toHaveBeenCalledOnce()
  await act(() => state.rename('one', 'Edited during import review'))
  snapshot = { ...snapshot, revision: snapshot.revision + 1, chats: [...snapshot.chats, { id: 'recovered', title: 'Recovered chat', date: 'Older', messages: [] }] }
  await act(async () => { finishImport({ ok: true, answer: 'Imported.' }); expect(await importing).toEqual({ ok: true, answer: 'Imported.' }) })

  expect(state.chats.map(chat => chat.id)).toEqual(['one', 'recovered'])
  expect(state.chats[0].title).toBe('Edited during import review')
  expect((write.mock.calls.at(-1)![0].upserts as Chat[])[0].title).toBe('Edited during import review')
  expect(state.storage.state).toBe('ready')
})
