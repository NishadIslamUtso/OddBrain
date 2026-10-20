import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createVaultService } from '../src/main/vault/service'
import { handleVaultRequest } from '../src/main/vault/routes'

const roots: string[] = []
const setup = () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-research-')); roots.push(root); mkdirSync(join(root, 'vault'))
  const service = createVaultService({ vaultPath: join(root, 'vault') }), files = service.files()
  return { files, service }
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

describe('saved-source research route', () => {
  it('returns bounded exact excerpts with stable IDs, ranges, provenance and hashes', () => {
    const { files, service } = setup()
    const body = '\nThe opening is retained.\nA lunar orchard uses patient irrigation and careful notes.\nThe ending is retained.\n'
    files.write('07 Sources/2026/10/orchard.md', `---\ntitle: Lunar orchard field notes\nurl: https://example.test/orchard\ncaptured_at: 2026-10-19T10:00:00.000Z\ncompleteness: Reader text selected by the person\n---\n${body}`)

    const reply = handleVaultRequest(service, { route: '/research', method: 'GET', query: new URLSearchParams({ q: 'lunar orchard irrigation' }) })
    expect(reply.status).toBe(200)
    const result = reply.body as any
    expect(result.retrieval).toBe('local-saved-source-search')
    expect(result.packet.length).toBeLessThanOrEqual(3900)
    expect(result.sources).toHaveLength(1)
    const source = result.sources[0]
    expect(source).toMatchObject({ id: '[S1]', title: 'Lunar orchard field notes', url: 'https://example.test/orchard', path: '07 Sources/2026/10/orchard.md', completeness: 'Reader text selected by the person' })
    expect(body.slice(source.excerptStart, source.excerptEnd)).toBe(source.excerpt)
    expect(source.sourceSha256).toBe(sha(body))
    expect(source.excerptSha256).toBe(sha(source.excerpt))
    expect(result.packet).toContain('not live web research')
    expect(result.packet).toContain('"id": "[S1]"')
  })

  it('uses retained conversation revision text, not normalized recall snippets', () => {
    const { files, service } = setup()
    const text = 'First line exactly.\n\nThe zephyr calibration reading was 17.250 units.\nLast line exactly.'
    const conversation = { provider: 'local-engine', adapter: 'test', key: 'calibration', title: 'Calibration chat', url: 'https://chat.example.test/c/1' }
    const message = { id: 'turn-1', role: 'assistant', speaker: 'Assistant', text, timestamp: '2026-10-18T11:12:13.000Z', model: '', reply_to: '', identity: 'native', status: 'observed', attachments: [] }
    service.conversationSync({ op: 'messages', url: conversation.url, conversation, messages: [message], order: [message.id] })

    const result = handleVaultRequest(service, { route: '/research', method: 'GET', query: new URLSearchParams({ q: 'zephyr calibration' }) }).body as any
    const source = result.sources[0]
    expect(source.kind).toBe('saved-conversation')
    expect(text.slice(source.excerptStart, source.excerptEnd)).toBe(source.excerpt)
    expect(source.sourceSha256).toBe(sha(text))
    expect(source.speaker).toContain('local-engine')
  })

  it('does not turn private, confirmed, oversized, or unreadable records into citations', () => {
    const { files, service } = setup()
    files.write('00 System/Privacy & Access.md', '---\nexcluded_patterns: ["private.example/*"]\n---\n')
    files.write('07 Sources/private.md', '---\ntitle: Private comet record\nurl: https://private.example/page\n---\nsecret comet phrase')
    files.write('03 Memory/Confirmed/confirmed.md', 'A confirmed comet interpretation is not a direct source quotation.')
    files.write('07 Sources/huge.md', `---\ntitle: Huge comet record\n---\ncomet ${'x'.repeat(4_000_001)}`)

    const result = handleVaultRequest(service, { route: '/research', method: 'GET', query: new URLSearchParams({ q: 'comet' }) }).body as any
    expect(result.sources).toEqual([])
    expect(result.packet).toBe('')
    expect(result.incomplete).toBe(true)
    expect(result.notices.join(' ')).toMatch(/interpretations|limit|No matching saved original/i)
  })

  it('refuses an empty query instead of enumerating vault sources', () => {
    const { service } = setup()
    const reply = handleVaultRequest(service, { route: '/research', method: 'GET', query: new URLSearchParams() })
    expect(reply.status).toBe(400)
    expect((reply.body as any).ok).toBe(false)
    expect((reply.body as any).sources).toEqual([])
  })
})
