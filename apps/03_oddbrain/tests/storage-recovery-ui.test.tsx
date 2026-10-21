// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import ChatStorageBanner from '../src/renderer/src/components/ChatStorageBanner'
import ReadTrustManager from '../src/renderer/src/components/ReadTrustManager'
import type { ChatState } from '../src/renderer/src/state/useChats'

let host: HTMLDivElement, root: Root

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  localStorage.clear()
})

afterEach(async () => {
  await act(() => root.unmount())
  host.remove()
  delete (window as any).api
  delete (window as any).engineApi
})

test('storage attention stays visible and exposes all recovery actions', async () => {
  const retryStorage = vi.fn().mockResolvedValue(true)
  const exportRecovery = vi.fn().mockResolvedValue({ ok: true, answer: 'Recovery data exported.' })
  const importRecovery = vi.fn().mockResolvedValue({ ok: true, answer: 'Recovery data imported.' })
  const openStorageLocation = vi.fn().mockResolvedValue({ ok: true, answer: 'Storage folder opened.' })
  const chats: Pick<ChatState, 'storage' | 'retryStorage' | 'exportRecovery' | 'importRecovery' | 'openStorageLocation'> = {
    storage: { state: 'attention', message: 'Conversation storage could not be opened.' },
    retryStorage,
    exportRecovery,
    importRecovery,
    openStorageLocation,
  }
  await act(async () => root.render(<ChatStorageBanner chats={chats} />))
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(chats.storage.message)
  expect(host.querySelector('aside')?.className).not.toContain('fixed')
  for (const [label, action] of [
    ['Retry storage', retryStorage],
    ['Export recovery', exportRecovery],
    ['Import recovery', importRecovery],
    ['Open storage folder', openStorageLocation],
  ] as const) {
    await act(async () => {
      ;[...host.querySelectorAll('button')].find(button => button.textContent === label)!.click()
      await Promise.resolve()
    })
    expect(action).toHaveBeenCalledOnce()
  }
  await act(() => [...host.querySelectorAll('button')].find(button => button.textContent === 'Minimize')!.click())
  expect(host.textContent).toContain(chats.storage.message)
  expect(host.textContent).not.toContain('Export recovery')
  await act(() => [...host.querySelectorAll('button')].find(button => button.textContent === 'Show recovery controls')!.click())
  expect(host.textContent).toContain('Export recovery')
})

test('routine checkpoint saving never takes layout space', async () => {
  const noop = async () => ({ ok: true, answer: '' })
  await act(async () => root.render(<ChatStorageBanner chats={{ storage: { state: 'saving', message: 'Saving conversation…' }, retryStorage: async () => true, exportRecovery: noop, importRecovery: noop, openStorageLocation: noop }} />))
  expect(host.querySelector('[aria-label="Conversation storage status"]')).toBeNull()
})

test('remembered Read access shows its authority and is revocable outside an active prompt', async () => {
  const rule = {
    id: 'rule-1',
    mode: 'folder' as const,
    engine: 'claude-code' as const,
    scope: 'C:\\owner\\project',
    workspace: 'C:\\owner',
    createdAt: '2026-10-20T00:00:00.000Z',
  }
  const revoke = vi.fn().mockResolvedValue({
    ok: true,
    answer: 'Remembered Read access removed.',
    view: { rules: [] },
  })
  Object.assign(window, {
    api: {},
    engineApi: {
      readTrust: {
        list: vi.fn().mockResolvedValue({ ok: true, view: { rules: [rule] } }),
        migrateLegacy: vi.fn(),
        revoke,
      },
    },
  })
  await act(async () => {
    root.render(<ReadTrustManager always />)
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(host.textContent).toContain('C:\\owner\\project')
  expect(host.textContent).toContain('Claude Code · Working folder: C:\\owner')
  const details = host.querySelector('details')!
  expect(details.open).toBe(true)
  await act(() => host.querySelector('summary')!.click())
  expect(details.open).toBe(false)
  await act(async () => {
    ;[...host.querySelectorAll('button')].find(button => button.textContent === 'Revoke')!.click()
    await Promise.resolve()
  })
  expect(revoke).toHaveBeenCalledExactlyOnceWith('rule-1')
  expect(host.textContent).toContain('No active read approvals.')
})
