import { afterEach, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createTurnArchive } from '../src/main/turnArchive'
import { dispatchRecordedTurn } from '../src/main/recordedDispatch'
import { createTurnMedia } from '../src/main/turnMedia'
import { transcriptMarkdown, validTranscriptMedia, type TranscriptMedia } from '../src/shared/lib/transcripts'
import type { EngineImage } from '../src/shared/lib/media'
const roots: string[] = []
const folder = () => { const dir = mkdtempSync(join(tmpdir(), 'oddbrain-turn-media-')); roots.push(dir); return dir }
afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { force: true, recursive: true }) })
const png = (text: string): EngineImage => ({ mime: 'image/png', data: Buffer.from(text).toString('base64') })
const input = { prompt: 'Look at these', engine: 'claude-code' as const, model: 'opus', workspace: '/work', pictures: 1 }
const images = [png('first picture bytes')]

test('the exact picture bytes are written before dispatch and survive reopening', () => {
  const root = folder(), archive = createTurnArchive(root), id = archive.begin({ ...input, images })
  const record = archive.read(id)
  expect(record.header.pictures).toBe(1)
  expect(record.header.media).toMatchObject({ bytes: Buffer.byteLength('first picture bytes'), files: [{ index: 0, mime: 'image/png' }] })
  const reopened = createTurnArchive(root)
  const saved = reopened.read(id)
  const file = saved.header.media!.files[0]
  const opened = reopened.media.read(id, 0, file)
  expect(Buffer.from(opened.base64, 'base64').toString('utf8')).toBe('first picture bytes')
  expect(opened.sha256).toBe(file.sha256)
  expect(opened.name).toBe(`turn-${id}-picture-1.png`)
  expect(readFileSync(join(root, 'media', id, '0.png')).toString('utf8')).toBe('first picture bytes')
  if (process.platform !== 'win32') expect(statSync(join(root, 'media', id, '0.png')).mode & 0o777).toBe(0o600)
})

test('several pictures keep their order, and the manifest records sizes and digests', () => {
  const root = folder(), archive = createTurnArchive(root)
  const three = [png('one'), png('two'), { mime: 'image/webp' as const, data: Buffer.from('three').toString('base64') }]
  const id = archive.begin({ ...input, pictures: 3, images: three })
  const media = archive.read(id).header.media!
  expect(media.files.map(file => file.mime)).toEqual(['image/png', 'image/png', 'image/webp'])
  expect(media.bytes).toBe(3 + 3 + 5)
  expect(new Set(media.files.map(file => file.sha256)).size).toBe(3)
  for (const file of media.files) expect(Buffer.from(archive.media.read(id, file.index, file).base64, 'base64').length).toBe(file.bytes)
  expect(readdirSync(join(root, 'media', id)).sort()).toEqual(['0.png', '1.png', '2.webp'])
})

test('a changed saved picture refuses the download and never republishes altered bytes', () => {
  const root = folder(), archive = createTurnArchive(root), id = archive.begin({ ...input, images })
  const file = archive.read(id).header.media!.files[0]
  const path = join(root, 'media', id, '0.png')
  writeFileSync(path, Buffer.from('tampered picture bytes'))
  expect(() => createTurnArchive(root).media.read(id, 0, file)).toThrow('size')
  writeFileSync(path, Buffer.alloc(file.bytes, 7))
  expect(() => createTurnArchive(root).media.read(id, 0, file)).toThrow('digest')
  expect(readFileSync(path)).toEqual(Buffer.alloc(file.bytes, 7))
})

test('missing pictures, unknown positions and unsafe identifiers refuse without touching originals', () => {
  const root = folder(), archive = createTurnArchive(root), id = archive.begin({ ...input, images })
  const file = archive.read(id).header.media!.files[0]
  expect(() => archive.media.read(id, 1, file)).toThrow('position')
  expect(() => archive.media.read(id, 0, { ...file, index: 1 })).toThrow('position')
  expect(() => archive.media.read(id, 0, { ...file, sha256: 'f'.repeat(64) })).toThrow()
  rmSync(join(root, 'media', id, '0.png'))
  expect(() => archive.media.read(id, 0, file)).toThrow('missing')
  for (const unsafe of ['../escape', '/tmp/secret', '', 'x.png']) expect(() => archive.media.read(unsafe, 0, file)).toThrow('identifier')
  expect(archive.read(id).header.media).toEqual({ files: [file], bytes: file.bytes })
})

test('a record without preserved bytes honestly reports the count and offers no picture', () => {
  const root = folder(), archive = createTurnArchive(root), id = archive.begin({ ...input, pictures: 2 })
  const record = archive.read(id)
  expect(record.header.media).toBeUndefined()
  expect(transcriptMarkdown(record)).toContain('Their bytes were not saved with this record.')
  expect(() => archive.media.read(id, 0, { index: 0, mime: 'image/png', bytes: 1, sha256: 'a'.repeat(64) })).toThrow('missing')
})

test('a mismatched picture count, too many pictures or an oversized picture refuses before anything is dispatched', () => {
  const root = folder(), archive = createTurnArchive(root), send = (): never => { throw Error('must not dispatch') }
  expect(dispatchRecordedTurn(archive, { ...input, pictures: 2, images }, () => { send(); return { ok: true, answer: '' } }, () => { throw Error('no stop') }, () => {})).toMatchObject({ ok: false })
  expect(readdirSync(root)).toEqual([])
  expect(() => archive.begin({ ...input, pictures: 0, images })).toThrow('picture count')
  const tiny = createTurnMedia(folder(), { files: 2, bytes: 4 })
  const id = `${Date.now()}-${'a'.repeat(8)}-${'b'.repeat(4)}-${'c'.repeat(4)}-${'d'.repeat(4)}-${'e'.repeat(12)}`
  expect(() => tiny.save(id, [png('ok'), png('two'), png('three')])).toThrow('At most 2')
  expect(() => tiny.save(id, [{ mime: 'image/png', data: Buffer.from('five!').toString('base64') }])).toThrow('size limit')
})

test('a failed media write leaves neither a record nor a partial folder and refuses dispatch', () => {
  const root = folder(), blocked = join(root, 'blocked'), archive = createTurnArchive(root, undefined, blocked)
  writeFileSync(blocked, 'not a folder')
  let dispatched = false
  const answer = dispatchRecordedTurn(archive, { ...input, images }, () => { dispatched = true; return { ok: true, answer: 'started' } }, () => {}, () => {})
  expect(answer).toMatchObject({ ok: false, answer: expect.stringContaining('could not be started') })
  expect(dispatched).toBe(false)
  expect(readdirSync(root)).toEqual(['blocked'])
})

test('a text-header write failure removes only the folder this attempt created', () => {
  const root = folder(), mediaRoot = join(root, 'media')
  const archive = createTurnArchive(root, 10, mediaRoot)
  expect(() => archive.begin({ ...input, prompt: 'x'.repeat(200), images })).toThrow('Nothing was sent')
  expect(readdirSync(mediaRoot)).toEqual([])
  expect(readdirSync(root)).toEqual(['media'])
})

test('a damaged media manifest in a stored header is refused rather than trusted', () => {
  const root = folder(), archive = createTurnArchive(root), id = archive.begin({ ...input, images })
  const path = join(root, id + '.ndjson')
  const lines = readFileSync(path, 'utf8').split('\n')
  const header = JSON.parse(lines[0]).header
  header.media = { files: [{ index: 0, mime: 'image/png', bytes: 5, sha256: 'not-a-digest' }], bytes: 5 }
  writeFileSync(path, JSON.stringify({ header }) + '\n' + lines.slice(1).join('\n'))
  expect(() => createTurnArchive(root).read(id)).toThrow('header is damaged')
  header.media = { files: [{ index: 0, mime: 'image/gif', bytes: 5, sha256: 'a'.repeat(64) }], bytes: 5 }
  writeFileSync(path, JSON.stringify({ header }) + '\n' + lines.slice(1).join('\n'))
  expect(() => createTurnArchive(root).read(id)).toThrow('header is damaged')
})

test('the manifest validator refuses empty, unordered, oversized and inconsistent descriptions', () => {
  const ok: TranscriptMedia = { files: [{ index: 0, mime: 'image/png', bytes: 3, sha256: 'a'.repeat(64) }], bytes: 3 }
  expect(validTranscriptMedia(ok)).toBe(true)
  expect(validTranscriptMedia({ ...ok, bytes: 4 })).toBe(false)
  expect(validTranscriptMedia({ files: [], bytes: 0 })).toBe(false)
  expect(validTranscriptMedia({ files: [ok.files[0], ok.files[0]], bytes: 6 })).toBe(false)
  expect(validTranscriptMedia({ files: [{ ...ok.files[0], bytes: 0 }], bytes: 0 })).toBe(false)
  expect(validTranscriptMedia({ files: [{ ...ok.files[0], bytes: 2 * 1024 * 1024 + 1 }], bytes: 2 * 1024 * 1024 + 1 })).toBe(false)
  expect(validTranscriptMedia(null)).toBe(false)
})

test('saved chats carry the manifest, and a damaged one is refused instead of silently dropped', async () => {
  const { normalizeChats } = await import('../src/shared/lib/storage')
  const media: TranscriptMedia = { files: [{ index: 0, mime: 'image/png', bytes: 3, sha256: 'a'.repeat(64) }], bytes: 3 }
  const message = { id: 'm', role: 'user' as const, content: 'hi', nativeRecord: { transcriptId: 't', chatId: 'c', engine: 'agy' as const, sessionId: null, pictures: 1, media } }
  expect(normalizeChats([{ id: 'chat', title: 'Chat', messages: [message] }])[0].messages![0].nativeRecord!.media).toEqual(media)
  expect(() => normalizeChats([{ id: 'chat', title: 'Chat', messages: [{ ...message, nativeRecord: { ...message.nativeRecord, pictures: 2 } }] }])).toThrow('Invalid message history')
  expect(() => normalizeChats([{ id: 'chat', title: 'Chat', messages: [{ ...message, nativeRecord: { ...message.nativeRecord, media: { files: [], bytes: 0 } } }] }])).toThrow('Invalid message history')
})
