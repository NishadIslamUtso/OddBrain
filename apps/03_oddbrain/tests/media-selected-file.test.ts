// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createMediaService } from '../src/main/media/service'
import { createProcessingLedger } from '../src/main/processing/ledger'
import { MAX_INLINE_MEDIA_BYTES, normalizeMedia, type MediaResult } from '../src/shared/lib/mediaBridge'
import type { MediaAccess } from '../src/main/media/provider'

const roots: string[] = []
const folder = (): string => { const value = mkdtempSync(join(tmpdir(), 'oddbrain-selected-media-')); roots.push(value); return value }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const access: MediaAccess = { permissions: { local: true, cloud: {}, keepConversations: false, browserCapture: false }, external: false, key: () => '', customBaseUrl: '' }

test('the browser video fallback does not restore the removed universal 50 MB ceiling', () => {
  const source = readFileSync(new URL('../src/renderer/src/lib/videoFrames.ts', import.meta.url), 'utf8')
  expect(source).not.toContain('50 * 1024 * 1024')
  expect(source).not.toContain('50 MB limit')
})

test('legacy media preferences migrate and a file above the inline transport streams through the selected-file route', async () => {
  expect(normalizeMedia({ provider: 'openai', model: 'old-choice', dictation: 'local', language: 'en-US', ffmpeg: '' })).toMatchObject({ provider: 'openai', model: 'old-choice', ocrAdapter: '', ocrAdapterSha256: '', ocrAdapterLabel: '' })
  const root = folder(), source = join(root, 'large-source.bin'), sourceRoot = join(root, 'private-originals')
  const bytes = Buffer.alloc(MAX_INLINE_MEDIA_BYTES + 1024 * 1024, 0x41); writeFileSync(source, bytes)
  const decoded = vi.fn(async (name: string, input: Uint8Array): Promise<MediaResult> => ({ ok: true, name, text: `Read ${input.byteLength} bytes`, textComplete: true, disclosure: 'Complete selected-file fixture.' }))
  const service = createMediaService({ file: join(root, 'media.json'), sourceRoot, access: () => access, decode: decoded as any })
  const inline = await service.decode(1, { name: 'large-source.bin', mime: 'application/octet-stream', bytes, route: 'local' })
  expect(inline.ok).toBe(false); expect(inline.error).toContain('8 MB')
  const result = await service.decodeFile(1, source, { name: 'large-source.bin', mime: 'application/octet-stream', size: bytes.length, route: 'local', storage: 'private-copy' })
  expect(result).toMatchObject({ ok: true, textComplete: true, source: { bytes: bytes.length, storage: 'private-copy' } })
  expect(decoded).toHaveBeenCalledOnce()
  const retained = service.resolveSource(1, { ...result.source!, name: 'large-source.bin', mime: 'application/octet-stream' })
  expect(retained.path).not.toBe(source); expect(readFileSync(retained.path).length).toBe(bytes.length)
  expect(createHash('sha256').update(readFileSync(retained.path)).digest('hex')).toBe(createHash('sha256').update(bytes).digest('hex'))
  service.releaseSource(1, result.source!.handle)
  expect(() => service.resolveSource(1, result.source!)).toThrow(/expired/)
})

test('the optional OCR adapter is capability-reviewed, hash-pinned, range-labelled, and rejected after a change', async () => {
  const root = folder(), adapter = join(root, 'owner-ocr-adapter'), source = join(root, 'scan.pdf')
  writeFileSync(adapter, 'reviewed adapter v1'); writeFileSync(source, '%PDF-1.4\nfixture')
  const calls: string[][] = []
  const runCommand: typeof import('../src/main/media/process').runMediaCommand = async (_command, args) => {
    calls.push(args)
    if (args[0] === '--oddbrain-capabilities') return Buffer.from(JSON.stringify({ protocol: 'oddbrain-deepseek-ocr2-v1', model: 'DeepSeek-OCR-2', version: '2.0-fixture', license: 'Apache-2.0' }))
    if (args[0] === '--oddbrain-process') return Buffer.from(JSON.stringify({ text: '[Page 2]\nExact OCR fixture', coverage: 'Page 2 of 3 was processed.', pages: { read: 1, total: 3 } }))
    throw Error('Unexpected fixture command.')
  }
  const service = createMediaService({ file: join(root, 'media.json'), access: () => access, runCommand })
  const reviewed = await service.configureOcrAdapter(adapter)
  expect(reviewed.ocrAdapterSha256).toMatch(/^[a-f0-9]{64}$/); expect(reviewed.ocrAdapterLabel).toContain('DeepSeek-OCR-2 2.0-fixture')
  const result = await service.decodeFile(7, source, { name: 'scan.pdf', mime: 'application/pdf', size: readFileSync(source).length, route: 'ocr', storage: 'in-place', range: { unit: 'pages', start: 2, end: 2 } })
  expect(result).toMatchObject({ ok: true, pages: { read: 1, total: 3 }, textComplete: false, source: { storage: 'in-place' } })
  expect(result.disclosure).toContain('unconfirmed derived text')
  expect(calls.find(args => args[0] === '--oddbrain-process')).toContain('pages:2-2')
  writeFileSync(adapter, 'changed after review')
  const refused = await service.decodeFile(7, source, { name: 'scan.pdf', mime: 'application/pdf', size: readFileSync(source).length, route: 'ocr', storage: 'in-place' })
  expect(refused.ok).toBe(false); expect(refused.error).toContain('changed since review')
})

test('video execution covers every audio interval, measures level separately, samples the duration, and closes durable coverage', async () => {
  const root = folder(), source = join(root, 'meeting.mp4')
  writeFileSync(source, Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(80)]))
  const commands: Array<{ command: string; args: string[] }> = []
  const runCommand: typeof import('../src/main/media/process').runMediaCommand = async (command, args) => {
    commands.push({ command, args })
    if (command.endsWith('ffprobe') || command.endsWith('ffprobe.exe')) return Buffer.from(JSON.stringify({ format: { duration: '1250' }, streams: [{ codec_type: 'video' }, { codec_type: 'audio' }] }))
    if (args.includes('-frames:v')) writeFileSync(args.at(-1)!, Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
    if (args.some(value => value.includes('astats='))) return Buffer.from('lavfi.astats.Overall.RMS_level=-20.0\nlavfi.astats.Overall.RMS_level=-10.0\n')
    return Buffer.alloc(0)
  }
  const recognitionFiles: string[] = []
  const recognize = vi.fn(async (_language: string, _signal: AbortSignal, file?: string) => { recognitionFiles.push(file || ''); return `Words from interval ${recognitionFiles.length}` })
  const processing = createProcessingLedger(root, () => '2026-10-21T10:00:00.000Z')
  const service = createMediaService({ file: join(root, 'media.json'), access: () => access, processing, runCommand, recognize })
  service.update({ ffmpeg: join(root, 'tools', 'ffmpeg') }, true)
  const result = await service.decodeFile(4, source, { name: 'meeting.mp4', mime: 'video/mp4', size: readFileSync(source).length, route: 'local', storage: 'in-place' })
  expect(result).toMatchObject({ ok: true, time: { read: 1250, total: 1250, unit: 'seconds' }, textComplete: true })
  expect(recognize).toHaveBeenCalledTimes(3); expect(result.text).toContain('00:20:50'); expect(result.text).toContain('average -15.0 dB')
  expect(result.images).toHaveLength(3); expect(result.disclosure).toContain('complete 00:20:50 duration'); expect(result.disclosure).toContain('samples, not frame-by-frame')
  const probe = commands.find(call => call.command.endsWith('ffprobe') || call.command.endsWith('ffprobe.exe'))!
  expect(probe.args).toContain('file,pipe'); expect(probe.args).toContain('-enable_drefs'); expect(probe.args).toContain('-use_absolute_path')
  const measurement = commands.find(call => call.args.some(value => value.includes('astats=')))!
  expect(measurement.args.join(' ')).toContain('file=pipe\\:1')
  expect(processing.read().jobs[0]).toMatchObject({ state: 'done', source: { name: 'meeting.mp4' } })
  expect(processing.read().jobs[0].sections.every(section => section.state === 'done')).toBe(true)
})
