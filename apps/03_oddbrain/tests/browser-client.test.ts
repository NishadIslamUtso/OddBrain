// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createBrowserClient } from '../src/renderer/src/data/client'
import { emptyWorkspace, newProject } from '../src/shared/workspace'

const key = 'oddbrain-ui-first:v1'
beforeEach(() => localStorage.clear())

describe('browser preview adapter', () => {
  it('keeps honest browser-only data and rejects stale writes', async () => {
    const api = createBrowserClient(localStorage)
    expect(await api.workspace.read()).toMatchObject({
      ok: true,
      revision: 0,
      location: expect.stringContaining('browser only'),
    })
    const data = newProject(emptyWorkspace(), 'project1', 'Local only', new Date().toISOString())
    expect(await api.workspace.write(data, 0)).toMatchObject({ ok: true, revision: 1 })
    expect(await api.workspace.write(emptyWorkspace(), 0)).toMatchObject({
      ok: false,
      error: expect.stringContaining('changed in another tab'),
    })
    expect(await api.workspace.read()).toMatchObject({ ok: true, revision: 1, data })
  })

  it('protects a corrupted browser record rather than replacing it', async () => {
    localStorage.setItem(key, '{invalid')
    const api = createBrowserClient(localStorage)
    expect(await api.workspace.read()).toMatchObject({
      ok: false,
      error: expect.stringContaining('not replaced'),
    })
    expect(await api.workspace.write(emptyWorkspace(), 0)).toMatchObject({ ok: false })
    expect(localStorage.getItem(key)).toBe('{invalid')
    localStorage.setItem(key, JSON.stringify({ revision: -1, data: emptyWorkspace() }))
    expect(await api.workspace.read()).toMatchObject({
      ok: false,
      error: expect.stringContaining('header'),
    })
  })

  it('cannot pretend to choose, list or read a machine vault', async () => {
    const api = createBrowserClient(localStorage)
    expect(await api.vault.choose()).toMatchObject({
      ok: false,
      error: expect.stringContaining('installed desktop app'),
    })
    expect(await api.vault.list()).toMatchObject({ ok: false })
    expect(await api.vault.read('hello.md')).toMatchObject({ ok: false })
  })
})
