import { afterEach, expect, test } from 'vitest'
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { createTurnArchive } from '../src/main/turnArchive'
import { chatMarkdown, transcriptMarkdown } from '../src/shared/lib/transcripts'
import { createEngineSocket } from '../src/main/engine/socket'
import { DEFAULT_ENGINE, type EngineEvent } from '../src/shared/lib/engine'
const roots: string[] = []
const folder = () => { const dir = mkdtempSync(join(tmpdir(), 'oddbrain-transcripts-')); roots.push(dir); return dir }
afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { force: true, recursive: true }) })
const input = { prompt: 'First\n\n' + 'বাংলা '.repeat(1000), engine: 'agy' as const, model: 'native-choice', workspace: '/project', pictures: 0 }

test('full prompts, streaming text, tool activity and failures survive reopening without the 400-character journal cap', () => {
  const root = folder(), archive = createTurnArchive(root), id = archive.begin(input)
  const text = 'A'.repeat(20000)
  archive.append(id, { kind: 'delta', text }); archive.append(id, { kind: 'tool', name: 'read_file', summary: 'read source' }); archive.append(id, { kind: 'error', text: 'Stopped after partial work' })
  const reopened = createTurnArchive(root).read(id)
  expect(reopened.prompt).toBe(input.prompt); expect(reopened.events[0]).toEqual({ kind: 'delta', text }); expect(reopened.state).toBe('error')
  expect(transcriptMarkdown(reopened)).toContain(text); expect(transcriptMarkdown(reopened)).toContain('read source')
  if (process.platform !== 'win32') expect(statSync(join(root, id + '.ndjson')).mode & 0o777).toBe(0o600)
})
test('a crash or unfinished trailing write remains interrupted; the original is never repaired in place', () => {
  const root = folder(), archive = createTurnArchive(root), id = archive.begin(input)
  archive.append(id, { kind: 'delta', text: 'Saved prefix' })
  appendFileSync(join(root, id + '.ndjson'), '{"event":')
  const before = readFileSync(join(root, id + '.ndjson'))
  const record = createTurnArchive(root).read(id)
  expect(record.incomplete).toBe(true); expect(record.state).toBe('interrupted'); expect(record.events).toHaveLength(1)
  expect(readFileSync(join(root, id + '.ndjson'))).toEqual(before)
})
test('a damaged middle record cannot be skipped and reclassified as successful', () => {
  const root = folder(), archive = createTurnArchive(root), id = archive.begin(input)
  appendFileSync(join(root, id + '.ndjson'), 'broken\n{"event":{"kind":"done","text":"fake complete"}}\n')
  expect(archive.read(id)).toMatchObject({ state: 'interrupted', incomplete: true })
})
test('size failures refuse the append and retain an explicitly unfinished prefix', () => {
  const root = folder(), archive = createTurnArchive(root, 1000), id = archive.begin({ ...input, prompt: 'Small' })
  expect(() => archive.append(id, { kind: 'delta', text: 'x'.repeat(1001) })).toThrow('size limit')
  expect(archive.read(id).state).toBe('interrupted')
  expect(() => archive.begin({ ...input, prompt: 'x'.repeat(1001) })).toThrow('Nothing was sent')
})
test('terminal records are immutable and unsafe identifiers never become paths', () => {
  const archive = createTurnArchive(folder()), id = archive.begin(input)
  archive.append(id, { kind: 'done', text: 'Finished' }); archive.append(id, { kind: 'delta', text: 'late' })
  expect(archive.read(id).events).toHaveLength(1)
  for (const unsafe of ['../outside', '/tmp/secret', 'x.ndjson', '']) expect(() => archive.read(unsafe)).toThrow('identifier')
})
test('older records are paginated, never silently discarded at the old journal limit', () => {
  const archive = createTurnArchive(folder())
  const ids = Array.from({ length: 65 }, () => archive.begin({ ...input, prompt: 'Kept' }))
  const first = archive.list(), second = archive.list(first.next)
  expect(first.entries).toHaveLength(50); expect(second.entries).toHaveLength(15); expect(second.next).toBe('')
  expect(new Set([...first.entries, ...second.entries].map(e => e.id))).toEqual(new Set(ids))
})
test('startup recovery returns only missing records for existing chats and never resumes interrupted work', () => {
  const root = folder(), archive = createTurnArchive(root)
  const done = archive.begin({ ...input, chatId: 'chat-a', prompt: 'Done turn' }); archive.append(done, { kind: 'done', text: 'done answer' })
  const interrupted = archive.begin({ ...input, chatId: 'chat-a', prompt: 'Interrupted turn' }); archive.append(interrupted, { kind: 'delta', text: 'retained prefix' })
  const known = archive.begin({ ...input, chatId: 'chat-a', prompt: 'Already copied' }); archive.append(known, { kind: 'done', text: 'known' })
  const other = archive.begin({ ...input, chatId: 'chat-b', prompt: 'Other chat' }); archive.append(other, { kind: 'done', text: 'other' })
  const reopened = createTurnArchive(root), page = reopened.recover(['chat-a'], [known])
  expect(new Set(page.records.map(record => record.header.id))).toEqual(new Set([done, interrupted]))
  expect(page.records.find(record => record.header.id === interrupted)).toMatchObject({ state: 'interrupted', incomplete: false })
  expect(page.records.some(record => record.header.id === other)).toBe(false)
  expect(() => reopened.recover(['../escape'], [])).toThrow('scope')
  expect(() => reopened.recover(['chat-a'], ['not-a-transcript'])).toThrow('scope')
})
test('recovery omits rather than clips an oversized chat record', () => {
  const archive = createTurnArchive(folder()), id = archive.begin({ ...input, chatId: 'chat-a', prompt: 'Large turn' })
  archive.append(id, { kind: 'text', text: 'x'.repeat(8_000_001) }); archive.append(id, { kind: 'done', text: '' })
  const page = archive.recover(['chat-a'], [])
  expect(page.records).toEqual([]); expect(page.notice).toContain('were not shortened')
  expect(archive.read(id).state).toBe('done')
})
test('one damaged header is reported without hiding other records or overwriting it', () => {
  const root = folder(), archive = createTurnArchive(root), id = archive.begin(input)
  archive.begin({ ...input, prompt: 'Healthy' }); writeFileSync(join(root, id + '.ndjson'), 'damaged')
  expect(archive.list().entries).toHaveLength(1); expect(archive.list().notice).toContain('not been changed')
})
test('Markdown retains all saved messages, long text, artifact revisions and attachment coverage', () => {
  const messages = Array.from({ length: 41 }, (_, i) => ({ id: String(i), role: 'assistant' as const, content: `${i}: ` + 'x'.repeat(3000) }))
  const text = chatMarkdown({ id: 'chat', title: 'Full chat', messages: [...messages, { id: 'last', role: 'user', content: 'LAST', attachments: [{ id: 'a', name: 'note.txt', text: 'Full attachment', extraction: 'All text' }], artifacts: [{ id: 'art', title: 'page', type: 'html', versions: [{ content: '<p>one</p>' }, { content: '<p>two</p>' }] }] }] })
  expect(text).toContain(messages[0].content); expect(text).toContain(messages[40].content); expect(text).toContain('LAST'); expect(text).toContain('<p>one</p>'); expect(text).toContain('<p>two</p>'); expect(text).toContain('Full attachment')
})
test('validated image bytes are retained before dispatch and digest-checked on download', () => {
  const root = folder(), archive = createTurnArchive(root)
  const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII='
  const id = archive.begin({ ...input, engine: 'claude-code', pictures: 1, images: [{ mime: 'image/png', data }] })
  const record = archive.read(id)
  expect(record.header.images).toEqual([{ id: 'image-1', mime: 'image/png', bytes: Buffer.from(data, 'base64').length, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }])
  const download = archive.image(id, 'image-1')
  expect(download).toMatchObject({ id: 'image-1', mime: 'image/png', data, verified: true })
  if (process.platform !== 'win32') expect(statSync(join(root, `${id}.images`, 'image-1.png')).mode & 0o777).toBe(0o600)
  writeFileSync(join(root, `${id}.images`, 'image-1.png'), Buffer.from('changed'))
  expect(() => archive.image(id, 'image-1')).toThrow(/size|integrity/)
})
test('exact original source files are retained before dispatch and digest-checked on download', () => {
  const root = folder(), archive = createTurnArchive(root), bytes = new Uint8Array([0, 255, 16, 44, 100])
  const id = archive.begin({ ...input, chatId: 'chat-files', attachments: [{ id: 'source-1', name: 'notes original.bin', mime: 'application/octet-stream', data: bytes }] })
  const record = archive.read(id), descriptor = record.header.attachments![0]
  expect(descriptor).toMatchObject({ id: 'attachment-1', name: 'notes original.bin', mime: 'application/octet-stream', bytes: bytes.length, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
  expect(archive.attachment(id, descriptor.id)).toMatchObject({ ...descriptor, data: Buffer.from(bytes).toString('base64'), verified: true })
  expect(transcriptMarkdown(record)).toContain('Original-file notice')
  if (process.platform !== 'win32') expect(statSync(join(root, `${id}.attachments`, 'attachment-1.bin')).mode & 0o777).toBe(0o600)
  writeFileSync(join(root, `${id}.attachments`, 'attachment-1.bin'), Buffer.from([0, 254, 16, 44, 100]))
  expect(() => archive.attachment(id, descriptor.id)).toThrow('integrity')
})
test('large retained originals save through a verified stream without renderer base64', () => {
  const root = folder(), archive = createTurnArchive(root), source = join(root, 'large-source.bin'), saved = join(root, 'owner-copy.bin')
  const bytes = Buffer.alloc(9 * 1024 * 1024, 0x5a), sha256 = createHash('sha256').update(bytes).digest('hex')
  writeFileSync(source, bytes); writeFileSync(saved, 'replace only after verification')
  const id = archive.begin({ ...input, attachments: [{ id: 'selected-source', name: 'large-source.bin', mime: 'application/octet-stream', path: source, bytes: bytes.length, sha256 }] })
  expect(() => archive.attachment(id, 'attachment-1')).toThrow('renderer-memory')
  expect(archive.saveAttachment(id, 'attachment-1', saved)).toMatchObject({ bytes: bytes.length, sha256 })
  const savedBytes = readFileSync(saved)
  expect(savedBytes.length).toBe(bytes.length)
  expect(createHash('sha256').update(savedBytes).digest('hex')).toBe(sha256)
  expect(readdirSync(root).some(name => name.startsWith('.oddbrain-save-'))).toBe(false)
})
test('older count-only image records stay honest about unavailable bytes', () => {
  const archive = createTurnArchive(folder()), id = archive.begin({ ...input, pictures: 1 })
  const record = archive.read(id)
  expect(record.header.images).toBeUndefined()
  expect(transcriptMarkdown(record)).toContain('older record kept only their count')
  expect(() => archive.image(id, 'image-1')).toThrow('did not retain')
})
test('image/archive count mismatches and disguised formats refuse before a transcript starts', () => {
  const archive = createTurnArchive(folder())
  expect(() => archive.begin({ ...input, pictures: 0, images: [{ mime: 'image/png', data: 'iVBORw0KGgo=' }] })).toThrow('count does not match')
  expect(() => archive.begin({ ...input, pictures: 1, images: [{ mime: 'image/png', data: Buffer.from('not png').toString('base64') }] })).toThrow('does not match its declared format')
})
test('native result copies are not repeated after streamed text and notices', () => {
  const archive = createTurnArchive(folder()), id = archive.begin(input)
  archive.append(id, { kind: 'delta', text: 'Unique reply' }); archive.append(id, { kind: 'status', text: 'tool ended' }); archive.append(id, { kind: 'done', text: 'Unique reply', alreadyDisplayed: true })
  expect(transcriptMarkdown(archive.read(id)).match(/Unique reply/g)).toHaveLength(1)
})
test.each(['agy', 'claude-code'] as const)('reused %s sessions route later output to the current turn callback, not the first record', engine => {
  const root = folder(), archive = createTurnArchive(root), socket = createEngineSocket()
  const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: { write: () => true }, exitCode: null, signalCode: null, killed: false, kill() {} })
  const ids = [archive.begin({ ...input, engine }), archive.begin({ ...input, engine, prompt: 'Second' })]
  const start = (id: string) => ({ cwd: '/project', settings: { ...DEFAULT_ENGINE, id: engine }, spawnProcess: (() => child) as any, onEvent: (e: EngineEvent) => archive.append(id, e) })
  const emit = (text: string) => child.stdout.emit('data', Buffer.from(JSON.stringify(engine === 'agy' ? { event: 'result', result: { status: 'SUCCESS', response: text } } : { type: 'result', subtype: 'success', result: text }) + '\n'))
  expect(socket.send('First', start(ids[0])).ok).toBe(true); emit('First answer')
  expect(socket.send('Second', start(ids[1])).ok).toBe(true); emit('Second answer')
  expect(socket.turnBusy()).toBe(false)
  expect(transcriptMarkdown(archive.read(ids[0]))).toContain('First answer'); expect(transcriptMarkdown(archive.read(ids[0]))).not.toContain('Second answer')
  expect(transcriptMarkdown(archive.read(ids[1]))).toContain('Second answer')
})
test.each([{ kind: 'text', text: { fake: 'text' } }, { kind: 'permission', requestId: 'x', tool: 'shell', summary: 'x', detail: {} }, { kind: 'unknown' }, { kind: 'done', text: 'Do not hide this', alreadyDisplayed: 'false' }])('malformed JSON event objects cannot turn damaged text into a successful record: %j', event => {
 const root = folder(), archive = createTurnArchive(root), id = archive.begin(input)
 appendFileSync(join(root, id + '.ndjson'), JSON.stringify({event})+'\n'+JSON.stringify({event:{kind:'done',text:'false success'}})+'\n')
 expect(archive.read(id)).toMatchObject({ state: 'interrupted', incomplete: true, events: [] })
})
test('a truncated UTF-8 final write preserves complete Unicode records; invalid UTF-8 in a complete line is refused', () => {
 const root = folder(), archive = createTurnArchive(root), id = archive.begin(input), file = join(root,id+'.ndjson')
 archive.append(id,{kind:'text',text:'বাংলা saved prefix'})
 const good = readFileSync(file)
 appendFileSync(file,Buffer.from([0xe0,0xa6]))
 expect(archive.read(id)).toMatchObject({incomplete:true,events:[{kind:'text',text:'বাংলা saved prefix'}]})
 writeFileSync(file, Buffer.concat([good, Buffer.from('{"event":{"kind":"text","text":"'),Buffer.from([0xff]),Buffer.from('"}}\n')]))
 expect(()=>archive.read(id)).toThrow()
})
