// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectAudioBytes, MAX_AUDIO_BYTES, MAX_AUDIO_DURATION_SECONDS } from '../src/shared/lib/media'
import { loadAudio, persistAttachments, readAudioAttachment, toOllamaMessages } from '../src/shared/lib/attachments'
import type { Attachment, Message } from '../src/shared/types'

function waveFile(options: { seconds?: number; formatTag?: number; dataSize?: number } = {}): Uint8Array {
  const seconds = options.seconds ?? 1
  const sampleRate = 8_000
  const channels = 1
  const bitsPerSample = 16
  const dataSize = options.dataSize ?? sampleRate * channels * (bitsPerSample / 8) * seconds
  const bytes = new Uint8Array(44 + dataSize)
  const view = new DataView(bytes.buffer)
  const write = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index)
  }
  write(0, 'RIFF')
  view.setUint32(4, bytes.byteLength - 8, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, options.formatTag ?? 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * (bitsPerSample / 8), true)
  view.setUint16(32, channels * (bitsPerSample / 8), true)
  view.setUint16(34, bitsPerSample, true)
  write(36, 'data')
  view.setUint32(40, dataSize, true)
  return bytes
}

function mp3Frames(count = 2): Uint8Array {
  // MPEG-1, Layer III, 128 kbps, 44.1 kHz, stereo; each frame is 417 bytes.
  const bytes = new Uint8Array(count * 417)
  for (let frame = 0; frame < count; frame += 1) bytes.set([0xff, 0xfb, 0x90, 0x64], frame * 417)
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function audioFile(bytes: Uint8Array, name: string, type: string): File {
  const file = new File([toArrayBuffer(bytes)], name, { type })
  Object.defineProperty(file, 'arrayBuffer', { value: async () => toArrayBuffer(bytes) })
  return file
}

function installAudioDecoder(t: { after: (fn: () => void) => void }, decoded = { duration: 1, numberOfChannels: 1, sampleRate: 8_000, length: 8_000 }): void {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext')
  class FakeAudioContext {
    async decodeAudioData(): Promise<AudioBuffer> { return decoded as AudioBuffer }
    async close(): Promise<void> {}
  }
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: FakeAudioContext })
  t.after(() => {
    if (prior) Object.defineProperty(globalThis, 'AudioContext', prior)
    else delete (globalThis as typeof globalThis & { AudioContext?: unknown }).AudioContext
  })
}

function fakeIndexedDb(): { api: IDBFactory; data: Map<string, Map<IDBValidKey, unknown>> } {
  const data = new Map<string, Map<IDBValidKey, unknown>>()
  const database = {
    objectStoreNames: { contains: (name: string) => data.has(name) },
    createObjectStore: (name: string) => { data.set(name, new Map()); return {} },
    transaction: (names: string | string[]) => {
      const allowed = Array.isArray(names) ? names : [names]
      const transaction: Record<string, unknown> = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: (name: string) => {
          if (!allowed.includes(name)) throw new Error(`Store ${name} was not included in the transaction.`)
          const store = data.get(name)
          if (!store) throw new Error(`Store ${name} does not exist.`)
          return {
            put: (value: unknown, key: IDBValidKey) => {
              store.set(key, value)
              queueMicrotask(() => (transaction.oncomplete as (() => void) | null)?.())
              return key
            },
            get: (key: IDBValidKey) => {
              const request: Record<string, unknown> = { result: undefined, onsuccess: null, onerror: null }
              queueMicrotask(() => {
                request.result = store.get(key)
                ;(request.onsuccess as (() => void) | null)?.()
              })
              return request
            },
          }
        },
      }
      return transaction
    },
    close: () => undefined,
  }
  const api = {
    open: () => {
      const request: Record<string, unknown> = { result: database, onupgradeneeded: null, onsuccess: null, onerror: null }
      queueMicrotask(() => {
        ;(request.onupgradeneeded as (() => void) | null)?.()
        ;(request.onsuccess as (() => void) | null)?.()
      })
      return request
    },
  } as unknown as IDBFactory
  return { api, data }
}

test('WAV structure, codec, duration and size are checked before decode', () => {
  const valid = waveFile()
  assert.deepEqual(inspectAudioBytes(valid, 'wav'), {
    format: 'wav', durationSeconds: 1, sampleRate: 8_000, channels: 1,
  })
  assert.throws(() => inspectAudioBytes(valid, 'mp3'), /MP3 frame stream|malformed/i)
  assert.throws(() => inspectAudioBytes(waveFile({ formatTag: 0x0055 }), 'wav'), /uncompressed mono\/stereo PCM|compressed|unsupported/i)
  assert.throws(() => inspectAudioBytes(waveFile({ seconds: MAX_AUDIO_DURATION_SECONDS + 1 }), 'wav'), /longer than 90 seconds/)
  assert.throws(() => inspectAudioBytes(new Uint8Array(MAX_AUDIO_BYTES + 1), 'wav'), /exceeds the 6 MB limit/)
})

test('MP3 frames are parsed and duration is bounded without trusting file names', () => {
  const info = inspectAudioBytes(mp3Frames(), 'mp3')
  assert.equal(info.format, 'mp3')
  assert.equal(info.channels, 2)
  assert.equal(info.sampleRate, 44_100)
  assert.ok(info.durationSeconds > 0 && info.durationSeconds < 1)
  assert.throws(() => inspectAudioBytes(new TextEncoder().encode('ID3not audio'), 'mp3'), /no audio frames|malformed/i)
})

test('an MP3/WAV is decoded locally before it can be attached', async t => {
  const bytes = waveFile()
  installAudioDecoder(t)
  const file = audioFile(bytes, 'voice.wav', 'audio/wav')
  const attachment = await readAudioAttachment(file)
  assert.equal(attachment.kind, 'audio')
  assert.equal(attachment.audioFormat, 'wav')
  assert.equal(attachment.audioData, Buffer.from(bytes).toString('base64'))
  assert.equal(attachment.size, bytes.byteLength)
})

test('unsupported, mismatched, corrupt and undecodable inputs are refused before sending', async t => {
  await assert.rejects(
    readAudioAttachment(new File(['protected'], 'voice.wma', { type: 'audio/x-ms-wma' })),
    /only MP3 and uncompressed PCM\/float WAV.*encrypted or DRM-protected.*Nothing was sent/i,
  )
  await assert.rejects(
    readAudioAttachment(new File(['bad'], 'voice.wav', { type: 'audio/mpeg' })),
    /extension and MIME type do not match.*Nothing was sent/i,
  )
  await assert.rejects(
    readAudioAttachment(audioFile(new TextEncoder().encode('not WAV'), 'voice.wav', 'audio/wav')),
    /not a readable WAV container.*corrupt, encrypted, or DRM-protected.*Nothing was sent/i,
  )
  installAudioDecoder(t, { duration: 200, numberOfChannels: 2, sampleRate: 48_000, length: 9_600_000 })
  await assert.rejects(
    readAudioAttachment(audioFile(waveFile(), 'over-limit.wav', 'audio/wav')),
    /decoded audio exceeds the 90-second.*Nothing was sent/i,
  )
})

test('sent audio is persisted locally without embedding base64 in the transcript', async t => {
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
  const fake = fakeIndexedDb()
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: fake.api })
  t.after(() => {
    if (prior) Object.defineProperty(globalThis, 'indexedDB', prior)
    else delete (globalThis as typeof globalThis & { indexedDB?: unknown }).indexedDB
  })
  const bytes = waveFile()
  const data = Buffer.from(bytes).toString('base64')
  const attachment: Attachment = {
    id: 'voice-1', name: 'voice.wav', size: bytes.byteLength, mime: 'audio/wav', kind: 'audio',
    audioData: data, audioFormat: 'wav',
  }
  const metadata = await persistAttachments([attachment])
  assert.equal(metadata[0].audioData, undefined)
  assert.equal(metadata[0].audioFormat, 'wav')
  assert.equal(await loadAudio(metadata[0]), data)

  const message: Message = { id: 'm1', role: 'user', content: 'Summarize this.', attachments: metadata }
  await assert.rejects(
    toOllamaMessages([message], { verified: false, vision: false, thinking: false }),
    /needs an enabled OpenAI model with audio input selected.*nothing was sent/i,
  )
  const routed = await toOllamaMessages(
    [message],
    { verified: false, vision: false, thinking: false },
    { allowDirectProviderAudio: true },
  )
  assert.deepEqual(routed[0].audios, [{ data, format: 'wav' }])
  assert.equal(fake.data.get('audio')?.get('voice-1'), data)
})
