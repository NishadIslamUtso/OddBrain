import { describe, expect, it, vi } from 'vitest'
import { createMediaService } from '../src/main/cloud/media'
import { selectedEngineVision } from '../src/main/engine/mediaVision'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'
import { mediaModelSupported, audioMime } from '../src/shared/lib/media'

const makeList = (id: string) => {
  const models: Record<string, string[]> = {
    openai: ['gpt-4o-mini-transcribe', 'gpt-4o', 'text-only'],
    groq: ['whisper-large-v3-turbo'],
    anthropic: ['claude-sonnet-4-5'],
    gemini: ['gemini-2.5-flash'],
  }
  return (models[id] || []).map(label => ({ name: `${id}/${label}`, provider: id, label }))
}
const bytes = (values: number[]): string => Buffer.from(values).toString('base64')
const wav = bytes([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WAVE'), 0, 1, 2, 3])
const png = bytes([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])

describe('per-file media provider consent', () => {
  it('offers only saved, enabled providers with listed and known modality models; listing uploads no file', async () => {
    const seen: string[] = []
    const service = createMediaService({
      keys: { has: id => id !== 'gemini', get: () => 'secret' },
      enabled: id => id !== 'groq',
      listModels: async id => { seen.push(id); return makeList(id) },
      fetchImpl: vi.fn() as unknown as typeof fetch,
    })
    expect((await service.providers('audio')).options.map(choice => choice.provider)).toEqual(['openai'])
    expect((await service.providers('image')).options.map(choice => choice.provider)).toEqual(['anthropic', 'openai'])
    expect(seen).toEqual(['openai', 'anthropic', 'openai'])
    expect(mediaModelSupported('openai', 'audio', 'gpt-4o')).toBe(false)
    expect(mediaModelSupported('openrouter', 'image', 'gpt-4o')).toBe(false)
  })

  it('does not upload before selection, sends only to the picked provider, and labels its real result', async () => {
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.openai.com/v1/audio/transcriptions')
      expect(init.headers).toEqual({ authorization: 'Bearer secret' })
      expect((init.body as FormData).get('model')).toBe('gpt-4o-mini-transcribe')
      expect((init.body as FormData).get('file')).toBeInstanceOf(Blob)
      return Response.json({ text: 'Precisely the spoken words.' })
    })
    const service = createMediaService({ keys: { has: () => true, get: () => 'secret' }, enabled: () => true,
      listModels: async id => makeList(id), fetchImpl: fetcher as typeof fetch })
    const available = await service.providers('audio')
    expect(fetcher).not.toHaveBeenCalled()
    expect(await service.transcribe({ provider: 'openai', model: available.options.find(row => row.provider === 'openai')!.model,
      name: 'recording.wav', mime: 'audio/wav', data: wav })).toMatchObject({ ok: true, text: 'Precisely the spoken words.', provider: 'GPT (OpenAI)' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('refuses disabled/removed models and wrong bytes, without switching to a different provider', async () => {
    let enabled = true
    const fetcher = vi.fn()
    const service = createMediaService({ keys: { has: () => true, get: () => 'secret' }, enabled: () => enabled,
      listModels: async id => makeList(id), fetchImpl: fetcher as typeof fetch })
    enabled = false
    expect(await service.transcribe({ provider: 'groq', model: 'whisper-large-v3-turbo', name: 'talk.wav', mime: 'audio/wav', data: wav }))
      .toMatchObject({ ok: false })
    enabled = true
    expect((await service.transcribe({ provider: 'openai', model: 'made-up', name: 'talk.wav', mime: 'audio/wav', data: wav })).error).toMatch(/Choose again/)
    expect((await service.transcribe({ provider: 'openai', model: 'gpt-4o-mini-transcribe', name: 'fake.wav', mime: 'audio/wav', data: bytes([1, 2, 3]) })).error).toMatch(/not the format/)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('sends real image blocks only after the selected model is still listed, not just a filename', async () => {
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://api.anthropic.com/v1/messages')
      const body = JSON.parse(String(init.body))
      expect(body.messages[0].content[1]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } })
      return Response.json({ content: [{ type: 'text', text: 'A blue notebook.' }] })
    })
    const service = createMediaService({ keys: { has: () => true, get: () => 'secret' }, enabled: () => true,
      listModels: async id => makeList(id), fetchImpl: fetcher as typeof fetch })
    expect(await service.describe({ provider: 'anthropic', model: 'claude-sonnet-4-5', name: 'photo.png',
      images: [{ mime: 'image/png', data: png }] })).toMatchObject({ ok: true, text: 'A blue notebook.' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe('chosen model visual gate', () => {
  it('accepts local vision only when /api/show says so and rejects unverified and remote entries', async () => {
    const base = { ...DEFAULT_ENGINE, model: 'vision:7b' }
    const yes = vi.fn(async () => Response.json({ capabilities: ['vision'] })) as typeof fetch
    expect((await selectedEngineVision(base, { anthropicAllowed: false, fetchImpl: yes })).supported).toBe(true)
    expect(yes).toHaveBeenCalledTimes(1)
    expect((await selectedEngineVision(base, { anthropicAllowed: false, fetchImpl: vi.fn(async () => Response.json({ capabilities: ['completion'] })) as typeof fetch })).supported).toBe(false)
    expect((await selectedEngineVision(base, { anthropicAllowed: false, fetchImpl: vi.fn(async () => Response.json({ capabilities: ['vision'], remote_model: 'elsewhere' })) as typeof fetch })).supported).toBe(false)
  })
  it('never assumes agy or an unnamed engine choice can see, nor a disabled Anthropic model', async () => {
    expect((await selectedEngineVision({ ...DEFAULT_ENGINE, id: 'agy' }, { anthropicAllowed: true })).supported).toBe(false)
    expect((await selectedEngineVision(DEFAULT_ENGINE, { anthropicAllowed: true })).supported).toBe(false)
    const selected = { ...DEFAULT_ENGINE, model: 'anthropic/claude-sonnet-4-5', cloudProvider: 'anthropic' as const }
    expect((await selectedEngineVision(selected, { anthropicAllowed: true })).supported).toBe(true)
    expect((await selectedEngineVision(selected, { anthropicAllowed: false })).supported).toBe(false)
    expect(audioMime('fake.docx', 'audio/wav')).toBeNull()
  })
})
