import test from 'node:test'
import assert from 'node:assert/strict'
import { displayCommandLine } from '../src/shared/lib/commandLine'

/**
 * The real machine's username is three words with spaces in it. The card
 * shows the exact installer command and copies it for the owner's own
 * terminal — an unquoted path there is a command that cannot run, which is
 * precisely what the owner hit with the claude-code install.ps1 line.
 */
test('pieces with spaces are quoted, plain pieces are not', () => {
  assert.equal(displayCommandLine(['powershell', '-File', 'C:\\Users\\Nishad Islam Utso\\x.ps1']), 'powershell -File "C:\\Users\\Nishad Islam Utso\\x.ps1"')
})

test('a piece with no spaces stays untouched', () => {
  assert.equal(displayCommandLine(['npm', 'install', '-g', '@anthropic-ai/claude-code']), 'npm install -g @anthropic-ai/claude-code')
})

test('an empty command line is empty, not "undefined"', () => {
  assert.equal(displayCommandLine([]), '')
})

test('embedded double quotes are dropped rather than allowed to break the quoting', () => {
  assert.equal(displayCommandLine(['say "hi" now']), '"say hi now"')
})
