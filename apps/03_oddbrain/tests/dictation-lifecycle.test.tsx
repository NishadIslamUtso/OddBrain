// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, beforeEach, test, expect, vi } from 'vitest'
import useDictation from '../src/renderer/src/hooks/useDictation'
import { DEFAULT_MEDIA } from '../src/shared/lib/mediaBridge'
const media = vi.hoisted(() => ({ read: vi.fn(), dictate: vi.fn(), authorizeRecording: vi.fn(), decode: vi.fn(), cancel: vi.fn(), onCancelled: vi.fn() }))
vi.mock('../src/renderer/src/platform/bridge', () => ({ bridge: { media }, isDemo: false }))
class Recording {
  static isTypeSupported() { return true }
  state = 'inactive'; ondataavailable?: (event: { data: NodeBlob }) => void; onstop?: () => void
  start() { this.state = 'recording' }
  stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new NodeBlob(['audio']) }); this.onstop?.() }
}
let root: Root, host: HTMLDivElement, controls: ReturnType<typeof useDictation>, cancelled: () => void
const changed = vi.fn(), trackStop = vi.fn(), getUserMedia = vi.fn()
function Harness() { controls = useDictation('Draft', changed); return null }
beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, Blob: NodeBlob, MediaRecorder: Recording })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: trackStop }] })
  media.read.mockResolvedValue({ ...DEFAULT_MEDIA, dictation: 'provider', transcriptionProvider: 'groq', transcriptionModel: 'exact-model' })
  media.authorizeRecording.mockResolvedValue({ ok: true }); media.decode.mockResolvedValue({ ok: true, text: 'recorded words' }); media.cancel.mockResolvedValue(undefined)
  media.onCancelled.mockImplementation(fn => { cancelled = fn; return () => {} })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(() => root.unmount()); host.remove() })
async function mount() { await act(() => root.render(<Harness />)) }

test('main authorization precedes microphone access; Stop uploads only to the displayed provider/model and appends to draft', async () => {
  await mount(); await act(async () => { await controls.toggle() })
  expect(media.authorizeRecording).toHaveBeenCalledWith({ provider: 'groq', model: 'exact-model' })
  expect(media.authorizeRecording.mock.invocationCallOrder[0]).toBeLessThan(getUserMedia.mock.invocationCallOrder[0])
  expect(media.decode).not.toHaveBeenCalled(); expect(controls.active).toBe(true)
  await act(async () => { await controls.toggle(); await new Promise(resolve => setTimeout(resolve, 0)) })
  expect(media.decode).toHaveBeenCalledTimes(1)
  expect(media.decode.mock.calls[0][0]).toMatchObject({ route: 'transcribe', expected: { provider: 'groq', model: 'exact-model' } })
  expect(changed).toHaveBeenCalledWith('Draft recorded words'); expect(trackStop).toHaveBeenCalled(); expect(controls.active).toBe(false)
})
test('Cancel and main-side permission revocation stop tracks without an upload', async () => {
  await mount(); await act(async () => { await controls.toggle() }); await act(() => controls.cancel())
  expect(media.decode).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled(); expect(trackStop).toHaveBeenCalled()
  await act(async () => { await controls.toggle() }); await act(() => cancelled())
  expect(media.decode).not.toHaveBeenCalled(); expect(controls.active).toBe(false)
})
test('late permission-dialog resolution after Cancel releases the microphone immediately', async () => {
  let grant!: (stream: unknown) => void
  getUserMedia.mockReturnValue(new Promise(resolve => { grant = resolve }))
  await mount(); let pending!: Promise<void>
  await act(async () => { pending = controls.toggle(); await Promise.resolve(); await Promise.resolve() })
  expect(getUserMedia).toHaveBeenCalledTimes(1)
  await act(() => controls.cancel())
  await act(async () => { grant({ getTracks: () => [{ stop: trackStop }] }); await pending })
  expect(trackStop).toHaveBeenCalled(); expect(media.decode).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled()
})
test('missing/disabled selection opens no microphone, and a late native transcript after cancellation is ignored', async () => {
  media.authorizeRecording.mockResolvedValue({ ok: false, error: 'Disabled provider' })
  await mount(); await act(async () => { await controls.toggle() }); expect(getUserMedia).not.toHaveBeenCalled()
  let finish!: (value: unknown) => void
  media.read.mockResolvedValue(DEFAULT_MEDIA); media.dictate.mockReturnValue(new Promise(resolve => { finish = resolve }))
  let pending!: Promise<void>
  await act(async () => { pending = controls.toggle(); await Promise.resolve() }); await act(() => controls.cancel())
  await act(async () => { finish({ ok: true, text: 'Late transcript' }); await pending })
  expect(changed).not.toHaveBeenCalled()
})
