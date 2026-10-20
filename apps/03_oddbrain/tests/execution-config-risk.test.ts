// @vitest-environment node
import { expect, test } from 'vitest'
import { executionConfigRisk, anyExecutionConfigRisk } from '../src/shared/lib/executionConfig'
import { createEngineParser } from '../src/main/engine/stream'

/**
 * Kiro's 2026 bug was not "the model ran a command". It was "the model wrote the
 * file that names the command, and the tool reloaded it". The app cannot stop
 * that inside a native engine, but its approval card must never present such a
 * write as an ordinary edit.
 */
test('the files that decide what runs are named, with a reason', () => {
  const dangerous = [
    '/work/.mcp.json',
    '/work/.agents/mcp_config.json',
    '/home/me/.kiro/settings/mcp.json',
    '/work/.claude/settings.json',
    '/work/.claude/settings.local.json',
    '/home/me/.claude.json',
    '/work/.vscode/tasks.json',
    '/work/.vscode/settings.json',
    '/work/.git/hooks/pre-commit',
    '/work/.git/config',
    '/work/.husky/pre-push',
    '/home/me/.zshrc',
    '/home/me/.bashrc',
    '/home/me/.profile',
    'C:\\Users\\me\\Documents\\PowerShell\\Microsoft.PowerShell_profile.ps1',
    '/work/package.json',
    '/work/.npmrc',
    '/work/.github/workflows/checks.yml',
    '/work/pyproject.toml',
    '/work/setup.py',
    '/work/Makefile',
  ]
  for (const path of dangerous) {
    const risk = executionConfigRisk(path)
    expect(risk, path).toContain('Execution-sensitive file')
    expect(risk, path).toContain('not as a preference')
  }
  // Windows separators resolve to the same judgement.
  expect(executionConfigRisk('C:\\work\\.vscode\\tasks.json')).toContain('VS Code runs these tasks')
  // Ordinary source and notes are ordinary.
  for (const path of ['/work/src/app.tsx', '/work/README.md', '/work/docs/package.json.md', '/work/.gitignore', '/work/src/config.ts'])
    expect(executionConfigRisk(path), path).toBe('')
  expect(executionConfigRisk('')).toBe('')
  expect(executionConfigRisk(undefined as unknown as string)).toBe('')
  expect(anyExecutionConfigRisk(['/work/a.ts', '/work/.mcp.json'])).toContain('MCP servers')
  expect(anyExecutionConfigRisk(['/work/a.ts'])).toBe('')
})

const events = (line: string) => { const parser = createEngineParser(); parser.beginTurn(); return [...parser.feed(line + '\n'), ...parser.flush()] }
test('an engine request to edit mcp.json carries the warning; an ordinary edit does not', () => {
  const request = (file: string) => JSON.stringify({
    type: 'control_request',
    request_id: 'req-1',
    request: { subtype: 'can_use_tool', tool_name: 'Write', input: { file_path: file, content: '{"mcpServers":{}}' } },
  })
  const flagged = events(request('/work/.mcp.json'))
  const permission = flagged.find(event => event.kind === 'permission')
  expect(permission).toMatchObject({ kind: 'permission', tool: 'Write', file: '/work/.mcp.json' })
  expect(permission && 'risk' in permission ? permission.risk : '').toContain('Execution-sensitive file')

  const ordinary = events(request('/work/src/index.ts'))
  const plain = ordinary.find(event => event.kind === 'permission')
  expect(plain && 'risk' in plain ? plain.risk : '').toBe('')
  // An approval request with no file at all is untouched.
  const noFile = events(JSON.stringify({ type: 'control_request', request_id: 'r2', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'ls' } } }))
  const bash = noFile.find(event => event.kind === 'permission')
  expect(bash && 'risk' in bash ? bash.risk : '').toBe('')
})
