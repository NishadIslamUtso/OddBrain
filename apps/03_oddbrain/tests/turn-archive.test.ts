import { afterEach, expect, test } from 'vitest'
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { EventEmitter } from 'node:events'
import { createTurnArchive } from '../src/main/turnArchive'
import { chatMarkdown, picturesSaved, transcriptMarkdown } from '../src/shared/lib/transcripts'
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

// A 1x1 PNG, and a second distinct one (same header, different pixel bytes).
const PNG_ONE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PNG_TWO = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const images = [{ mime: 'image/png' as const, data: PNG_ONE }, { mime: 'image/png' as const, data: PNG_TWO }]

test('picture bytes are saved before dispatch and read back only when they still match', () => {
  const root = folder(), archive = createTurnArchive(root), id = archive.begin({ ...input, pictures: 2, images })
  const header = archive.read(id).header
  expect(picturesSaved(header)).toBe(true)
  expect(header.pictureRecords?.map(record => [record.index, record.mime, record.bytes])).toEqual([[0, 'image/png', 70], [1, 'image/png', 70]])
  expect(existsSync(join(root, id + '.pictures', '0.png'))).toBe(true)
  expect(archive.picture(id, 0).data).toBe(PNG_ONE)
  expect(archive.picture(id, 1).data).toBe(PNG_TWO)
  expect(archive.picture(id, 0).sha256).toMatch(/^[a-f0-9]{64}$/)
  if (process.platform !== 'win32') expect(statSync(join(root, id + '.pictures', '0.png')).mode & 0o777).toBe(0o600)
  expect(transcriptMarkdown(archive.read(id))).toContain('The exact bytes were saved beside this record')
})

test('a record that kept only a count says so, and nothing is reconstructed', () => {
  const root = folder(), archive = createTurnArchive(root), id = archive.begin({ ...input, pictures: 2 })
  expect(picturesSaved(archive.read(id).header)).toBe(false)
  expect(() => archive.picture(id, 0)).toThrow('image bytes were never stored')
  expect(transcriptMarkdown(archive.read(id))).toContain('This earlier record kept only the count')
})

test('a changed or removed picture file refuses instead of being returned', () => {
  const one = [images[0]]
  const root = folder(), archive = createTurnArchive(root), id = archive.begin({ ...input, pictures: 1, images: one })
  writeFileSync(join(root, id + '.pictures', '0.png'), Buffer.from('different bytes'))
  expect(() => archive.picture(id, 0)).toThrow('does not match its recorded')
  const second = archive.begin({ ...input, pictures: 1, images: one })
  rmSync(join(root, second + '.pictures', '0.png'))
  expect(() => archive.picture(second, 0)).toThrow('is missing')
})

test('an invalid picture list refuses before the record is written', () => {
  const root = folder(), archive = createTurnArchive(root)
  expect(() => archive.begin({ ...input, pictures: 1, images: [{ mime: 'image/gif' as never, data: PNG_ONE }] })).toThrow('not a PNG, JPEG or WebP')
  expect(() => archive.begin({ ...input, pictures: 1, images: [{ mime: 'image/png', data: 'not base64!' }] })).toThrow()
  expect(() => archive.begin({ ...input, pictures: 3, images })).toThrow('picture records do not match')
  expect(archive.list().entries).toHaveLength(0)
})

test('a header that cannot fit removes the pictures saved for it', () => {
  const root = folder(), tiny = createTurnArchive(root, 300)
  expect(() => tiny.begin({ ...input, prompt: 'Small', pictures: 2, images })).toThrow('storage limit')
  expect(readdirSync(root)).toEqual([])
  expect(tiny.list().entries).toHaveLength(0)
})

test('a conversation’s own recorded turns can be listed apart from every other chat', () => {
  const root = folder(), archive = createTurnArchive(root)
  const first = archive.begin({ ...input, chatId: 'chat-one' }), second = archive.begin({ ...input, chatId: 'chat-two' }), loose = archive.begin(input)
  expect(archive.list('', 'chat-one').entries.map(entry => entry.id)).toEqual([first])
  expect(archive.list('', 'chat-two').entries.map(entry => entry.id)).toEqual([second])
  expect(archive.list('', 'chat-missing').entries).toEqual([])
  expect(archive.list().entries.map(entry => entry.id)).toEqual([loose, second, first].sort().reverse())
  expect(() => archive.list('', '../chat')).toThrow('Invalid conversation identifier')
})
