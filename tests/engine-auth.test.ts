import { test, expect } from 'vitest'
import { authSentence, openLogin, parseClaudeAuth, readAuthStatus } from '../src/main/engine/authStatus'

const runner = (stdout: string, error: unknown = null, stderr = '') =>
  (_command: string, _args: string[], done: (error: unknown, stdout: string, stderr: string) => void): void => done(error, stdout, stderr)

test('Claude Code\'s own auth JSON is read, and its other words are not mistaken for it', () => {
  expect(parseClaudeAuth(JSON.stringify({ loggedIn: true, authMethod: 'oauth', apiProvider: 'firstParty' }))).toEqual({ loggedIn: true, method: 'oauth', provider: 'firstParty' })
  expect(parseClaudeAuth(JSON.stringify({ loggedIn: false, authMethod: 'none' }))).toEqual({ loggedIn: false, method: 'none', provider: '' })
  expect(parseClaudeAuth('not json')).toBeNull()
  expect(parseClaudeAuth(JSON.stringify({ authMethod: 'oauth' }))).toBeNull()
})

test('the sentence says signed in or names the one command that fixes it', () => {
  expect(authSentence({ loggedIn: true, method: 'oauth', provider: 'firstParty' })).toBe('Signed in with oauth (firstParty).')
  expect(authSentence({ loggedIn: false, method: '', provider: '' })).toContain('Run `claude` once in a terminal')
})

test('the CLI prints its answer on stderr; both streams are read', async () => {
  const answer = await readAuthStatus('claude-code', {
    platform: 'linux',
    command: '/usr/bin/claude',
    runner: runner('', null, JSON.stringify({ loggedIn: false, authMethod: 'none', apiProvider: 'firstParty' })),
  })
  expect(answer.ok).toBe(true)
  expect(answer.loggedIn).toBe(false)
})

test('a signed-in CLI answers through the injected runner', async () => {
  const answer = await readAuthStatus('claude-code', {
    platform: 'linux',
    command: '/usr/bin/claude',
    runner: runner(JSON.stringify({ loggedIn: true, authMethod: 'oauth', apiProvider: 'firstParty' })),
  })
  expect(answer.ok).toBe(true)
  expect(answer.loggedIn).toBe(true)
  expect(answer.answer).toContain('Signed in')
})

test('a logged-out CLI is a real answer, not a failed call', async () => {
  const answer = await readAuthStatus('claude-code', {
    platform: 'linux',
    command: '/usr/bin/claude',
    runner: runner(JSON.stringify({ loggedIn: false, authMethod: 'none', apiProvider: 'firstParty' })),
  })
  expect(answer.ok).toBe(true)
  expect(answer.loggedIn).toBe(false)
  expect(answer.answer).toContain('Not signed in')
})

test('garbage or a missing binary is reported honestly', async () => {
  const garbage = await readAuthStatus('claude-code', { platform: 'linux', command: '/usr/bin/claude', runner: runner('', new Error('spawn claude ENOENT'), '') })
  expect(garbage.ok).toBe(false)
  expect(garbage.answer).toContain('did not answer')
  const agy = await readAuthStatus('agy')
  expect(agy.ok).toBe(false)
  expect(agy.answer).toContain('does not report a sign-in state')
})

test('sign-in opens a real terminal with the quoted engine path, and reads nothing back', () => {
  const calls: Array<{ file: string; args: string[]; options: unknown }> = []
  const fakeSpawn = ((file: string, args: string[], options: unknown) => {
    calls.push({ file, args, options })
    return { on: () => undefined, unref: () => undefined }
  }) as never
  const reply = openLogin({ platform: 'win32', command: 'C:\\Program Files\\Claude\\claude.exe', spawnImpl: fakeSpawn })
  expect(reply.ok).toBe(true)
  expect(reply.answer).toContain('never sees the credentials')
  expect(calls[0].file).toBe('cmd.exe')
  expect(calls[0].args.slice(0, 5)).toEqual(['/c', 'start', 'OddBrain sign-in', 'cmd.exe', '/k'])
  expect(calls[0].args[5]).toBe('"C:\\Program Files\\Claude\\claude.exe"')
})

test('off Windows there is no invented login flow: the person is told what to run', () => {
  let spawned = false
  const reply = openLogin({ platform: 'linux', command: '/usr/bin/claude', spawnImpl: (() => { spawned = true }) as never })
  expect(spawned).toBe(false)
  expect(reply.ok).toBe(false)
  expect(reply.answer).toContain('Open a terminal')
})

test('a terminal that refuses to open is reported, not swallowed', () => {
  const reply = openLogin({
    platform: 'win32',
    command: 'claude.cmd',
    spawnImpl: (() => { throw new Error('EACCES') }) as never,
  })
  expect(reply.ok).toBe(false)
  expect(reply.answer).toContain('nothing was changed')
})
