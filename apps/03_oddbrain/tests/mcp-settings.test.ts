import { test, expect } from 'vitest'
import { describeMcpServer, mcpServerProblem, normalizeMcpServers, parseMcpArgs, readMcpList } from '../src/shared/lib/mcp'

test('a local tool server needs a name and a command, and accepts plain arguments', () => {
  expect(mcpServerProblem({ name: 'files', command: 'npx', args: ['-y', 'files-mcp'] })).toBe('')
  expect(mcpServerProblem({ name: 'files' })).toContain('command for a local server')
  expect(mcpServerProblem({ name: 'bad name!', command: 'npx' })).toContain('Server names')
  expect(mcpServerProblem({ name: 'both', command: 'npx', url: 'https://example.com/mcp' })).toContain('not both')
  expect(mcpServerProblem({ name: 'lines', command: 'npx\nrm -rf /' })).toContain('line break')
})

test('a remote tool server uses https, and http only on this machine', () => {
  expect(mcpServerProblem({ name: 'remote', url: 'https://example.com/mcp' })).toBe('')
  expect(mcpServerProblem({ name: 'local', url: 'http://127.0.0.1:3001/mcp' })).toBe('')
  expect(mcpServerProblem({ name: 'local', url: 'http://localhost:3001/mcp' })).toBe('')
  expect(mcpServerProblem({ name: 'plain', url: 'http://example.com/mcp' })).toContain('https')
  expect(mcpServerProblem({ name: 'junk', url: 'not a url' })).toContain('not a URL')
})

test('arguments parse with quotes and escapes; a JSON array is accepted too', () => {
  expect(parseMcpArgs('')).toEqual({ ok: true, args: [], problem: '' })
  expect(parseMcpArgs('-y pkg@latest').args).toEqual(['-y', 'pkg@latest'])
  expect(parseMcpArgs('"two words" plain').args).toEqual(['two words', 'plain'])
  expect(parseMcpArgs("'single quoted' x").args).toEqual(['single quoted', 'x'])
  expect(parseMcpArgs('one\\ two').args).toEqual(['one two'])
  expect(parseMcpArgs('["-y","pkg"]')).toEqual({ ok: true, args: ['-y', 'pkg'], problem: '' })
  expect(parseMcpArgs('"unclosed').ok).toBe(false)
})

test('the stored list rejects duplicates and unusable entries instead of writing them', () => {
  const good = { name: 'one', command: 'npx' }
  const normalized = normalizeMcpServers([good, { name: 'one', command: 'other' }, { name: 'two', url: 'javascript:alert(1)' }])
  expect(normalized.servers.map(server => server.name)).toEqual(['one'])
  expect(normalized.problems.length).toBeGreaterThan(0)
  expect(normalizeMcpServers('not a list').problems).toHaveLength(1)
  expect(describeMcpServer({ name: 'one', command: 'npx', args: ['-y', 'pkg'] })).toBe('npx -y pkg')
  expect(describeMcpServer({ name: 'remote', url: 'https://example.com/mcp' })).toBe('https://example.com/mcp')
})

test('an unreadable saved list is reported, never shown as an empty one', () => {
  expect(readMcpList('{"servers":[{"name":"files","command":"npx"}]}')).toEqual({ servers: [{ name: 'files', command: 'npx' }], problem: '' })
  expect(readMcpList('{"servers":[]}').problem).toBe('')
  expect(readMcpList('{ not json').servers).toEqual([])
  expect(readMcpList('{ not json').problem).toContain('could not be read')
  expect(readMcpList('{"servers":"files"}').problem).toContain('cannot use')
  expect(readMcpList('{"servers":[{"name":"FILES","command":"npx"}]}').problem).toContain('cannot use')
})

test('the name rule matches what the engines will actually be given', () => {
  // Deploy normalises names; a name that would change on the way is refused here.
  expect(mcpServerProblem({ name: 'my.server', command: 'npx' })).toContain('lowercase')
  expect(mcpServerProblem({ name: 'My Server', command: 'npx' })).toContain('lowercase')
  expect(mcpServerProblem({ name: 'mcp_files-1', command: 'npx' })).toBe('')
})
