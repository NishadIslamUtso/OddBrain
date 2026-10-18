// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { bridge, getEngineApi } from '../src/renderer/src/platform/bridge'
import { installSampleBridge } from '../src/renderer/src/platform/sampleBridge'
import { captureSamplePage, getSampleFiles, prepareSamples, readSample, resetSamples, sampleEnabled, sampleLinks, sampleProjects, sampleVaultReply, SAMPLE_MODE_KEY, SAMPLE_PREFIX, setSampleMode, workspaceKey } from '../src/shared/lib/sampleWorkspace'
import type { Chat } from '../src/shared/types'
import type { EngineEvent } from '../src/shared/lib/engine'
import { vaultGet, vaultPost } from '../src/shared/lib/vault'

beforeEach(() => { delete window.api; localStorage.clear(); vi.useFakeTimers() })
afterEach(() => { delete window.api; vi.useRealTimers(); vi.restoreAllMocks() })
function start() { prepareSamples(); installSampleBridge(bridge, getEngineApi()); return getEngineApi() }

test('samples are namespaced, disabled by a real preload, and reset without touching other work or appearance', () => {
  localStorage.setItem('ai-assistant.chats', '["private"]'); localStorage.setItem('oddbrain.look.v2', '{"palette":"sage"}')
  start(); expect(sampleEnabled()).toBe(true); expect(workspaceKey('ai-assistant.chats')).toBe(SAMPLE_PREFIX + 'ai-assistant.chats')
  expect(readSample<Chat[]>('ai-assistant.chats', [])).toHaveLength(4)
  resetSamples(); expect(localStorage.getItem('ai-assistant.chats')).toBe('["private"]'); expect(localStorage.getItem('oddbrain.look.v2')).toBe('{"palette":"sage"}')
  expect(localStorage.getItem(SAMPLE_PREFIX + 'ai-assistant.chats')).toBeNull()
  window.api = {} as NonNullable<Window['api']>
  expect(sampleEnabled()).toBe(false); expect(workspaceKey('ai-assistant.chats')).toBe('ai-assistant.chats')
  expect(() => setSampleMode(true)).toThrow('browser-preview only'); expect(() => resetSamples()).toThrow('browser-preview only')
})
test('opting out is sticky and sample chats are not re-seeded over edits', () => {
  localStorage.setItem(SAMPLE_MODE_KEY, 'off'); prepareSamples(); expect(sampleEnabled()).toBe(false)
  setSampleMode(true); prepareSamples(); localStorage.setItem(SAMPLE_PREFIX + 'ai-assistant.chats', '[]'); prepareSamples()
  expect(readSample('ai-assistant.chats', [1])).toEqual([])
})
test('vault reads, search, source filters and simulated capture remain local', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch'); start()
  expect((await vaultGet('/files')).files).toHaveLength(21)
  expect((await vaultGet('/file?path=Memory%2FPreferences.md')).content).toContain('concise explanations')
  expect((await vaultGet('/file?path=..%2Fsecret')).ok).toBe(false)
  expect((await vaultGet('/grep?q=workshop')).hits.length).toBeGreaterThan(0)
  captureSamplePage(); expect(getSampleFiles()['Inbox/Sample extension capture.md']).toContain('No extension connected')
  const reply = sampleVaultReply('/sources?kind=page&q=capture'); expect(reply.entries).toHaveLength(1)
  await expect(vaultPost('/capture', { text: 'private' })).rejects.toThrow('not simulated')
  expect(fetch).not.toHaveBeenCalled()
})
test('all graph edges resolve to actual sample note paths; projects have matching chats', () => {
  start(); const files = getSampleFiles(), links = sampleLinks()
  expect(links.edges.length).toBeGreaterThan(20); expect(links.dead).toEqual([])
  for (const edge of links.edges) { expect(files[edge.from]).toBeDefined(); expect(files[edge.to]).toBeDefined() }
  const chats = readSample<Chat[]>('ai-assistant.chats', [])
  for (const project of sampleProjects()) expect(chats.some(chat => chat.projectId === project.id)).toBe(true)
})
test('sample project edits and artifact versions/rename/duplicate/trash/restore are functional', async () => {
  start(); const projects = await bridge.projects.read(); projects[0].name = 'Edited sample'; await bridge.projects.write(projects); expect((await bridge.projects.read())[0].name).toBe('Edited sample')
  const list = await bridge.artifacts.list(); expect(list.ok && list.items.length).toBe(3)
  const first = await bridge.artifacts.read('sample-checklist', 0), current = await bridge.artifacts.read('sample-checklist')
  expect(first.ok && current.ok && first.content !== current.content).toBe(true)
  expect((await bridge.artifacts.rename('sample-checklist', 'Edited checklist')).ok).toBe(true)
  const copy = await bridge.artifacts.duplicate('sample-checklist'); expect(copy.ok).toBe(true)
  if (!copy.ok) return
  expect((await bridge.artifacts.remove(copy.item.id)).ok).toBe(true)
  expect((await bridge.artifacts.trashList()).items).toHaveLength(1)
  expect((await bridge.artifacts.trashRestore(copy.item.id)).ok).toBe(true)
})
test('sample engine approval writes only sample storage; deny and stop do not write', async () => {
  const engine = start(), events: EngineEvent[] = [], off = engine.onEvent(event => events.push(event))
  await engine.send('Please demonstrate', ''); await vi.advanceTimersByTimeAsync(1100)
  expect(events.some(e => e.kind === 'permission')).toBe(true); expect(getSampleFiles()['Inbox/Sample task.md']).toBeUndefined()
  await engine.answer('sample-permission', false); expect(getSampleFiles()['Inbox/Sample task.md']).toBeUndefined()
  await engine.send('Again', ''); await vi.advanceTimersByTimeAsync(1100); await engine.answer('sample-permission', true)
  expect(getSampleFiles()['Inbox/Sample task.md']).toContain('simulated write')
  events.length = 0; await engine.send('Stop this', ''); await engine.stop(); await vi.advanceTimersByTimeAsync(2000)
  expect(events.map(e => e.kind)).toEqual(['closed']); off()
})
test('unimplemented capabilities still refuse rather than downloading, recording, signing in or launching anything', async () => {
  const engine = start()
  expect((await engine.pickBinary('agy')).ok).toBe(false); expect((await engine.downloads.execute('ollama')).ok).toBe(false)
  expect((await bridge.quick.open()).ok).toBe(false); expect((await bridge.extension.status()).listening).toBe(false)
  expect((await bridge.media.authorizeRecording()).ok).toBe(false)
  expect((await engine.send('Read picture', '', [{ mime: 'image/png', data: 'fake' }])).ok).toBe(false)
})
