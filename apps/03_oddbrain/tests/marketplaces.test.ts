import test from 'node:test'
import assert from 'node:assert/strict'
import {
  documentedCommands,
  marketplaceAddCommand,
  probeMarketplace,
  runMarketplaceAdd,
} from '../src/main/engine/marketplaces'

/**
 * The store design's rule: the engine installs its own things, and the
 * command surface is unproven until it is asked. These pins make both true:
 * the app reads the engine's own words, never invents a subcommand, and runs
 * nothing until the person has seen the exact line.
 */

const answer = (code: number | null, stdout = '', stderr = '') => ({ code, stdout, stderr })

test('documented subcommands are read from help text, not assumed', () => {
  const help = `Usage: claude plugin marketplace <command>\n\nCommands:\n  add <repo>      Add a marketplace\n  list            List marketplaces\n  remove <name>   Remove one`
  assert.deepEqual(documentedCommands(help).sort(), ['add', 'list', 'remove'])
})

test('a mention inside prose is not a documented command', () => {
  const help = 'This command does not support adding marketplaces by URL at this time.'
  assert.deepEqual(documentedCommands(help), [])
})

test('a build that lacks the command is reported as unsupported, in its own words', async () => {
  const probe = await probeMarketplace('claude-code', 'C:\\tools\\claude.cmd', async () =>
    answer(1, '', 'error: unknown command \'marketplace\''),
  )
  assert.equal(probe.state, 'unsupported')
  assert.match(probe.answer, /does not answer "plugin marketplace"/)
  assert.match(probe.answer, /unknown command/)
  assert.deepEqual(probe.commands, [])
})

test('a build that documents it is reported as supported with the real subcommands', async () => {
  const probe = await probeMarketplace('claude-code', 'claude', async (_file, args) => {
    assert.deepEqual(args, ['plugin', 'marketplace', '--help'])
    return answer(0, 'Commands:\n  add <repo>\n  list')
  })
  assert.equal(probe.state, 'supported')
  assert.deepEqual(probe.commands.sort(), ['add', 'list'])
})

test('a missing engine is not-installed, never a made-up answer', async () => {
  const probe = await probeMarketplace('agy', null)
  assert.equal(probe.state, 'not-installed')
  assert.match(probe.answer, /not installed/)
})

test('a process that never answers is no-answer, with what it did say', async () => {
  const probe = await probeMarketplace('claude-code', 'claude', async () => ({ code: null, stdout: 'starting…', stderr: 'The engine did not answer in time.', failed: true }))
  assert.equal(probe.state, 'no-answer')
  assert.match(probe.answer, /The engine did not answer in time/)
})

test('the add command is the engine\'s own, and refuses anything that is not one line', () => {
  assert.deepEqual(marketplaceAddCommand('claude-code', 'acme/plugins'), ['plugin', 'marketplace', 'add', 'acme/plugins'])
  assert.equal(marketplaceAddCommand('claude-code', ''), null)
  assert.equal(marketplaceAddCommand('claude-code', 'a\nb'), null)
  // agy has no documented marketplace surface yet: no invented command.
  assert.equal(marketplaceAddCommand('agy', 'anything'), null)
})

test('adding runs verbatim and returns the engine\'s own words', async () => {
  const calls: string[][] = []
  const result = await runMarketplaceAdd('claude-code', 'claude', 'acme/plugins', async (_file, args) => {
    calls.push(args)
    return answer(0, 'added marketplace acme/plugins')
  })
  assert.equal(result.ok, true)
  assert.deepEqual(calls, [['plugin', 'marketplace', 'add', 'acme/plugins']])
  assert.match(result.answer, /added marketplace/)
  assert.deepEqual(result.command, ['claude', 'plugin', 'marketplace', 'add', 'acme/plugins'])
})

test('a refusal is passed through, not softened into success', async () => {
  const result = await runMarketplaceAdd('claude-code', 'claude', 'acme/plugins', async () => answer(1, '', 'fatal: repository not found'))
  assert.equal(result.ok, false)
  assert.match(result.answer, /repository not found/)
})

test('agy cannot be handed an add command it does not document', async () => {
  const result = await runMarketplaceAdd('agy', 'agy', 'anything', async () => answer(0, 'should never run'))
  assert.equal(result.ok, false)
  assert.deepEqual(result.command, [])
})
