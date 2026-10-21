// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { adaptiveFramePoints, classifyVideoUrl, normalizeMcpUrl, normalizeVideoStudio, parseSceneMetadata } from '../src/shared/lib/videoStudio'
import { createVideoStudioService } from '../src/main/video/service'
import type { KeyStore } from '../src/main/cloud/keys'

const roots: string[] = []
const folder = (): string => { const value = mkdtempSync(join(tmpdir(), 'oddbrain-video-studio-')); roots.push(value); return value }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function keys(values: Record<string, string> = {}): KeyStore {
  return { encryption: 'os', has: id => !!values[id], persisted: id => !!values[id], get: id => values[id] || '', set: (id, value) => { values[id] = value }, clear: id => { delete values[id] }, ids: () => Object.keys(values) }
}

test('video settings accept only a loopback MCP endpoint and preserve explicit executable paths', () => {
  expect(normalizeMcpUrl('https://remote.example/mcp')).toBe('http://127.0.0.1:8766/mcp')
  expect(normalizeMcpUrl('http://localhost:9911/mcp')).toBe('http://localhost:9911/mcp')
  expect(normalizeVideoStudio({ kdenlive: ' C:\\Kdenlive\\kdenlive.exe ', projectFolder: 'D:\\Edit', ytDlp: 'yt-dlp.exe', mcpUrl: 'http://127.0.0.1:9000/mcp' })).toMatchObject({ kdenlive: 'C:\\Kdenlive\\kdenlive.exe', projectFolder: 'D:\\Edit', ytDlp: 'yt-dlp.exe' })
})

test('video service refuses a non-loopback MCP setting instead of silently substituting it', async () => {
  const root = folder(), service = createVideoStudioService({ file: join(root, 'video.json'), keys: () => keys() })
  await expect(service.update({ mcpUrl: 'https://remote.example/mcp' })).rejects.toThrow(/loopback/i)
  expect((await service.read()).preferences.mcpUrl).toBe('http://127.0.0.1:8766/mcp')
})

test('adaptive evidence favors separated scene changes and scene metadata is bounded', () => {
  const parsed = parseSceneMetadata('frame:1 pts_time=10\nlavfi.scene_score=0.91\nframe:2 pts_time=40\nlavfi.scene_score=0.72')
  expect(parsed).toEqual([{ at: 10, score: 0.91 }, { at: 40, score: 0.72 }])
  const planned = adaptiveFramePoints(120, parsed, 3)
  expect(planned).toHaveLength(3)
  expect(planned.some(point => point.at === 10 && point.reason === 'scene-change')).toBe(true)
  expect(planned.some(point => point.at === 40 && point.reason === 'scene-change')).toBe(true)
  expect(planned).toEqual([...planned].sort((a, b) => a.at - b.at))
})

test('video links classify supported public sources and refuse embedded credentials', () => {
  expect(classifyVideoUrl('https://youtu.be/example')).toMatchObject({ ok: true, provider: 'youtube' })
  expect(classifyVideoUrl('https://cdn.example/movie.mp4')).toMatchObject({ ok: true, provider: 'direct-media' })
  expect(classifyVideoUrl('https://user:pass@example.com/movie.mp4')).toMatchObject({ ok: false })
  expect(classifyVideoUrl('http://example.com/movie.mp4')).toMatchObject({ ok: false })
})

test('video acquisition refuses linked project subfolders', async () => {
  const root = folder(), project = join(root, 'project'), outside = join(root, 'outside'); mkdirSync(project); mkdirSync(outside); symlinkSync(outside, join(project, 'OddBrain Sources'), 'junction')
  const fetchImpl = vi.fn(async () => new Response(null, { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': '12' } })) as unknown as typeof fetch
  const service = createVideoStudioService({ file: join(root, 'video.json'), keys: () => keys(), fetchImpl, assertRemote: async () => {} })
  service.setProjectFolder(project)
  const review = await service.preflightUrl(3, 'https://media.example/example.mp4')
  expect(review.ok).toBe(true)
  await expect(service.acquireUrl(3, review.token!, 'allow', false)).resolves.toMatchObject({ ok: false, answer: expect.stringMatching(/not a normal folder/i) })
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})

test('Kdenlive verification initializes loopback MCP and reports its real tools', async () => {
  const root = folder(), executable = join(root, 'kdenlive.exe'); writeFileSync(executable, 'fixture')
  const calls: string[] = []
  const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}')); calls.push(body.method)
    if (body.method === 'initialize') return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18' } }), { status: 200, headers: { 'content-type': 'application/json', 'mcp-session-id': 'session-1' } })
    if (body.method === 'notifications/initialized') return new Response('', { status: 202 })
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'desktop_media_import' }, { name: 'desktop_clip_insert' }] } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
  const service = createVideoStudioService({ file: join(root, 'video.json'), keys: () => keys(), fetchImpl, runCommand: async () => Buffer.from('kdenlive 26.08.2') })
  service.setKdenlive(executable)
  const view = await service.testKdenlive()
  expect(view).toMatchObject({ kdenliveReady: true, kdenliveVersion: 'kdenlive 26.08.2', mcpConnected: true, mcpTools: ['desktop_media_import', 'desktop_clip_insert'] })
  expect(calls).toEqual(['initialize', 'notifications/initialized', 'tools/list'])
})

test('Creative Library returns live provenance without downloading catalogue items', async () => {
  const root = folder(), requested: string[] = []
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = String(input); requested.push(url)
    if (url.includes('api.openverse.org')) return new Response(JSON.stringify({ results: [{ id: 'ov-1', title: 'Calm sky', creator: 'A Creator', license: 'by', license_version: '4.0', license_url: 'https://creativecommons.org/licenses/by/4.0/', foreign_landing_url: 'https://source.example/work', thumbnail: 'https://media.example/thumb.jpg', url: 'https://media.example/full.jpg', width: 1000, height: 600 }] }), { status: 200 })
    if (url.includes('commons.wikimedia.org')) return new Response(JSON.stringify({ query: { pages: { one: { pageid: 12, title: 'File:Cloud.jpg', imageinfo: [{ url: 'https://upload.wikimedia.org/cloud.jpg', thumburl: 'https://upload.wikimedia.org/thumb.jpg', width: 900, height: 500, extmetadata: { Artist: { value: 'Commons Creator' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] } } } }), { status: 200 })
    throw Error('Unexpected network request')
  }) as unknown as typeof fetch
  const service = createVideoStudioService({ file: join(root, 'video.json'), keys: () => keys(), fetchImpl })
  const answer = await service.search(7, 'calm sky', 'image')
  expect(answer.ok).toBe(true); expect(answer.assets).toHaveLength(2)
  expect(answer.assets.map(asset => asset.provider).sort()).toEqual(['openverse', 'wikimedia'])
  expect(answer.assets[0].token).toMatch(/^[a-f0-9-]{36}$/)
  expect(answer.notice).toContain('Nothing has been downloaded')
  expect(requested).toHaveLength(2)
})

test('public social-link preflight uses owner-selected yt-dlp metadata without cookies or downloading', async () => {
  const root = folder(), ytDlp = join(root, 'yt-dlp.exe'), project = join(root, 'project'); writeFileSync(ytDlp, 'fixture'); mkdirSync(project)
  const commands: string[][] = []
  const service = createVideoStudioService({ file: join(root, 'video.json'), keys: () => keys(), runCommand: async (_command, args) => { commands.push(args); return Buffer.from(JSON.stringify({ title: 'Public clip', duration: 42, uploader: 'Owner', availability: 'public', ext: 'mp4' })) } })
  service.setYtDlp(ytDlp); service.setProjectFolder(project)
  const review = await service.preflightUrl(2, 'https://www.youtube.com/watch?v=example')
  expect(review).toMatchObject({ ok: true, provider: 'youtube', title: 'Public clip', duration: 42, method: 'yt-dlp-metadata' })
  expect(commands[0]).toContain('--skip-download'); expect(commands[0]).toContain('--no-playlist')
  expect(commands[0].join(' ')).not.toMatch(/cookies|browser/i)
})
