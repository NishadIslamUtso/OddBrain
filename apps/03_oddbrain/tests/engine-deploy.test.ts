import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  deployMcp,
  deploySkill,
  mcpForAgy,
  mcpForClaude,
  parseSkillMd,
  scanClaudeSkills,
  toAgySkill,
  toClaudeSkill,
} from '../src/main/engine/deploy'

/**
 * One vault, every engine. A skill written once in the app must land in
 * Claude Code's own folder AND agy's own folder, in the exact shape each
 * engine reads — and an existing Claude Code skills folder must import
 * cleanly, because the owner already has eleven skills there.
 */
test('skills: markdown with frontmatter parses in either spelling', () => {
  const withFrontmatter = parseSkillMd('---\nname: Lint House\ndescription: Run the linters\n---\n\nDo the lint dance.')
  assert.equal(withFrontmatter.name, 'lint-house')
  assert.equal(withFrontmatter.description, 'Run the linters')
  assert.equal(withFrontmatter.body, 'Do the lint dance.')
  const withTitle = parseSkillMd('# Deploy Friday\n\nShip it.')
  assert.equal(withTitle.name, 'deploy-friday', 'the title names the skill when frontmatter is silent')
  assert.match(withTitle.body, /# Deploy Friday/, 'the heading itself stays content')
  assert.match(withTitle.body, /Ship it\./)
})

test('skills: each engine gets its own exact shape, from one vault entry', () => {
  const skill = { name: 'Lint House', description: 'Run the linters', body: 'Do the lint dance.' }
  const claude = toClaudeSkill(skill)
  assert.match(claude.relative, /lint-house[/\\]SKILL\.md$/)
  assert.match(claude.content, /^---\nname: lint-house\ndescription: Run the linters\n---/)
  const agy = toAgySkill(skill)
  assert.equal(agy.relative, 'lint-house.md', 'agy: the file name is the slash command')
  assert.match(agy.content, /Do the lint dance\./)
})

test('skills: a deploy writes both engines from one call, creating folders as needed', () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-deploy-'))
  try {
    const claudeDir = join(root, 'claude', 'skills')
    const agyDir = join(root, 'work', '.agents', 'skills')
    const written = deploySkill(
      { name: 'Lint House', description: 'Run the linters', body: 'Do the lint dance.' },
      { claudeSkillsDir: claudeDir, agySkillsDir: agyDir },
    )
    assert.equal(written.length, 2)
    assert.match(readFileSync(written[0], 'utf8'), /name: lint-house/)
    assert.match(readFileSync(written[1], 'utf8'), /Do the lint dance\./)
    // Names that could not be a folder or a command are cleaned, not trusted.
    const rough = deploySkill(
      { name: '../../etc/passwd', description: 'nope', body: 'never' },
      { claudeSkillsDir: claudeDir, agySkillsDir: agyDir },
    )
    assert.doesNotMatch(rough[0], /etc[/\\]passwd/)
    assert.match(rough[0], /etcpasswd|etc-passwd/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('skills: an existing Claude Code folder imports cleanly (his eleven skills)', () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-scan-'))
  try {
    const dir = join(root, 'skills')
    mkdirSync(join(dir, 'commit-helper'), { recursive: true })
    writeFileSync(
      join(dir, 'commit-helper', 'SKILL.md'),
      '---\nname: commit-helper\ndescription: Write the commit message\n---\n\nLook at the diff.',
      'utf8',
    )
    mkdirSync(join(dir, 'broken-one'), { recursive: true })
    // A folder with no SKILL.md is skipped, never fatal.
    const found = scanClaudeSkills(dir)
    assert.equal(found.length, 1)
    assert.equal(found[0].name, 'commit-helper')
    assert.match(found[0].body, /diff/)
    // An empty or missing folder scans to nothing, never a crash.
    assert.deepEqual(scanClaudeSkills(join(root, 'nowhere')), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('mcp: one list, two native formats, local and remote servers', () => {
  const servers = [
    { name: 'files', command: 'npx', args: ['files-mcp'] },
    { name: 'search', url: 'https://mcp.example.com' },
    { name: 'junk;;', command: 'rm' }, // cleaned to a safe name or dropped
  ]
  const claude = JSON.parse(mcpForClaude(servers)) as Record<string, Record<string, unknown>>
  assert.deepEqual(claude.mcpServers['files'], { command: 'npx', args: ['files-mcp'] })
  assert.deepEqual(claude.mcpServers['search'], { type: 'http', url: 'https://mcp.example.com' })
  assert.ok(claude.mcpServers['junk'], 'cleaned name survives')
  assert.equal(claude.mcpServers['junk;;'], undefined)

  const agy = JSON.parse(mcpForAgy(servers)) as Record<string, Record<string, unknown>>
  assert.deepEqual(agy.mcpServers['files'], { command: 'npx', args: ['files-mcp'] })
  assert.deepEqual(agy.mcpServers['search'], { remote: { url: 'https://mcp.example.com' } })

  // Nothing usable in, nothing dangerous out.
  assert.deepEqual(JSON.parse(mcpForClaude([{ name: '', command: '' }])), { mcpServers: {} })
})

test('mcp: a deploy writes both config files into the workspace', () => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-mcp-'))
  try {
    const written = deployMcp([{ name: 'files', command: 'npx', args: ['files-mcp'] }], root)
    assert.equal(written.length, 2)
    assert.match(readFileSync(join(root, '.mcp.json'), 'utf8'), /files-mcp/)
    assert.match(readFileSync(join(root, '.agents', 'mcp_config.json'), 'utf8'), /files-mcp/)
    assert.ok(readdirSync(join(root, '.agents')).includes('mcp_config.json'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
