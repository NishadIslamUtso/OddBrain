// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { describePromptLayers, PROMPT_EXTRACTION_NOTE, PROMPT_RECITAL_ANSWER, type PromptLayerFacts } from '../src/shared/lib/promptLayers'
import PromptLayersSection from '../src/renderer/src/components/PromptLayersSection'

const facts = (over: Partial<PromptLayerFacts> = {}): PromptLayerFacts => ({
  engine: 'claude-code', workspace: '/work/project',
  houseRules: [
    { engine: 'claude-code', file: '/home/me/.claude/CLAUDE.md', present: true, digest: 'a'.repeat(64) },
    { engine: 'agy', file: '/home/me/.gemini/GEMINI.md', present: false, digest: '' },
  ],
  vaultSelected: true, historyMessages: 12, ...over,
})

test('every layer is named with its owner, and the engine’s own prompt is admitted as unshowable', () => {
  const layers = describePromptLayers(facts())
  expect(layers.map(layer => layer.id)).toEqual(['engine', 'house-rules', 'project', 'history', 'overrides', 'vault', 'attachments'])
  const engine = layers[0]
  expect(engine.ownership).toBe('engine'); expect(engine.visible).toBe(false)
  expect(engine.source).toContain('neither writes it nor stores a copy')
  // The house-rules layer shows a real digest of the file on disk, and says when there is none.
  expect(layers[1].source).toContain('/home/me/.claude/CLAUDE.md')
  expect(layers[1].source).toContain('aaaaaaaaaaaaaaaa…')
  expect(describePromptLayers(facts({ engine: 'agy' }))[1].source).toContain('not written yet')
  // Nothing claims a secret lives inside a prompt.
  expect(PROMPT_EXTRACTION_NOTE).toContain('no provider key')
  expect(PROMPT_EXTRACTION_NOTE).toContain('ever placed in a prompt')
  expect(PROMPT_RECITAL_ANSWER).toContain('Nothing in this app decides')
  expect(describePromptLayers(facts({ vaultSelected: false }))[5].source).toContain('No vault folder')
  expect(describePromptLayers(facts({ workspace: '' }))[2].source).toContain('No working folder')
})

let root: Root, host: HTMLDivElement
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.restoreAllMocks() })

test('the settings panel reads main-process facts and states the limit plainly', async () => {
  const promptLayers = vi.fn(async () => facts())
  vi.doMock('../src/renderer/src/platform/bridge', () => ({ bridge: { promptLayers } }))
  vi.resetModules()
  const { default: Section } = await import('../src/renderer/src/components/PromptLayersSection')
  await act(async () => root.render(<Section historyMessages={4} />))
  expect(promptLayers).toHaveBeenCalledWith(4)
  expect(host.textContent).toContain('Engine system prompt')
  expect(host.textContent).toContain('Not shown here because this app does not hold it')
  expect(host.textContent).toContain('no provider key')
  expect(host.textContent).toContain('Keys are held by the main process')
  expect(host.textContent).toContain('Nothing in this app decides')
})

test('a failed read leaves the panel honest instead of inventing layers', async () => {
  vi.doMock('../src/renderer/src/platform/bridge', () => ({ bridge: { promptLayers: async () => { throw Error('main process unreachable') } } }))
  vi.resetModules()
  const { default: Section } = await import('../src/renderer/src/components/PromptLayersSection')
  await act(async () => root.render(<Section />))
  expect(host.textContent).toContain('main process unreachable')
  expect(host.textContent).not.toContain('/home/me/.claude/CLAUDE.md')
  expect(host.textContent).not.toContain('sha256')
})
