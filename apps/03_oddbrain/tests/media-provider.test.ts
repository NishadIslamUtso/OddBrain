// @vitest-environment node
import { test, expect } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { providerDecode, boundedResponse, type MediaAccess } from '../src/main/media/provider'
import { DEFAULT_MEDIA, type MediaInput } from '../src/shared/lib/mediaBridge'
import { createMediaService } from '../src/main/media/service'

const png = Buffer.from([137,80,78,71,13,10,26,10,0])
const access: MediaAccess = { permissions: { local: true, cloud: {}, keepConversations: false, browserCapture: false }, external: true, key: () => 'fixture-key', customBaseUrl: 'http://127.0.0.1:12345/v1' }
const input: MediaInput = { name: 'image.png', mime: 'image/png', bytes: png, route: 'provider', expected: { provider: 'openai', model: 'chosen-model' } }
const prefs = { ...DEFAULT_MEDIA, provider: 'openai', model: 'chosen-model' }
const answer = () => new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: 'Visible source words' }] }] }))

test('selected provider/model only; no fallback, retries, redirects or leaked credentials in URLs', async () => {
  const calls: { url: string; init: RequestInit }[] = []
  const fetcher = (async (url, init) => { calls.push({ url: String(url), init: init! }); return answer() }) as typeof fetch
  const result = await providerDecode(input, prefs, access, new AbortController().signal, fetcher)
  expect(calls).toHaveLength(1); expect(calls[0].url).toBe('https://api.openai.com/v1/responses')
  expect(calls[0].url).not.toContain('fixture-key'); expect(calls[0].init.redirect).toBe('error')
  expect(JSON.parse(String(calls[0].init.body)).model).toBe('chosen-model'); expect(result.disclosure).toContain('openai / chosen-model')
  const denied = (async () => new Response('quota', { status: 429 })) as typeof fetch
  await expect(providerDecode(input, prefs, access, new AbortController().signal, denied)).rejects.toThrow(/not retried/)
})
test('disabled provider, global external gate, missing key or changed selection sends zero bytes', async () => {
  let count = 0; const fetcher = (async () => { count++; return answer() }) as typeof fetch
  for (const gate of [{ ...access, external: false }, { ...access, key: () => '' }, { ...access, permissions: { ...access.permissions, cloud: { openai: false } } }]) await expect(providerDecode(input, prefs, gate, new AbortController().signal, fetcher)).rejects.toThrow(/disabled|missing/)
  await expect(providerDecode(input, { ...prefs, model: 'another' }, access, new AbortController().signal, fetcher)).rejects.toThrow(/changed/)
  expect(count).toBe(0)
})
test('custom local adapters obey local permissions; external custom adapters need external access', async () => {
  const custom = { ...input, expected: { provider: 'custom', model: 'chosen-model' } }, config = { ...prefs, provider: 'custom' }
  await expect(providerDecode(custom, config, { ...access, external: false, key: () => '' }, new AbortController().signal, (async () => answer()) as typeof fetch)).resolves.toMatchObject({ ok: true })
  await expect(providerDecode(custom, config, { ...access, permissions: { ...access.permissions, local: false } }, new AbortController().signal)).rejects.toThrow(/Local inference/)
  await expect(providerDecode(custom, config, { ...access, external: false, customBaseUrl: 'https://my-provider.example/v1' }, new AbortController().signal)).rejects.toThrow(/external inference/)
})
test('transcription uses the selected exact audio model in multipart form', async () => {
  const recording = { ...input, name: 'recording.webm', bytes: Buffer.from([0x1a,0x45,0xdf,0xa3,0]), route: 'transcribe' as const, expected: { provider: 'groq', model: 'my-transcriber' } }
  const config = { ...DEFAULT_MEDIA, transcriptionProvider: 'groq', transcriptionModel: 'my-transcriber' }
  const result = await providerDecode(recording, config, access, new AbortController().signal, (async (url, options) => {
    expect(String(url)).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
    expect((options?.body as FormData).get('model')).toBe('my-transcriber')
    expect((options?.body as FormData).get('file')).toBeInstanceOf(Blob)
    return new Response(JSON.stringify({ text: 'Recorded words' }))
  }) as typeof fetch)
  expect(result.text).toBe('Recorded words')
})
test('unknown provider adapters, encrypted PDF and unsupported files refuse without fallback', async () => {
  let calls = 0; const fetcher = (async () => { calls++; return answer() }) as typeof fetch
  const unknown = { ...input, expected: { provider: 'deepseek', model: prefs.model } }
  await expect(providerDecode(unknown, { ...prefs, provider: 'deepseek' }, access, new AbortController().signal, fetcher)).rejects.toThrow(/no verified adapter/)
  await expect(providerDecode({ ...input, bytes: Buffer.from('%PDF-1.4\n/Encrypt 6 0 R') }, prefs, access, new AbortController().signal, fetcher)).rejects.toThrow(/Encrypted/)
  await expect(providerDecode({ ...input, bytes: Buffer.from('binary unknown') }, prefs, access, new AbortController().signal, fetcher)).rejects.toThrow(/accepts PDF/)
  expect(calls).toBe(0)
})
test('a provider cannot consume unbounded response memory', async () => {
  await expect(boundedResponse(new Response('too long'), 3)).rejects.toThrow(/size limit/)
  await expect(boundedResponse(new Response('x', { headers: { 'content-length': '1000' } }), 3)).rejects.toThrow(/size limit/)
})
test('media service validates input, cancels work and ignores renderer decoder paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ob-media-service-'))
  try {
    const cancellations: number[] = []
    const service = createMediaService({ file: join(root, 'settings.json'), access: () => access, onCancelled: owner => cancellations.push(owner), decode: (_name, _bytes, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('Cancelled.')))) })
    service.update({ ffmpeg: '/arbitrary/renderer/command', dictation: 'provider', transcriptionProvider: 'groq', transcriptionModel: 'chosen' })
    expect(service.read().ffmpeg).toBe('')
    expect(service.authorizeRecording(9, { provider: 'groq', model: 'chosen' }).ok).toBe(true); expect(service.canRecord(9)).toBe(true)
    service.cancelAll(); expect(service.canRecord(9)).toBe(false); expect(cancellations).toContain(9)
    const pending = service.decode(1, { ...input, bytes: Buffer.from('note text'), route: 'local' })
    expect((await service.decode(1, { ...input, route: 'local' })).error).toContain('running')
    service.cancel(1); expect((await pending).error).toBe('Cancelled.')
    expect((await service.decode(2, { ...input, bytes: new Uint8Array(0), route: 'local' })).ok).toBe(false)
  } finally { await rm(root, { recursive: true, force: true }) }
})
