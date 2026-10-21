// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { emptyReviewCenter } from '../src/shared/lib/reviewCenter'

const fixture = vi.hoisted(() => ({
  vaultGet: vi.fn(), vaultPost: vi.fn(),
  memoryWorkspace: { run: vi.fn() },
  attachmentCenter: { read: vi.fn(), previewDelete: vi.fn(), confirmDelete: vi.fn() },
  processing: { read: vi.fn() },
  folderAccess: { read: vi.fn(), choose: vi.fn(), revoke: vi.fn(), list: vi.fn() },
}))
vi.mock('../src/renderer/src/platform/bridge', () => ({ bridge: fixture }))
vi.mock('../src/shared/lib/vault', () => ({ vaultGet: fixture.vaultGet, vaultPost: fixture.vaultPost }))
import ReviewCenter from '../src/renderer/src/components/ReviewCenter'
import AttachmentCenter from '../src/renderer/src/components/AttachmentCenter'

let root: Root, host: HTMLDivElement
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks(); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(() => root.unmount()); host.remove() })
const change = async (element: HTMLInputElement | HTMLSelectElement, value: string) => { await act(async () => { const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set; setter?.call(element, value); element.dispatchEvent(new Event(element instanceof HTMLInputElement ? 'input' : 'change', { bubbles: true })) }) }
const click = async (text: string) => { const button = [...host.querySelectorAll('button')].find(row => row.textContent === text); expect(button).toBeTruthy(); await act(async () => { button!.click(); await Promise.resolve(); await Promise.resolve() }) }

test('the owner can run a review for a custom number of days', async () => {
  const review = emptyReviewCenter()
  fixture.vaultGet.mockResolvedValue(review)
  fixture.vaultPost.mockResolvedValue(review)
  await act(async () => root.render(<ReviewCenter />))
  const range = host.querySelector('select[aria-label="Review range"]') as HTMLSelectElement
  await change(range, 'custom')
  const days = host.querySelector('input[aria-label="Custom review days"]') as HTMLInputElement
  expect(days).toBeTruthy(); await change(days, '45'); expect(days.value).toBe('45'); expect([...host.querySelectorAll('button')].find(row => row.textContent === 'Run review')?.disabled).toBe(false); await click('Run review')
  expect(fixture.vaultPost).toHaveBeenCalledWith('/review-scan', { days: 45 })
})

test('folder listing results and durable activity receipts are visible', async () => {
  const base = { id: 'grant-1', folder: 'C:/Owner/Research', purpose: 'Review current research', projectId: null, createdAt: '2026-10-21T01:00:00.000Z', expiresAt: null, revokedAt: null, sessionOnly: false, read: true as const, write: false, watch: false, review: true, cloud: false, commands: false }
  const granted = { ...base, receipts: [{ at: base.createdAt, action: 'granted' as const, detail: 'Read access granted.' }] }
  const listed = { ...base, receipts: [...granted.receipts, { at: '2026-10-21T02:00:00.000Z', action: 'listed' as const, detail: 'Listed metadata for 1 file; no contents were read.' }] }
  fixture.attachmentCenter.read.mockResolvedValue({ ok: true, state: { version: 1, revision: 0, records: [] } })
  fixture.processing.read.mockResolvedValue({ ok: false, error: 'No processing ledger in this fixture.' })
  fixture.folderAccess.read.mockResolvedValueOnce({ ok: true, state: { version: 1, revision: 1, grants: [granted] } }).mockResolvedValueOnce({ ok: true, state: { version: 1, revision: 2, grants: [listed] } })
  fixture.folderAccess.list.mockResolvedValue({ ok: true, files: [{ path: 'notes/source.pdf', bytes: 2048, modifiedAt: '2026-10-20T00:00:00.000Z' }], capped: false, answer: '1 file listed.' })
  await act(async () => root.render(<AttachmentCenter />)); await click('List names and sizes')
  expect(host.textContent).toContain('notes/source.pdf'); expect(host.textContent).toContain('2 KB'); expect(host.textContent).toContain('Listed metadata for 1 file')
  expect(host.textContent).toContain('Metadata only. No contents were read or captured.')
})
