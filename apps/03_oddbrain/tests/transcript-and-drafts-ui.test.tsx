// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import SavedDrafts from '../src/renderer/src/ui/SavedDrafts'
import TranscriptHistory from '../src/renderer/src/ui/TranscriptHistory'
import { draftStash } from '../src/shared/lib/draftStash'
const fixture = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn(), image: vi.fn() }))
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
  expect(host.textContent).toContain('interrupted'); expect(host.textContent).toContain('bytes were never retained')
  expect([...host.querySelectorAll('button')].some(b => /resume|run task/i.test(b.textContent || ''))).toBe(false)
})
test('retained transcript images require a matching main-process verification before download', async () => {
  const image = { id: 'image-1', mime: 'image/png' as const, bytes: 8, sha256: 'a'.repeat(64) }
  const header = { id: 'retained', at: '2026-10-19T00:00:00Z', title: 'Image task', engine: 'claude-code', model: '', workspace: '/work', pictures: 1, images: [image] }
  fixture.list.mockResolvedValue({ ok: true, value: { entries: [header], next: '', notice: '' } })
  fixture.read.mockResolvedValue({ ok: true, value: { header, prompt: 'Look', events: [{ kind: 'done', text: 'Seen' }], state: 'done', incomplete: false } })
  fixture.image.mockResolvedValue({ ok: true, value: { ...image, data: 'iVBORw0KGgo=', name: 'image.png', verified: true } })
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:verified'), revokeObjectURL: vi.fn() })
  const downloaded = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  await act(async () => root.render(<TranscriptHistory />)); await click('Image task'); await click('Download verified image-1')
  expect(fixture.image).toHaveBeenCalledWith('retained', 'image-1'); expect(downloaded).toHaveBeenCalledOnce(); downloaded.mockRestore()
  expect(host.textContent).toContain('passed its recorded SHA-256 and size checks')
})
test('late transcript reads cannot update an unmounted history view', async () => {
  let finish!: (value: unknown) => void
  fixture.list.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  await act(() => root.render(<TranscriptHistory />)); await act(() => root.render(<p>Another view</p>))
  await act(async () => finish({ ok: true, value: { entries: [{ id: 'x', title: 'Old response' }], next: '', notice: '' } }))
  expect(host.textContent).toBe('Another view')
})
