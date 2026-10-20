import { afterEach, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { createSourceChecks } from '../src/main/research/service'
import { pageTitle, planSourceUrls, sourceUrlProblem, validSourceCheckRecord } from '../src/shared/lib/sourceCheck'
import { createTurnArchive } from '../src/main/turnArchive'
const roots: string[] = []
const folder = () => { const dir = mkdtempSync(join(tmpdir(), 'oddbrain-sources-')); roots.push(dir); return dir }
afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { force: true, recursive: true }) })
const transcript = () => createTurnArchive(folder()).begin({ prompt: 'Who said it', engine: 'agy', model: '', workspace: '/work', pictures: 0 })
const input = (id: string, urls: string[]) => ({ transcriptId: id, chatId: 'chat:a', questionStart: 'Who said it', urls })
const html = (body: string, type = 'text/html; charset=utf-8') => new Response(body, { status: 200, headers: { 'content-type': type } })

test('the planner accepts ordinary public https links and refuses everything else with a reason', () => {
  expect(sourceUrlProblem('https://example.com/a?b=1')).toBe('')
  expect(sourceUrlProblem('https://sub.example.co.uk/')).toBe('')
  for (const bad of ['http://example.com/', 'ftp://example.com/', 'javascript:alert(1)', 'https://user:pw@example.com/', 'https://example.com:8443/', 'https://localhost/x', 'https://foo.local/x', 'https://intranet/x', 'https://127.0.0.1/', 'https://10.1.2.3/', 'https://172.20.1.1/', 'https://192.168.0.5/', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/', 'https://[fd00::1]/', 'https://0.0.0.0/', 'https://224.0.0.1/', 'https://198.18.0.1/', 'https://999.1.1.1/']) expect(sourceUrlProblem(bad), bad).not.toBe('')
  const plan = planSourceUrls(['https://example.com/a', 'https://example.com/a', 'http://nope', 'https://example.org/b'])
  expect(plan.urls).toEqual(['https://example.com/a', 'https://example.org/b'])
  expect(plan.refused).toHaveLength(1)
  expect(plan.refused[0].url).toBe('http://nope')
  expect(() => planSourceUrls(Array.from({ length: 9 }, (_, i) => `https://example.com/${i}`))).toThrow('At most 8')
  expect(() => planSourceUrls('https://example.com')).toThrow('list')
  expect(pageTitle('<html><head><title> A &amp; B </title></head>')).toBe('A & B')
  expect(pageTitle('<p>no title</p>')).toBe('')
})

test('a preview requests nothing and requires a saved record; denial and wrong windows never fetch', async () => {
  const fetchImpl = vi.fn(), checks = createSourceChecks({ root: folder(), fetchImpl: fetchImpl as unknown as typeof fetch })
  const id = transcript()
  expect(() => checks.preview(1, input('../../etc', ['https://example.com/']))).toThrow('transcript')
  const preview = checks.preview(1, input(id, ['https://example.com/a']))
  expect(preview.urls).toEqual(['https://example.com/a'])
  expect(preview.explanation).toContain('not proof that the model read the page')
  expect(fetchImpl).not.toHaveBeenCalled()
  await expect(checks.decide(2, preview.token, 'allow')).rejects.toThrow('another window')
  expect(fetchImpl).not.toHaveBeenCalled()
  const denied = await checks.decide(1, preview.token, 'deny')
  expect(denied).toEqual({ denied: true, answer: expect.stringContaining('No address was requested') })
  expect(fetchImpl).not.toHaveBeenCalled()
  await expect(checks.decide(1, preview.token, 'allow')).rejects.toThrow('expired or was already used')
  expect(fetchImpl).not.toHaveBeenCalled()
})

test('allowed checks fetch each exact address once and record status, type, size, digest and title', async () => {
  const root = folder(), id = transcript()
  const fetchImpl = vi.fn(async (url: string) => html(`<html><head><title>Page for ${url}</title></head><body>BODY</body></html>`))
  const checks = createSourceChecks({ root, fetchImpl: fetchImpl as unknown as typeof fetch })
  const preview = checks.preview(7, input(id, ['https://example.com/a', 'https://example.org/b']))
  const answer = await checks.decide(7, preview.token, 'allow')
  expect(answer.denied).toBe(false)
  if (answer.denied) return
  expect(fetchImpl).toHaveBeenCalledTimes(2)
  expect(fetchImpl.mock.calls.map(call => call[0])).toEqual(['https://example.com/a', 'https://example.org/b'])
  const options = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
  expect(options).toMatchObject({ redirect: 'follow' })
  expect(JSON.stringify(options)).not.toMatch(/authorization|cookie|api-key/i)
  expect(answer.record.entries.map(entry => entry.state)).toEqual(['retrieved', 'retrieved'])
  const first = answer.record.entries[0]
  expect(first).toMatchObject({ status: 200, mime: 'text/html', title: 'Page for https://example.com/a' })
  expect(first.bytes).toBe(Buffer.byteLength('<html><head><title>Page for https://example.com/a</title></head><body>BODY</body></html>'))
  expect(first.sha256).toBe(createHash('sha256').update('<html><head><title>Page for https://example.com/a</title></head><body>BODY</body></html>').digest('hex'))
  // The receipt survives a restart and is scoped to its record.
  const reopened = createSourceChecks({ root, fetchImpl: fetchImpl as unknown as typeof fetch })
  expect(reopened.read(id).records[0]).toEqual(answer.record)
  expect(reopened.read(transcript())).toEqual({ records: [], notice: '' })
  expect(JSON.parse(readFileSync(join(root, id, answer.record.id + '.json'), 'utf8'))).toEqual(answer.record)
})

test('failures are recorded as evidence, not turned into successful receipts', async () => {
  const id = transcript()
  const responses: Record<string, () => Promise<Response>> = {
    'https://example.com/missing': async () => new Response('gone', { status: 404, headers: { 'content-type': 'text/html' } }),
    'https://example.com/pdf': async () => new Response('%PDF', { status: 200, headers: { 'content-type': 'application/pdf' } }),
    'https://example.com/huge': async () => new Response('x', { status: 200, headers: { 'content-type': 'text/plain', 'content-length': String(9_000_000) } }),
    'https://example.com/empty': async () => new Response('', { status: 200, headers: { 'content-type': 'text/plain' } }),
    'https://example.com/timeout': async () => { throw Object.assign(Error('timed out'), { name: 'TimeoutError' }) },
    'https://example.com/private-redirect': async () => { const response = html('hi'); Object.defineProperty(response, 'url', { value: 'https://127.0.0.1/secret' }); return response },
  }
  const checks = createSourceChecks({ root: folder(), fetchImpl: (async (url: string) => responses[url]()) as unknown as typeof fetch })
  const preview = checks.preview(1, input(id, Object.keys(responses)))
  const answer = await checks.decide(1, preview.token, 'allow')
  if (answer.denied) throw Error('expected a record')
  const byUrl = Object.fromEntries(answer.record.entries.map(entry => [entry.url, entry]))
  expect(byUrl['https://example.com/missing']).toMatchObject({ state: 'unreachable', status: 404 })
  expect(byUrl['https://example.com/pdf']).toMatchObject({ state: 'refused', reason: expect.stringContaining('application/pdf') })
  expect(byUrl['https://example.com/huge']).toMatchObject({ state: 'refused', reason: expect.stringContaining('read limit') })
  expect(byUrl['https://example.com/empty']).toMatchObject({ state: 'refused', reason: expect.stringContaining('empty') })
  expect(byUrl['https://example.com/timeout']).toMatchObject({ state: 'unreachable', reason: expect.stringContaining('No answer within') })
  expect(byUrl['https://example.com/private-redirect']).toMatchObject({ state: 'refused', reason: expect.stringContaining('redirected') })
  for (const entry of answer.record.entries) if (entry.state === 'retrieved') expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/)
})

test('a body that grows past the read limit is refused and never recorded as read in full', async () => {
  const id = transcript()
  const big = 'x'.repeat(4_096)
  const checks = createSourceChecks({ root: folder(), maxBytes: 1_000, fetchImpl: (async () => new Response(big, { status: 200, headers: { 'content-type': 'text/plain' } })) as unknown as typeof fetch })
  const preview = checks.preview(1, input(id, ['https://example.com/big']))
  const answer = await checks.decide(1, preview.token, 'allow')
  if (answer.denied) throw Error('expected a record')
  expect(answer.record.entries[0]).toMatchObject({ state: 'refused', reason: expect.stringContaining('read limit') })
  expect(answer.record.entries[0].sha256).toBeUndefined()
})

test('links refused at review are recorded with their reason instead of being requested', async () => {
  const id = transcript(), fetchImpl = vi.fn(async () => html('ok'))
  const checks = createSourceChecks({ root: folder(), fetchImpl: fetchImpl as unknown as typeof fetch })
  const preview = checks.preview(1, input(id, ['https://example.com/good', 'http://plain.example.com/bad', 'https://127.0.0.1/secret']))
  expect(preview.urls).toEqual(['https://example.com/good'])
  const answer = await checks.decide(1, preview.token, 'allow')
  if (answer.denied) throw Error('expected a record')
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect(answer.record.entries.filter(entry => entry.state === 'refused')).toHaveLength(2)
  expect(validSourceCheckRecord(answer.record)).toBe(true)
})

test('expired reviews refuse before any request, and damaged receipts are reported without hiding healthy ones', async () => {
  let clock = 1_000
  const root = folder(), id = transcript(), fetchImpl = vi.fn(async () => html('ok'))
  const checks = createSourceChecks({ root, fetchImpl: fetchImpl as unknown as typeof fetch, now: () => clock })
  const preview = checks.preview(1, input(id, ['https://example.com/a']))
  clock += 120_001
  await expect(checks.decide(1, preview.token, 'allow')).rejects.toThrow('expired')
  expect(fetchImpl).not.toHaveBeenCalled()
  const fresh = checks.preview(1, input(id, ['https://example.com/a']))
  const answer = await checks.decide(1, fresh.token, 'allow')
  if (answer.denied) throw Error('expected a record')
  writeFileSync(join(root, id, '9999999999999-00000000-0000-0000-0000-000000000000.json'), 'not json')
  const read = createSourceChecks({ root, fetchImpl: fetchImpl as unknown as typeof fetch }).read(id)
  expect(read.records).toHaveLength(1)
  expect(read.notice).toContain('could not be read')
  expect(readFileSync(join(root, id, '9999999999999-00000000-0000-0000-0000-000000000000.json'), 'utf8')).toBe('not json')
})

test('receipt validation refuses invented entries and mismatched identifiers', async () => {
  const id = transcript(), checks = createSourceChecks({ root: folder(), fetchImpl: (async () => html('ok')) as unknown as typeof fetch })
  const preview = checks.preview(1, input(id, ['https://example.com/a']))
  const answer = await checks.decide(1, preview.token, 'allow')
  if (answer.denied) throw Error('expected a record')
  expect(validSourceCheckRecord(answer.record)).toBe(true)
  const bad = structuredClone(answer.record)
  bad.entries[0] = { ...bad.entries[0], state: 'retrieved', sha256: 'nope' }
  expect(validSourceCheckRecord(bad)).toBe(false)
  const other = structuredClone(answer.record)
  other.transcriptId = 'not-a-record'
  expect(validSourceCheckRecord(other)).toBe(false)
  const root = folder(); mkdirSync(join(root, id))
  writeFileSync(join(root, id, answer.record.id + '.json'), JSON.stringify({ ...answer.record, transcriptId: transcript() }))
  expect(createSourceChecks({ root }).read(id).records).toEqual([])
})

test('the panel needs a record identifier before it can even prepare a review', () => {
  const checks = createSourceChecks({ root: folder() })
  expect(() => checks.preview(1, { transcriptId: '', chatId: '', questionStart: '', urls: ['https://example.com/'] })).toThrow('saved transcript record')
  expect(() => checks.preview(1, { transcriptId: transcript(), chatId: 'bad id', questionStart: '', urls: ['https://example.com/'] })).toThrow('conversation identifier')
  expect(readdirSync(folder())).toEqual([])
})
