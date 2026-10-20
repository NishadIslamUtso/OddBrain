import { expect, test, vi } from 'vitest'
import { fetchWebSource, readableHtml, MAX_TEXT_CHARS } from '../src/main/research/sourceFetch'
import { privateHost, researchUrlProblem, researchSummary } from '../src/shared/lib/research'

/**
 * A fetched page is a source with a fingerprint, not an answer. These tests
 * cover what the app will reach, what it refuses, what it writes, and the words
 * it uses when it is unsure.
 */

const captureFixture = () => {
  const writes: Record<string, unknown>[] = []
  return {
    writes,
    capture: (data: Record<string, unknown>) => { writes.push(data); return { ok: true, source: '02 Sources/Web Pages/2026/web-abc.md', duplicate: false } },
  }
}
const page = (body: string, type = 'text/html; charset=utf-8', status = 200) =>
  new Response(body, { status, headers: { 'content-type': type } })
const stubResolve = async () => ['93.184.216.34']
const clock = () => new Date('2026-10-20T10:00:00.000Z')

test('only https, public destinations are fetchable, and http only on this machine', () => {
  expect(researchUrlProblem('https://example.com/a')).toBe('')
  expect(researchUrlProblem('http://localhost:8000/docs')).toBe('')
  expect(researchUrlProblem('http://example.com/a')).toMatch(/https/)
  expect(researchUrlProblem('ftp://example.com')).toMatch(/Only https/)
  expect(researchUrlProblem('https://user:pass@example.com')).toMatch(/credentials/)
  expect(researchUrlProblem('https://example.com/a#part')).toMatch(/#part/)
  expect(researchUrlProblem('example.com/a')).toMatch(/not a full address/)
  expect(researchUrlProblem('')).toMatch(/Paste/)
  expect(researchUrlProblem('https://example.com/\u0000')).toMatch(/control/)
  for (const host of ['localhost', '127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.4', '169.254.1.1', '100.64.0.1', 'printer.local', 'intranet', '::1', 'fd00::1', 'fe80::1'])
    expect(privateHost(host), host).toBe(true)
  for (const host of ['example.com', '93.184.216.34', '2001:4860:4860::8888'])
    expect(privateHost(host), host).toBe(false)
})

test('an HTML page becomes readable text with a title, and tags never survive as markup', () => {
  const { title, text, truncated } = readableHtml('<html><head><title>Caf&eacute; &amp; Co</title><style>p{color:red}</style></head><body><script>steal()</script><h1>Heading</h1><p>First&nbsp;line</p><p>Second &lt;tag&gt;</p></body></html>')
  expect(title).toBe('Café & Co')
  expect(text).toContain('Heading')
  expect(text).toContain('First line')
  expect(text).toContain('Second <tag>')
  expect(text).not.toContain('steal()')
  expect(text).not.toContain('color:red')
  expect(truncated).toBe(false)
  expect(readableHtml('x'.repeat(MAX_TEXT_CHARS + 5)).truncated).toBe(true)
})

test('a fetched page is written as a web source with its exact fingerprint and a stated provenance', async () => {
  const { writes, capture } = captureFixture()
  const fetchImpl = vi.fn(async () => page('<title>Docs</title><p>Read this.</p>'))
  const reply = await fetchWebSource('https://example.com/docs', { fetchImpl: fetchImpl as never, capture, clock, resolve: stubResolve })
  expect(reply.ok).toBe(true)
  expect(reply.source).toContain('02 Sources/Web Pages')
  expect(writes).toHaveLength(1)
  const written = writes[0] as Record<string, unknown>
  expect(written).toMatchObject({ type: 'web_page', url: 'https://example.com/docs', title: 'Docs', completeness: 'full', provider: 'web' })
  expect(String(written.content)).toContain('Fetched by OddBrain on 2026-10-20T10:00:00.000Z')
  expect(String(written.content)).toContain('No summary or interpretation was added')
  expect(String(written.content)).toContain('not proof that its claims are true')
  expect(String(written.content)).toContain('Read this.')
  expect(reply.sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(reply.bytes).toBeGreaterThan(0)
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect((fetchImpl.mock.calls[0][1] as RequestInit).credentials).toBe('omit')
  expect((fetchImpl.mock.calls[0][1] as RequestInit).redirect).toBe('manual')
})

test('a truncated page says so in the record and in the reply', async () => {
  const { writes, capture } = captureFixture()
  const reply = await fetchWebSource('https://example.com/long', { fetchImpl: async () => page(`<p>${'x'.repeat(MAX_TEXT_CHARS + 10)}</p>`) as never, capture, clock, resolve: stubResolve })
  expect(reply.ok).toBe(true)
  expect(reply.truncated).toBe(true)
  expect((writes[0] as Record<string, unknown>).completeness).toBe('partial')
  expect(String((writes[0] as Record<string, unknown>).content)).toContain('was cut at that limit')
})

test('redirects are followed only to public https, at most three times', async () => {
  const { writes, capture } = captureFixture()
  const ok = await fetchWebSource('https://example.com/start', {
    fetchImpl: (async (url: string) => url.endsWith('/start')
      ? new Response('', { status: 301, headers: { location: '/moved' } })
      : page('<p>Final</p>')) as never,
    capture, clock, resolve: stubResolve,
  })
  expect(ok.ok).toBe(true)
  expect(ok.url).toBe('https://example.com/moved')
  const firstWrite = writes.shift() as Record<string, unknown>
  expect(firstWrite.url).toBe('https://example.com/moved')

  const refused = await fetchWebSource('https://example.com/start', {
    fetchImpl: (async () => new Response('', { status: 302, headers: { location: 'http://192.168.0.9/admin' } })) as never,
    capture, clock, resolve: stubResolve,
  })
  expect(refused.ok).toBe(false)
  expect(refused.answer).toMatch(/will not follow/)

  let hops = 0
  const loop = await fetchWebSource('https://example.com/start', {
    fetchImpl: (async () => { hops += 1; return new Response('', { status: 302, headers: { location: `/again-${hops}` } }) }) as never,
    capture, clock, resolve: stubResolve,
  })
  expect(loop.ok).toBe(false)
  expect(loop.answer).toMatch(/too many times/)
  expect(hops).toBe(4)
})

test('a name that resolves inside the network is refused before anything is read', async () => {
  const { capture } = captureFixture()
  const fetchImpl = vi.fn()
  const reply = await fetchWebSource('https://intranet.example.com/secret', {
    fetchImpl: fetchImpl as never, capture, clock,
    resolve: async () => ['10.0.0.7'],
  })
  expect(reply.ok).toBe(false)
  expect(reply.answer).toMatch(/private address/)
  expect(fetchImpl).not.toHaveBeenCalled()
})

test('non-text answers, errors and oversized bodies are refused, not saved', async () => {
  const { writes, capture } = captureFixture()
  const image = await fetchWebSource('https://example.com/a.png', { fetchImpl: async () => page('binary', 'image/png') as never, capture, clock, resolve: stubResolve })
  expect(image.ok).toBe(false)
  expect(image.answer).toMatch(/not readable text/)
  const missing = await fetchWebSource('https://example.com/gone', { fetchImpl: async () => page('nope', 'text/html', 404) as never, capture, clock, resolve: stubResolve })
  expect(missing.ok).toBe(false)
  expect(missing.answer).toMatch(/404/)
  const empty = await fetchWebSource('https://example.com/empty', { fetchImpl: async () => page('<script></script>') as never, capture, clock, resolve: stubResolve })
  expect(empty.ok).toBe(false)
  const big = new Response('x'.repeat(2_000_001), { headers: { 'content-type': 'text/plain', 'content-length': '2000001' } })
  const oversized = await fetchWebSource('https://example.com/big', { fetchImpl: async () => big as never, capture, clock, resolve: stubResolve })
  expect(oversized.ok).toBe(false)
  expect(oversized.answer).toMatch(/fetch limit/)
  expect(writes).toHaveLength(0)
})

test('the vault’s never-check list and a missing report are honoured', async () => {
  const skipped = await fetchWebSource('https://example.com/x', {
    fetchImpl: async () => page('<p>x</p>') as never, clock, resolve: stubResolve,
    capture: () => ({ ok: true, skipped: true, reason: 'blacklist' }),
  })
  expect(skipped.ok).toBe(false)
  expect(skipped.answer).toMatch(/never-check list/)
  const noFile = await fetchWebSource('https://example.com/x', {
    fetchImpl: async () => page('<p>x</p>') as never, clock, resolve: stubResolve,
    capture: () => ({ ok: true }),
  })
  expect(noFile.ok).toBe(false)
  expect(noFile.answer).toMatch(/not claimed as a source/)
})

test('cancellation and a duplicate capture are reported as themselves', async () => {
  const controller = new AbortController()
  controller.abort()
  const cancelled = await fetchWebSource('https://example.com/x', { fetchImpl: async () => page('<p>x</p>') as never, capture: captureFixture().capture, clock, resolve: stubResolve }, controller.signal)
  expect(cancelled.ok).toBe(false)
  expect(cancelled.answer).toMatch(/Cancelled/)

  const duplicate = await fetchWebSource('https://example.com/x', {
    fetchImpl: async () => page('<p>x</p>') as never, clock, resolve: stubResolve,
    capture: () => ({ ok: true, source: '02 Sources/Web Pages/2026/web-same.md', duplicate: true }),
  })
  expect(duplicate.ok).toBe(true)
  expect(duplicate.duplicate).toBe(true)
  expect(duplicate.answer).toMatch(/no second file/)
  expect(researchSummary(duplicate)).toContain('web-same.md')
})
