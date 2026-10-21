// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createVideoStudioService } from '../src/main/video/service'
import { NATIVE_KDENLIVE_REFERENCE, normalizeEditPlan } from '../src/main/video/nativeProtocol'
import type { KeyStore } from '../src/main/cloud/keys'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const keys = (): KeyStore => ({ encryption: 'os', has: () => false, persisted: () => false, get: () => '', set: () => {}, clear: () => {}, ids: () => [] })
const tools = ['desktop_capabilities', 'desktop_state', 'desktop_media_import', 'desktop_batch_validate', 'desktop_batch', 'desktop_history', 'desktop_undo', 'desktop_redo', 'desktop_frame_capture', 'desktop_preview_render', 'desktop_render_cancel']
const required: Record<string, string[]> = { desktop_media_import: ['sessionId', 'expectedRevision', 'requestId', 'path'], desktop_batch_validate: ['commands'], desktop_batch: ['sessionId', 'expectedRevision', 'requestId', 'commands'], desktop_undo: ['sessionId', 'expectedRevision', 'requestId'], desktop_redo: ['sessionId', 'expectedRevision', 'requestId'], desktop_frame_capture: ['position'], desktop_preview_render: ['sessionId', 'expectedRevision', 'requestId', 'path', 'start', 'end'], desktop_render_cancel: ['path'] }
const state = (revision: number) => ({ ok: true, sessionId: '35cd762c-8ccb-48c5-94e9-5ac72ed4a01d', revision, sequenceId: 'sequence-1', documentUrl: 'file:///D:/Edit/project.kdenlive', modified: true, profile: { width: 1080, height: 1920, description: 'Vertical HD' }, undo: { index: revision, canUndo: true, canRedo: false, undoText: 'Batch', redoText: '' }, counts: { tracks: 3, clips: 2 } })
const toolResult = (id: unknown, payload: unknown) => new Response(JSON.stringify({ jsonrpc: '2.0', id, result: { isError: false, structuredContent: { ok: true, data: payload }, content: [{ type: 'text', text: JSON.stringify({ ok: true, data: payload }) }] } }), { status: 200 })

test('native protocol identity is pinned before exact revision-checked batches can apply', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-native-plan-')); roots.push(root)
  const executable = join(root, 'kdenlive.exe'); writeFileSync(executable, 'fixture')
  const called: Array<{ name: string; args: any }> = []
  const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'))
    if (body.method === 'initialize') return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: NATIVE_KDENLIVE_REFERENCE.protocol, serverInfo: { name: NATIVE_KDENLIVE_REFERENCE.serverName, version: NATIVE_KDENLIVE_REFERENCE.serverVersion } } }), { status: 200, headers: { 'mcp-session-id': 'native-http-session' } })
    if (body.method === 'notifications/initialized') return new Response('', { status: 202 })
    if (body.method === 'tools/list') return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: tools.map(name => ({ name, inputSchema: { required: required[name] || [] } })) } }), { status: 200 })
    if (body.method === 'tools/call') {
      called.push({ name: body.params.name, args: body.params.arguments })
      if (body.params.name === 'desktop_state') return toolResult(body.id, state(7))
      if (body.params.name === 'desktop_batch_validate') return toolResult(body.id, { ok: true, valid: true, issues: [], sessionId: state(7).sessionId, revision: 7 })
      if (body.params.name === 'desktop_batch') return toolResult(body.id, { ok: true, state: state(8) })
      if (body.params.name === 'desktop_frame_capture') return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { isError: false, structuredContent: { ok: true, data: { ok: true, position: 42 } }, content: [{ type: 'text', text: JSON.stringify({ ok: true, data: { ok: true, position: 42 } }) }, { type: 'image', mimeType: 'image/png', data: Buffer.from('rendered-frame').toString('base64') }] } }), { status: 200 })
    }
    throw Error(`Unexpected ${body.method} ${body.params?.name || ''}`)
  }) as unknown as typeof fetch
  const service = createVideoStudioService({ file: join(root, 'settings.json'), keys, fetchImpl, runCommand: async () => Buffer.from('kdenlive 26') })
  service.setKdenlive(executable)
  const view = await service.testKdenlive()
  expect(view.nativeKdenlive).toMatchObject({ compatible: true, identity: 'kdenlive-native 1.0.0', referenceCommit: NATIVE_KDENLIVE_REFERENCE.commit })
  const plan = normalizeEditPlan({ title: 'Opening cut', purpose: 'Remove the dead opening after transcript review.', sourceEvidenceIds: ['evidence-1'], expectedProject: { documentUrl: state(7).documentUrl, sequenceId: state(7).sequenceId, revision: 7 }, commands: [{ type: 'split', clipId: 8, position: 25 }], assetNeeds: [], notes: 'One cut.' })
  const review = await service.prepareEditPlan(4, plan)
  expect(review).toMatchObject({ ok: true, validation: { valid: true }, project: { revision: 7 }, commandSummary: ['1. split · clipId=8, position=25'] })
  const answer = await service.decideEditPlan(4, review.token!, 'allow')
  expect(answer).toMatchObject({ ok: true, project: { revision: 8 } })
  expect(called.find(call => call.name === 'desktop_batch')?.args).toMatchObject({ sessionId: state(7).sessionId, expectedRevision: 7, commands: [{ type: 'split', clipId: 8, position: 25 }] })
  expect(called.find(call => call.name === 'desktop_batch')?.args.requestId).toMatch(/^[a-f0-9-]{36}$/)
  await expect(service.captureKdenliveFrame(42)).resolves.toMatchObject({ ok: true, position: 42, mime: 'image/png', data: Buffer.from('rendered-frame').toString('base64') })
})

test('review-only OddBrain MCP exposes selective evidence/library/plan tools and never an Apply tool', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-ai-video-mcp-')); roots.push(root)
  const service = createVideoStudioService({ file: join(root, 'settings.json'), keys })
  const initialized = await service.aiMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test' } } }, '')
  expect(initialized.status).toBe(200); expect(initialized.session).toBeTruthy()
  const listed = await service.aiMcp({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, initialized.session)
  const names = (listed.body as any).result.tools.map((tool: any) => tool.name)
  expect(names).toContain('oddbrain_video_evidence_expand')
  expect(names).toContain('oddbrain_creative_search')
  expect(names).toContain('oddbrain_edit_plan_propose')
  expect(names.some((name: string) => /apply|download/i.test(name))).toBe(false)
  const proposed = await service.aiMcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'oddbrain_edit_plan_propose', arguments: { plan: { title: 'Caption pass', purpose: 'Add reviewed captions.', expectedProject: { documentUrl: 'file:///project.kdenlive', sequenceId: 's', revision: 2 }, commands: [{ type: 'title_create', name: 'Caption 1', duration: 20, items: [{ text: 'Hello', x: 80, y: 800 }] }], sourceEvidenceIds: [], assetNeeds: [], notes: '' } } } }, initialized.session)
  expect((proposed.body as any).result.isError).toBe(false)
  expect((await service.workspace()).proposedPlan).toMatchObject({ title: 'Caption pass', commands: [{ type: 'title_create' }] })
})
