// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, test, expect, vi } from 'vitest'
import useMediaAttachments from '../src/renderer/src/hooks/useMediaAttachments'
import type { Attachment } from '../src/shared/types'
import { DEFAULT_MEDIA } from '../src/shared/lib/mediaBridge'
import { originalSourceFiles } from '../src/shared/lib/attachments'
const media = vi.hoisted(() => ({ read: vi.fn(), decode: vi.fn(), decodeFile: vi.fn(), releaseSource: vi.fn(), cancel: vi.fn() }))
vi.mock('../src/renderer/src/platform/bridge', () => ({ bridge: { media }, isDemo: false }))
let host: HTMLDivElement, root: Root, controls: ReturnType<typeof useMediaAttachments>, attached: Attachment[]
const notice = vi.fn()
function Harness() { const [files, setFiles] = useState<Attachment[]>([]); attached = files; controls = useMediaAttachments(files, setFiles, notice); return <>{controls.controls}</> }
const file = (read = async () => new TextEncoder().encode('source words').buffer) => ({ name: 'notes.txt', type: 'text/plain', size: 12, arrayBuffer: read }) as File
beforeEach(async () => {
  vi.clearAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  media.read.mockResolvedValue({ ...DEFAULT_MEDIA, provider: 'openai', model: 'shown-model' })
  media.decode.mockResolvedValue({ ok: true, name: 'notes.txt', text: 'extracted words', disclosure: 'Local fixture.' }); media.decodeFile.mockResolvedValue({ ok: true, name: 'notes.txt', text: 'extracted words', disclosure: 'Local fixture.', source: { handle: 'a'.repeat(36), sha256: 'b'.repeat(64), bytes: 12, storage: 'in-place', consequence: 'fixture' } }); media.releaseSource.mockResolvedValue(undefined); media.cancel.mockResolvedValue(undefined)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); await act(async () => { root.render(<Harness />) })
})
afterEach(async () => { await act(() => root.unmount()); host.remove() })
const button = (name: string) => [...host.querySelectorAll('button')].find(b => b.textContent === name)!

test('cancelling streamed desktop processing prevents a late result from attaching and releases its handle', async () => {
  let resolve!: (result: any) => void, pending!: Promise<void>
  media.decodeFile.mockImplementation(() => new Promise(done => { resolve = done }))
  await act(async () => { pending = controls.addFiles([file()]); await Promise.resolve() })
  await act(() => button('Cancel file processing').click())
  await act(async () => { resolve({ ok: true, name: 'notes.txt', text: 'late', disclosure: 'late', source: { handle: 'c'.repeat(36), sha256: 'd'.repeat(64), bytes: 12, storage: 'in-place', consequence: 'fixture' } }); await pending })
  expect(media.decodeFile).toHaveBeenCalledOnce(); expect(media.releaseSource).toHaveBeenCalledWith('c'.repeat(36)); expect(attached).toEqual([]); expect(host.textContent).toContain('Original file retained')
})
test('failed explicit upload keeps the original and old extraction, and binds to the label the user clicked', async () => {
  await act(async () => { await controls.addFiles([file()]) })
  expect(attached[0].text).toBe('extracted words'); expect(attached[0].originalFile).toBeDefined(); expect(attached[0].originalId).toBeTruthy()
  media.read.mockResolvedValue({ ...DEFAULT_MEDIA, provider: 'openai', model: 'new-model' })
  media.decodeFile.mockResolvedValue({ ok: false, name: 'notes.txt', error: 'Selection changed; nothing sent.' })
  await act(async () => { button('Upload to openai / shown-model').click(); await new Promise(resolve => setTimeout(resolve, 0)) })
  expect(media.decodeFile.mock.calls[1][1].expected).toEqual({ provider: 'openai', model: 'shown-model' })
  expect(attached[0].text).toBe('extracted words'); expect(host.textContent).toContain('Previous extraction is still attached')
  expect(button('Retry locally')).toBeDefined(); expect(button('Upload to openai / new-model')).toBeDefined()
})
test('a handled derived frame retains the exact original source name and MIME', async () => {
  const original = new File(['video'], 'meeting.mp4', { type: 'video/mp4' })
  const files = await originalSourceFiles([{ id: 'frame', name: 'meeting-00:10.jpg', kind: 'image', mime: 'image/jpeg', size: 5, originalId: 'source-one', originalFile: original, originalSource: { handle: 'a'.repeat(36), sha256: 'b'.repeat(64), bytes: 5, storage: 'in-place', consequence: 'fixture' } }])
  expect(files[0]).toMatchObject({ name: 'meeting.mp4', mime: 'video/mp4' })
})
test('saving voice/file preferences updates available explicit upload choices without reimporting', async () => {
  await act(async () => { await controls.addFiles([file()]) })
  media.read.mockResolvedValue({ ...DEFAULT_MEDIA, provider: 'gemini', model: 'newly-chosen' })
  await act(async () => { window.dispatchEvent(new Event('app:media-settings-changed')); await Promise.resolve() })
  expect(button('Upload to gemini / newly-chosen')).toBeDefined(); expect(media.decodeFile).toHaveBeenCalledTimes(1)
})
