// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createVideoStudioService } from '../src/main/video/service'
import type { KeyStore } from '../src/main/cloud/keys'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const keys = (): KeyStore => ({ encryption: 'os', has: () => false, persisted: () => false, get: () => '', set: () => {}, clear: () => {}, ids: () => [] })

test('recognized no-input Kdenlive Undo is separately reviewed and used once', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-video-action-')); roots.push(root)
  const executable = join(root, 'kdenlive.exe'); writeFileSync(executable, 'fixture')
  const calls: string[] = []
  const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}')); calls.push(body.method)
    if (body.method === 'initialize') return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {} }), { status: 200, headers: { 'mcp-session-id': 'session-undo' } })
    if (body.method === 'notifications/initialized') return new Response('', { status: 202 })
    if (body.method === 'tools/list') return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'desktop_timeline_undo', inputSchema: { properties: {} } }] } }), { status: 200 })
    if (body.method === 'tools/call') {
      expect(body.params).toEqual({ name: 'desktop_timeline_undo', arguments: {} })
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'undone' }] } }), { status: 200 })
    }
    throw Error(`Unexpected ${body.method}`)
  }) as unknown as typeof fetch
  const service = createVideoStudioService({ file: join(root, 'settings.json'), keys, fetchImpl, runCommand: async () => Buffer.from('kdenlive 26') })
  service.setKdenlive(executable)
  const review = await service.prepareKdenliveAction(9, 'undo')
  expect(review).toMatchObject({ ok: true, tool: 'desktop_timeline_undo' })
  const applied = await service.decideKdenliveAction(9, review.token!, 'allow')
  expect(applied).toEqual({ ok: true, answer: 'Kdenlive reported that the reviewed Undo completed.' })
  await expect(service.decideKdenliveAction(9, review.token!, 'allow')).resolves.toMatchObject({ ok: false })
  expect(calls).toContain('tools/call')
})

test('reviewed local design kit creates reusable source assets and a hash manifest without downloads', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-video-kit-')); roots.push(root); const project = join(root, 'project'); mkdirSync(project)
  const service = createVideoStudioService({ file: join(root, 'settings.json'), keys })
  service.setProjectFolder(project)
  const review = await service.prepareDesignKit(14, 'vertical')
  expect(review).toMatchObject({ ok: true, files: ['title-card.svg', 'lower-third.svg', 'accent-shapes.svg', 'gradient-overlay.svg', 'captions-bold.ass', 'captions-clean.ass', 'soft-warm.cube', 'kdenlive-recipes.json', 'README.md', 'manifest.json'] })
  const created = await service.decideDesignKit(14, review.token!, 'allow', false)
  expect(created).toMatchObject({ ok: true, imported: false })
  expect(readdirSync(created.path!).sort()).toEqual(['README.md', 'accent-shapes.svg', 'captions-bold.ass', 'captions-clean.ass', 'gradient-overlay.svg', 'kdenlive-recipes.json', 'lower-third.svg', 'manifest.json', 'soft-warm.cube', 'title-card.svg'])
  const manifest = JSON.parse(readFileSync(created.receipt!, 'utf8'))
  expect(manifest.files).toHaveLength(9); expect(manifest.files.every((file: any) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true)
  expect(readFileSync(join(created.path!, 'README.md'), 'utf8')).toContain('Kdenlive remains responsible')
})

test('server-specific version tools are refused rather than guessed', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-video-action-')); roots.push(root)
  const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'))
    if (body.method === 'initialize') return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: {} }), { status: 200 })
    if (body.method === 'notifications/initialized') return new Response('', { status: 202 })
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'checkpoint_save', inputSchema: { required: ['label'], properties: { label: { type: 'string' } } } }] } }), { status: 200 })
  }) as unknown as typeof fetch
  const service = createVideoStudioService({ file: join(root, 'settings.json'), keys, fetchImpl })
  await expect(service.prepareKdenliveAction(4, 'save-version')).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/will not guess/i) })
})
