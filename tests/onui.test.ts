import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createVaultService } from '../src/main/vault/service'
import { handleVaultRequest } from '../src/main/vault/routes'
import { LOCAL_API_ROUTES } from '../src/main/api/guard'
import { BROWSER_PAGE_SKILL, LOCAL_DOOR, deployBuiltInSkills } from '../src/main/engine/vaultSkills'
import { toClaudeSkill, toAgySkill } from '../src/main/engine/deploy'

/**
 * onui — A.6, the engine querying the browser honestly.
 *
 * The rule the whole app lives by: never invented data. The engine asks a
 * local door; the door answers only with what the capture pipeline actually
 * wrote, and a visit-only line is answered as exactly that. These tests read
 * through the same routes table the engine's curl reaches (the app's API and
 * the extension's port share it), plus the skill files that teach the door.
 */

const CLOCK = (): Date => new Date('2026-10-10T19:00:00Z')
const YEAR = '2026'
const MONTH = '10'

function fixture(t: { after: (fn: () => unknown) => void }): ReturnType<typeof createVaultService> {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-onui-'))
  mkdirSync(join(root, '00 System'), { recursive: true })
  writeFileSync(
    join(root, '00 System/Privacy & Access.md'),
    '# Privacy\n\n```yaml\nexcluded_patterns:\n  - bank.com/*\n```\n'
  )
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return createVaultService({ vaultPath: root, clock: CLOCK })
}

test('onui with no browser capture at all answers "nothing", never a made-up page', t => {
  const service = fixture(t)
  const answer = service.onui() as { page: unknown; message: string }
  assert.equal(answer.page, null)
  assert.match(answer.message, /No browser capture yet/)
})

test('the latest web_page capture is the page: url, title and the readable content', t => {
  const service = fixture(t)
  service.capture({
    type: 'web_page',
    url: 'https://example.com/tea',
    title: 'On tea',
    content: 'Tea is leaves and hot water.',
    captured_at: '2026-10-10T18:00:00Z',
  })
  const answer = service.onui() as {
    page: { url: string; title: string; content: string; capture_status: string; source: string }
  }
  assert.equal(answer.page.url, 'https://example.com/tea')
  assert.equal(answer.page.title, 'On tea')
  assert.equal(answer.page.capture_status, 'content-captured')
  assert.match(answer.page.content, /Tea is leaves and hot water\./)
  assert.ok(answer.page.source.includes('02 Sources/Browser Activity'))
})

test('the newest line wins: a later visit-only capture hides the older page text', t => {
  const service = fixture(t)
  service.capture({ type: 'web_page', url: 'https://example.com/a', content: 'Old content.' })
  service.capture({ type: 'browser_visit', url: 'https://example.com/b', title: 'Just a visit' })
  const answer = service.onui() as {
    page: { url: string; capture_status: string; note?: string; content?: string }
  }
  assert.equal(answer.page.url, 'https://example.com/b')
  assert.equal(answer.page.capture_status, 'visit-only')
  assert.equal(answer.page.content, undefined)
  assert.match(answer.page.note ?? '', /never captured/)
})

test('the content rides along capped: a huge capture is truncated and flagged', t => {
  const service = fixture(t)
  service.capture({ type: 'web_page', url: 'https://example.com/big', content: 'x'.repeat(12_500) })
  const answer = service.onui() as { page: { content: string; content_truncated?: boolean } }
  assert.equal(answer.page.content.length, 12_000)
  assert.equal(answer.page.content_truncated, true)
})

test('a blacklisted page was never written, so it can never be the answer', t => {
  const service = fixture(t)
  const result = service.capture({ type: 'web_page', url: 'https://bank.com/x', content: 'secret' })
  assert.equal(result.skipped, true)
  const answer = service.onui() as { page: unknown }
  assert.equal(answer.page, null)
})

test('the route table serves onui on the door the extension shares', t => {
  const service = fixture(t)
  const reply = handleVaultRequest(service, { route: '/onui', method: 'GET', query: new URLSearchParams() })
  assert.equal(reply.status, 200)
  const answer = reply.body as { page: unknown; message: string }
  assert.equal(answer.page, null)
  const refused = handleVaultRequest(service, { route: '/onui', method: 'POST', query: new URLSearchParams() })
  assert.equal(refused.status, 405)
})

test('the renderer guard allows the same read and nothing wider', () => {
  assert.deepEqual(LOCAL_API_ROUTES.get('/api/vault/onui'), ['GET'])
})

test('the built-in skill teaches the door, its honesty rules, and deploys as both engines read skills', () => {
  assert.ok(BROWSER_PAGE_SKILL.body.includes(`${LOCAL_DOOR}/onui`))
  assert.match(BROWSER_PAGE_SKILL.body, /visit-only/)
  assert.match(BROWSER_PAGE_SKILL.body, /read-only/i)
  const claude = toClaudeSkill(BROWSER_PAGE_SKILL)
  const agy = toAgySkill(BROWSER_PAGE_SKILL)
  assert.match(claude.content, /onui/)
  assert.match(agy.content, /onui/)
})

test('deployBuiltInSkills writes only where an engine already lives', t => {
  const home = mkdtempSync(join(tmpdir(), 'oddbrain-onui-home-'))
  const workspace = mkdtempSync(join(tmpdir(), 'oddbrain-onui-ws-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  t.after(() => rmSync(workspace, { recursive: true, force: true }))
  // No ~/.claude and no workspace .agents yet: nothing may be invented.
  const none = deployBuiltInSkills({ claudeSkillsDir: join(home, '.claude', 'skills'), agySkillsDir: join(workspace, '.agents', 'skills') })
  assert.equal(none.length, 0)
  assert.equal(existsSync(join(home, '.claude')), false)
  // Once the folders exist (a real engine was installed), the skill lands.
  mkdirSync(join(home, '.claude'), { recursive: true })
  mkdirSync(join(workspace, '.agents'), { recursive: true })
  const written = deployBuiltInSkills({ claudeSkillsDir: join(home, '.claude', 'skills'), agySkillsDir: join(workspace, '.agents', 'skills') })
  assert.equal(written.length, 2)
  const claudeFile = readFileSync(join(home, '.claude', 'skills', 'browser-page', 'SKILL.md'), 'utf8')
  const agyFile = readFileSync(join(workspace, '.agents', 'skills', 'browser-page.md'), 'utf8')
  assert.match(claudeFile, /onui/)
  assert.match(agyFile, /onui/)
})
