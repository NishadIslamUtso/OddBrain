import { afterEach, describe, expect, test } from 'vitest'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanTextHazards } from '../src/shared/lib/textHazards'
import { executionConfigRisk } from '../src/shared/lib/executionConfig'
import { censusWorkspaceSymlinks } from '../src/main/commands/symlinkCensus'
import { inspectNativeLaunch } from '../src/main/engine/nativeLaunchInventory'
import { sanitizeEnvironment } from '../src/main/engine/claudeCode'
import { createEngineSocket } from '../src/main/engine/socket'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'
import { transcriptMarkdown, type Transcript } from '../src/shared/lib/transcripts'
import { createCatalogInstallReview } from '../src/main/engine/skillCatalogInstall'

const fixtureRoot = fileURLToPath(new URL('./fixtures/adversarial', import.meta.url))
const roots: string[] = []
const temp = () => { const root = mkdtempSync(join(tmpdir(), 'oddbrain-adversarial-')); roots.push(root); return root }
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

describe('adversarial context fixtures', () => {
  test('invisible text is counted and revealed without changing the canonical fixture', () => {
    const file = join(fixtureRoot, '.agents', 'rules', 'invisible.md')
    const exact = readFileSync(file, 'utf8'), report = scanTextHazards(exact)
    expect(report.findings.map(item => item.kind)).toEqual(expect.arrayContaining(['bidi-controls', 'zero-width']))
    expect(report.findings.flatMap(item => item.excerpts).join('\n')).toContain('⟦U+202E⟧')
    expect(scanTextHazards(`left\u200f${'\u{E0100}'.repeat(4)}right`).findings.map(item => item.kind)).toEqual(expect.arrayContaining(['bidi-controls', 'variation-run']))
    expect(readFileSync(file, 'utf8')).toBe(exact)
  })

  test('execution-sensitive paths explain delayed execution risk', () => {
    expect(executionConfigRisk('/work/.mcp.json')).toContain('MCP servers')
    expect(executionConfigRisk('C:\\repo\\.git\\hooks\\pre-commit')).toContain('Git hooks')
    expect(executionConfigRisk('/work/notes.md')).toBe('')
  })

  test.skipIf(process.platform === 'win32')('bounded command review sees outside and engine-config links without following them', () => {
    const root = temp(), outside = temp()
    mkdirSync(join(root, '.claude'), { recursive: true }); writeFileSync(join(root, '.claude', 'settings.json'), '{}')
    const ordinary = censusWorkspaceSymlinks(root).digest
    writeFileSync(join(root, 'ordinary-output.txt'), 'created by a reviewed step')
    mkdirSync(join(root, 'dist'))
    expect(censusWorkspaceSymlinks(root).digest).toBe(ordinary)
    symlinkSync(outside, join(root, 'outside-link'))
    symlinkSync(join(root, '.claude', 'settings.json'), join(root, 'engine-config-link'))
    const census = censusWorkspaceSymlinks(root)
    expect(census.digest).not.toBe(ordinary)
    expect(census.observedLinks).toBe(2)
    expect(census.links.find(link => link.path === 'outside-link')?.outsideWorkspace).toBe(true)
    expect(census.links.find(link => link.path === 'engine-config-link')?.executionSensitive).toBe(true)
    expect(census.notice).toContain('not confinement')
  })

  test('native launch inventory binds poisoned MCP, hostile rules and hooks to one digest', () => {
    const root = temp(), home = temp()
    cpSync(fixtureRoot, root, { recursive: true })
    mkdirSync(join(root, '.git', 'hooks'), { recursive: true }); writeFileSync(join(root, '.git', 'config'), '[core]\n')
    writeFileSync(join(root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n')
    const first = inspectNativeLaunch('claude-code', root, home)
    expect(first.connectorFiles).toBe(1); expect(first.ruleFiles).toBeGreaterThanOrEqual(2); expect(first.hookFiles).toBe(2)
    expect(first.files.some(file => file.textHazards > 0)).toBe(true)
    writeFileSync(join(root, '.mcp.json'), '{"mcpServers":{}}')
    expect(inspectNativeLaunch('claude-code', root, home).digest).not.toBe(first.digest)
  })

  test('skill review shows exact-byte hashes and warns without rewriting instructions', async () => {
    const root = temp(), original = Buffer.from('---\nname: docx\ndescription: fixture\n---\nReview \u0000 and \u202e carefully.\n')
    const service = createCatalogInstallReview(() => ({ targets: { claudeSkillsDir: join(root, 'claude'), agySkillsDir: join(root, 'agy') }, authority: 'fixture' }), fetch,
      async () => ({ revision: 'a'.repeat(40), files: new Map([['SKILL.md', original]]) }))
    const review = await service.plan('docx')
    expect(review.fileDigests[0]).toMatchObject({ path: 'SKILL.md', bytes: original.length })
    expect(review.fileDigests[0].sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(review.hazards[0].report.total).toBeGreaterThanOrEqual(2)
    expect(review.manifest).toBe(original.toString('utf8'))
    service.cancel()
  })

  test('ambient credential and process-injection variables do not reach native engines', () => {
    expect(sanitizeEnvironment({ PATH: '/bin', HOME: '/home/me', OPENAI_API_KEY: 'secret', AWS_SECRET_ACCESS_KEY: 'secret', CLAUDE_CODE_OAUTH_TOKEN: 'secret', NODE_OPTIONS: '--require evil', LD_PRELOAD: '/evil' })).toEqual({ PATH: '/bin', HOME: '/home/me' })
  })

  test('the next-turn receipt distinguishes fresh, resumed and live native context', () => {
    const remembered = new Map<string, string>(), socket = createEngineSocket({ load: key => remembered.get(key) || '', save: (key, id) => { remembered.set(key, id) } })
    const target = { settings: DEFAULT_ENGINE, cwd: resolve('/tmp/fresh'), chatId: 'chat-1' }
    expect(socket.nextSession(target).state).toBe('fresh')
    remembered.set(`v2:${JSON.stringify([DEFAULT_ENGINE.id, target.cwd, target.chatId])}`, 'saved-native-id')
    expect(socket.nextSession(target).state).toBe('resumed')
  })

  test('transcript export attributes owner words separately from the app envelope', () => {
    const turn: Transcript = {
      userPrompt: 'owner words', prompt: 'OddBrain app instructions:\napp words\n\nowner words',
      header: { id: 'id', at: '2026-10-20T00:00:00Z', engine: 'claude-code', model: '', workspace: '/work', title: 'receipt', pictures: 0 },
      events: [{ kind: 'done', text: 'answer' }], state: 'done', incomplete: false,
    }
    const markdown = transcriptMarkdown(turn)
    expect(markdown).toContain('## You\n\nowner words')
    expect(markdown).toContain('## Exact text dispatched to the native engine')
    expect(markdown).toContain('not all attributed to “You”')
  })
})
