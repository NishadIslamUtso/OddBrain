// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test } from 'vitest'
import VideoStudioView from '../src/renderer/src/components/VideoStudioView'
import VideoStudioSettings from '../src/renderer/src/components/VideoStudioSettings'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let host: HTMLDivElement, root: Root
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove() })

test('Video Studio keeps editor authority and approvals visible without cluttering normal chat', async () => {
  await act(async () => { root.render(<VideoStudioView onSettings={() => {}} onChat={() => {}} />); await Promise.resolve() })
  expect(host.textContent).toContain('Kdenlive alone owns the timeline')
  expect(host.textContent).toContain('Creative Library')
  expect(host.textContent).toContain('only your exact approved selection is downloaded')
  expect(host.textContent).toContain('Local reusable kit')
  expect(host.textContent).toContain('Reels/Shorts')
  expect(host.textContent).toContain('automatically enters the same local evidence reader')
  expect(host.textContent).toContain('cannot bypass your Apply review')
})

test('Kdenlive settings name loopback, protected-token, provider and OCR boundaries', async () => {
  await act(async () => { root.render(<VideoStudioSettings />); await Promise.resolve() })
  expect(host.textContent).toContain('Kdenlive owns the real timeline')
  expect(host.textContent).toContain('Public or LAN MCP addresses are refused')
  expect(host.textContent).toContain('Optional bearer token')
  expect(host.textContent).toContain('Pexels and paid catalogues are not silently substituted')
  expect(host.textContent).toContain('No second OCR setting is added')
})
