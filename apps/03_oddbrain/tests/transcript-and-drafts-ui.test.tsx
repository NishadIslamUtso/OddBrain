// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import SavedDrafts from '../src/renderer/src/ui/SavedDrafts'
import TranscriptHistory from '../src/renderer/src/ui/TranscriptHistory'
import { draftStash } from '../src/shared/lib/draftStash'
import { createHash } from 'node:crypto'
const fixture = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn(), media: vi.fn() }))
vi.mock('../src/renderer/src/platform/bridge', () => ({ bridge: { transcripts: fixture } }))
let root: Root, host: HTMLDivElement
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); localStorage.clear(); vi.clearAllMocks(); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(() => root.unmount()); host.remove() })
const click = async (text: string) => { const b = [...host.querySelectorAll('button')].find(b => b.textContent === text); expect(b).toBeTruthy(); await act(async () => b!.click()) }
test('saving a draft never sends or replaces it; inserting requires an explicit click', async () => {
  const insert = vi.fn(), close = vi.fn(), text = 'Full saved draft ' + 'x'.repeat(3000)
  await act(() => root.render(<SavedDrafts draft={text} insert={insert} close={close} />))
  await click('Save current draft'); expect(insert).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled()
  expect(draftStash(localStorage, 'oddbrain.saved-drafts').list()[0].text).toBe(text)
  await click('Insert into draft'); expect(insert).toHaveBeenCalledWith(text); expect(close).toHaveBeenCalledOnce()
})
test('storage failures stay visible and the composer is untouched', async () => {
  localStorage.setItem('oddbrain.saved-drafts.broken', 'corrupted'); const insert = vi.fn()
  await act(() => root.render(<SavedDrafts draft="Keep this" insert={insert} close={() => {}} />))
  await click('Save current draft'); expect(host.textContent).toContain('damaged'); expect(insert).not.toHaveBeenCalled(); expect(localStorage.getItem('oddbrain.saved-drafts.broken')).toBe('corrupted')
})
test('full transcript view shows complete text and never offers a misleading resume action', async () => {
  const header = { id: 'fixture', at: '2026-10-19T00:00:00Z', title: 'Recorded task', engine: 'agy', model: '', workspace: '/work', pictures: 1 }
  fixture.list.mockResolvedValue({ ok: true, value: { entries: [header], next: '', notice: '' } })
  fixture.read.mockResolvedValue({ ok: true, value: { header, prompt: 'Original request', events: [{ kind: 'text', text: 'x'.repeat(5000) + 'UNCLIPPED END' }], state: 'interrupted', incomplete: true } })
  await act(async () => root.render(<TranscriptHistory />)); await click('Recorded task')
  expect(host.querySelector('pre')?.textContent).toContain('UNCLIPPED END')
  expect(host.textContent).toContain('interrupted'); expect(host.textContent).toContain('their bytes were not preserved')
  expect(host.textContent).not.toContain('Save picture 1')
  expect([...host.querySelectorAll('button')].some(b => /resume|run task/i.test(b.textContent || ''))).toBe(false)
})
test('preserved pictures are offered for download only after the record and the returned bytes agree', async () => {
  const bytes = Buffer.from('exact preserved bytes')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const media = { files: [{ index: 0, mime: 'image/png' as const, bytes: bytes.length, sha256 }], bytes: bytes.length }
  const header = { id: 'fixture', at: '2026-10-19T00:00:00Z', title: 'Picture turn', engine: 'agy' as const, model: '', workspace: '/work', pictures: 1, media }
  fixture.list.mockResolvedValue({ ok: true, value: { entries: [header], next: '', notice: '' } })
  fixture.read.mockResolvedValue({ ok: true, value: { header, prompt: 'Look', events: [], state: 'done', incomplete: false } })
  fixture.media.mockResolvedValue({ ok: true, value: { base64: bytes.toString('base64'), mime: 'image/png', name: 'turn-fixture-picture-1.png', bytes: bytes.length, sha256 } })
  await act(async () => root.render(<TranscriptHistory />)); await click('Picture turn')
  expect(host.textContent).toContain('Preserved pictures'); expect(host.textContent).toContain('sha256 ' + sha256.slice(0, 16))
  await click('Save picture 1')
  expect(fixture.media).toHaveBeenCalledWith('fixture', 0)
  expect(host.textContent).toContain('exact copy the app kept')
  fixture.media.mockResolvedValue({ ok: true, value: { base64: bytes.toString('base64'), mime: 'image/png', name: 'turn-fixture-picture-1.png', bytes: bytes.length, sha256: 'f'.repeat(64) } })
  await click('Save picture 1')
  expect(host.textContent).toContain('does not match this record')
})
test('a refused preserved-picture read leaves the record visible and reports why', async () => {
  const header = { id: 'fixture', at: '2026-10-19T00:00:00Z', title: 'Missing picture', engine: 'agy' as const, model: '', workspace: '/work', pictures: 1, media: { files: [{ index: 0, mime: 'image/png' as const, bytes: 3, sha256: 'a'.repeat(64) }], bytes: 3 } }
  fixture.list.mockResolvedValue({ ok: true, value: { entries: [header], next: '', notice: '' } })
  fixture.read.mockResolvedValue({ ok: true, value: { header, prompt: 'Look', events: [], state: 'done', incomplete: false } })
  fixture.media.mockResolvedValue({ ok: false, error: 'The saved picture is missing. The record is unchanged.' })
  await act(async () => root.render(<TranscriptHistory />)); await click('Missing picture'); await click('Save picture 1')
  expect(host.textContent).toContain('The saved picture is missing')
  expect(host.textContent).toContain('Missing picture')
  expect([...host.querySelectorAll('button')].filter(b => b.textContent === 'Save picture 1')).toHaveLength(1)
})
test('late transcript reads cannot update an unmounted history view', async () => {
  let finish!: (value: unknown) => void
  fixture.list.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  await act(() => root.render(<TranscriptHistory />)); await act(() => root.render(<p>Another view</p>))
  await act(async () => finish({ ok: true, value: { entries: [{ id: 'x', title: 'Old response' }], next: '', notice: '' } }))
  expect(host.textContent).toBe('Another view')
})
