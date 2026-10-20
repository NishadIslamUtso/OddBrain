// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import SourceCheckPanel from '../src/renderer/src/ui/SourceCheckPanel'
const fixture = vi.hoisted(() => ({ preview: vi.fn(), decide: vi.fn(), read: vi.fn() }))
vi.mock('../src/renderer/src/platform/bridge', () => ({ bridge: { research: fixture } }))
let root: Root, host: HTMLDivElement
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks(); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(() => root.unmount()); host.remove() })
const click = async (text: string) => { const button = [...host.querySelectorAll('button')].find(entry => entry.textContent === text); expect(button, text).toBeTruthy(); await act(async () => button!.click()) }
const open = async (urls = ['https://example.com/a']) => { await act(() => root.render(<SourceCheckPanel />)); await act(async () => { window.dispatchEvent(new CustomEvent('app:check-sources', { detail: { transcriptId: 't', chatId: 'c', questionStart: 'Who said it', urls } })) }) }
const record = { id: '1', transcriptId: 't', chatId: 'c', at: '2026-10-20T05:00:00.000Z', questionStart: 'Who said it', entries: [{ url: 'https://example.com/a', checkedAt: '2026-10-20T05:00:00.000Z', state: 'retrieved', status: 200, finalUrl: 'https://example.com/a', mime: 'text/html', bytes: 16, sha256: 'a'.repeat(64), title: 'Example' }] }

test('opening the panel checks nothing and shows the exact links and the honest limit', async () => {
  fixture.read.mockResolvedValue({ records: [], notice: '' })
  await open()
  expect(fixture.read).toHaveBeenCalledWith('t')
  expect(fixture.preview).not.toHaveBeenCalled(); expect(fixture.decide).not.toHaveBeenCalled()
  expect(host.textContent).toContain('https://example.com/a')
  expect(host.textContent).toContain('not proof the model read the page')
  expect(host.textContent).toContain('Who said it')
})

test('a review shows the exact list and asks once; only Allow triggers the check', async () => {
  fixture.read.mockResolvedValue({ records: [], notice: '' })
  fixture.preview.mockResolvedValue({ token: 'tok', urls: ['https://example.com/a'], refused: [{ url: 'http://plain.example.com/', reason: 'Only https links are checked. Nothing was requested.' }], expiresAt: Date.now() + 120_000, explanation: 'OddBrain will open these exact https addresses once.' })
  fixture.decide.mockResolvedValue({ denied: false, record })
  await open()
  await click('Prepare source check')
  expect(fixture.preview).toHaveBeenCalledWith({ transcriptId: 't', chatId: 'c', questionStart: 'Who said it', urls: ['https://example.com/a'] })
  expect(host.textContent).toContain('OddBrain will open these exact https addresses once.')
  expect(host.textContent).toContain('http://plain.example.com/')
  expect(fixture.decide).not.toHaveBeenCalled()
  await click('Allow these checks once')
  expect(fixture.decide).toHaveBeenCalledWith('tok', 'allow')
  expect(host.textContent).toContain('HTTP 200')
  expect(host.textContent).toContain('a'.repeat(64))
  expect(host.textContent).toContain('Example')
  expect(host.textContent).toContain('not whether the page supports the answer')
})

test('denying never runs a check and says what was not done', async () => {
  fixture.read.mockResolvedValue({ records: [], notice: '' })
  fixture.preview.mockResolvedValue({ token: 'tok', urls: ['https://example.com/a'], refused: [], expiresAt: Date.now() + 120_000, explanation: 'Will fetch.' })
  fixture.decide.mockResolvedValue({ denied: true, answer: 'Source check denied. No address was requested.' })
  await open()
  await click('Prepare source check'); await click('Deny source check')
  expect(fixture.decide).toHaveBeenCalledWith('tok', 'deny')
  expect(host.textContent).toContain('No address was requested')
})

test('closing with an unreviewed token denies it and an expired review is reported', async () => {
  fixture.read.mockResolvedValue({ records: [], notice: '' })
  fixture.preview.mockResolvedValue({ token: 'tok', urls: ['https://example.com/a'], refused: [], expiresAt: Date.now() + 120_000, explanation: 'Will fetch.' })
  fixture.decide.mockRejectedValue(Error('That source check expired. Nothing was requested.'))
  await open(); await click('Prepare source check'); await click('Allow these checks once')
  expect(host.textContent).toContain('expired')
  fixture.decide.mockResolvedValue({ denied: true, answer: 'Denied.' })
  await click('Prepare source check'); await click('Close source checks')
  expect(fixture.decide).toHaveBeenLastCalledWith('tok', 'deny')
  expect(host.textContent).toBe('')
})

test('earlier receipts for the same record stay visible with their digests', async () => {
  fixture.read.mockResolvedValue({ records: [record], notice: '' })
  await open()
  expect(host.textContent).toContain('Earlier source checks for this record')
  expect(host.textContent).toContain('a'.repeat(64))
})
