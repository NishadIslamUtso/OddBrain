// @vitest-environment jsdom
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Chat, Message } from '../src/shared/types'
import type { ArtifactSummary } from '../src/main/artifacts/store'
import type { Project } from '../src/shared/lib/projects'
import { bridge } from '../src/renderer/src/platform/bridge'
import MessageRow from '../src/renderer/src/components/MessageRow'
import { LookContext } from '../src/renderer/src/ui/LookContext'
import { DEFAULT_LOOK } from '../src/renderer/src/state/look'
import CopyText from '../src/renderer/src/ui/CopyText'
import ProjectsView from '../src/renderer/src/components/ProjectsView'
import ArtifactsView from '../src/renderer/src/components/ArtifactsView'

let container: HTMLDivElement, root: Root
beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.restoreAllMocks()
  delete (navigator as { clipboard?: unknown }).clipboard
})

const press = async (element: Element | null): Promise<void> => {
  expect(element).not.toBeNull()
  await act(async () => { (element as HTMLElement).click() })
}
const type = async (input: HTMLInputElement | null, value: string): Promise<void> => {
  expect(input).not.toBeNull()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
    input!.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

test('final-only hides only live answer/thinking; the completed text still appears', () => {
  const reply: Message = { id: 'reply', role: 'assistant', status: 'streaming', content: 'Part of the reply', thinking: 'Private working text', model: 'qwen2.5-coder:3b' }
  const show = (message: Message, finalOnly: boolean): string => renderToStaticMarkup(
    h(LookContext.Provider, { value: { ...DEFAULT_LOOK, streamReplies: !finalOnly } },
      h(MessageRow, { message, onRewrite: async () => false, onRestore: () => undefined }))
  )
  const withheld = show(reply, true)
  expect(withheld).toContain('Reply in progress')
  expect(withheld).not.toContain('Part of the reply')
  expect(withheld).not.toContain('Private working text')
  expect(show(reply, false)).toContain('Part of the reply')
  expect(show({ ...reply, status: 'complete' }, true)).toContain('Part of the reply')
})

test('individual message, saved text source, context, and finished reply have their own copy controls', () => {
  const render = (message: Message): string => renderToStaticMarkup(h(MessageRow, {
    message, onRewrite: async () => false, onRestore: () => undefined,
  }))
  const user: Message = {
    id: 'question', role: 'user', content: 'Question text', context: 'Vault excerpt',
    attachments: [{ id: 'source', name: 'notes.md', kind: 'text', text: 'Exact note' }],
  }
  const question = render(user)
  expect(question).toContain('aria-label="Copy message"')
  expect(question).toContain('aria-label="Copy source context"')
  expect(question).toContain('aria-label="Copy notes.md"')
  expect(render({ id: 'answer', role: 'assistant', status: 'complete', content: 'Final answer' })).toContain('aria-label="Copy reply"')
  expect(render({ id: 'answer', role: 'assistant', status: 'streaming', content: 'Partial' })).not.toContain('aria-label="Copy reply"')
})

test('clipboard refusal never says Copied and offers selectable original text', async () => {
  let write = vi.fn().mockRejectedValue(Error('clipboard denied'))
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (...args: unknown[]) => write(...args) } })
  await act(async () => { root.render(h(CopyText, { text: 'Original text', label: 'Copy this turn' })) })
  await press(container.querySelector('button'))
  expect(write).toHaveBeenCalledWith('Original text')
  expect(container.textContent).toContain('Clipboard blocked')
  expect(container.textContent).not.toContain('Copied')
  expect(container.querySelector('textarea')?.value).toBe('Original text')
  write = vi.fn().mockResolvedValue(undefined)
  await press(container.querySelector('button'))
  expect(container.textContent).toContain('Copied')
  expect(container.querySelector('textarea')).toBeNull()
  write = vi.fn().mockRejectedValue(Error('clipboard revoked'))
  await press(container.querySelector('button'))
  expect(container.textContent).not.toContain('Copied')
  expect(container.querySelector('textarea')?.value).toBe('Original text')
})

test('editing a project name sends the changed name through the existing project persistence door', async () => {
  const project: Project = { id: 'abcdef123456', name: 'Original', instruction: '', folder: '', createdAt: '2026-10-18T00:00:00.000Z' }
  const writes: Project[][] = []
  vi.spyOn(bridge.projects, 'read').mockResolvedValue([project])
  vi.spyOn(bridge.projects, 'write').mockImplementation(async projects => { writes.push(projects); return { ok: true, projects } })
  vi.spyOn(bridge.engine, 'sessions').mockResolvedValue([])
  const chats: Chat[] = []
  await act(async () => { root.render(h(ProjectsView, { chats, onOpenChat: () => undefined, onNewChatInProject: () => undefined, onWorkHere: () => undefined, onViewBoard: () => undefined })) })
  expect(container.textContent).toContain('Original')
  await press(container.querySelector('[title="Edit project name, instruction and folder"]'))
  await type(container.querySelector('input[aria-label="Project name"]'), 'Renamed project')
  await press([...container.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Save') || null)
  expect(writes.at(-1)?.[0].name).toBe('Renamed project')
  expect(container.textContent).toContain('Renamed project')
})

test('artifact type/search/sort controls use real items and Trash recovery is an explicit desktop request', async () => {
  const common = { createdAt: '2026-10-18T00:00:00.000Z', updatedAt: '2026-10-18T00:00:00.000Z', origin: 'import' as const, current: 0, versionCount: 1, bytes: 12 }
  const items: ArtifactSummary[] = [
    { ...common, id: 'alpha', title: 'Alpha', type: 'html', updatedAt: '2026-10-17T00:00:00.000Z' },
    { ...common, id: 'beta', title: 'Beta', type: 'svg' },
  ]
  const trash = vi.spyOn(bridge.artifacts, 'trashList').mockResolvedValue({ ok: true, items: [] })
  vi.spyOn(bridge.artifacts, 'read').mockResolvedValue({ ok: false, error: 'Test preview unavailable.' })
  function Harness() {
    const [query, setQuery] = useState('')
    return h(ArtifactsView, { items, loading: false, error: '', where: '', query, onQueryChange: setQuery,
      onRename: async () => ({ ok: false }), onDuplicate: async () => ({ ok: false }), onRemove: async () => ({ ok: false }),
      onRestore: async () => ({ ok: false }), onImport: async () => ({ ok: false }), onOpenInChat: () => undefined })
  }
  await act(async () => { root.render(h(Harness)) })
  const visibleOrder = (): string[] => [...container.querySelectorAll('ul.grid button[aria-label^="Open "]')].map(button => button.getAttribute('aria-label') || '')
  expect(visibleOrder()).toEqual(['Open Beta', 'Open Alpha'])
  const sort = container.querySelector<HTMLSelectElement>('select[aria-label="Artifact sort"]')
  expect(sort).not.toBeNull()
  await act(async () => { sort!.value = 'name'; sort!.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(visibleOrder()).toEqual(['Open Alpha', 'Open Beta'])
  await press([...container.querySelectorAll('[aria-label="Artifact type"] button')].find(button => button.textContent === 'SVG') || null)
  expect(container.querySelector('[aria-label="Open Alpha"]')).toBeNull()
  expect(container.querySelector('[aria-label="Open Beta"]')).not.toBeNull()
  await type(container.querySelector('input[aria-label="Search artifact library"]'), 'not here')
  expect(container.querySelector('[aria-label="Open Beta"]')).toBeNull()
  await press([...container.querySelectorAll('button')].find(button => button.textContent === 'View trash') || null)
  expect(trash).toHaveBeenCalledOnce()
  expect(container.querySelector('[role="dialog"][aria-label="Artifact trash"]')).not.toBeNull()
})
