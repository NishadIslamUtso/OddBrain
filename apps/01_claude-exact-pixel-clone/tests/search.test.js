import { test } from 'node:test'
import assert from 'node:assert/strict'
import { highlightParts, searchChats } from '../src/lib/search.js'

const chat = (id, title, messages) => ({ id, title, messages, updatedAt: 1 })

test('finds a chat by message body even when the title is unrelated', () => {
  const chats = [
    chat('a', 'Untitled', [{ id: 'm1', role: 'user', content: 'how do I fix a leaking tap' }]),
    chat('b', 'Cooking', [{ id: 'm2', role: 'user', content: 'best pasta recipe' }]),
  ]
  const found = searchChats(chats, 'leaking tap')
  assert.equal(found.length, 1)
  assert.equal(found[0].chat.id, 'a')
  assert.equal(found[0].matches[0].snippet.includes('leaking tap'), true)
})

test('a title match still counts, so behaviour never regresses', () => {
  const chats = [chat('a', 'Vault notes', [{ id: 'm1', role: 'user', content: 'nothing relevant' }])]
  const found = searchChats(chats, 'vault')
  assert.equal(found.length, 1)
  assert.equal(found[0].titleHit, true)
  assert.equal(found[0].matches.length, 0)
})

test('all terms must match, and matching is case-insensitive', () => {
  const chats = [chat('a', 'T', [
    { id: 'm1', role: 'user', content: 'Fix The Tap' },
    { id: 'm2', role: 'user', content: 'Fix the sink' },
  ])]
  assert.equal(searchChats(chats, 'fix tap').length, 1)
  assert.equal(searchChats(chats, 'fix tap')[0].matches[0].messageId, 'm1')
  assert.equal(searchChats(chats, 'fix dishwasher').length, 0)
})

test('title matches sort before body-only matches', () => {
  const chats = [
    chat('body', 'Unrelated', [{ id: 'm1', role: 'user', content: 'alpha beta' }]),
    chat('title', 'Alpha beta', [{ id: 'm2', role: 'user', content: 'nothing' }]),
  ]
  assert.equal(searchChats(chats, 'alpha')[0].chat.id, 'title')
})

test('an empty or whitespace query returns nothing', () => {
  const chats = [chat('a', 'T', [{ id: 'm1', role: 'user', content: 'hello' }])]
  assert.equal(searchChats(chats, '').length, 0)
  assert.equal(searchChats(chats, '   ').length, 0)
})

test('malformed chats do not throw', () => {
  assert.deepEqual(searchChats(null, 'x'), [])
  assert.deepEqual(searchChats(undefined, 'x'), [])
  assert.deepEqual(searchChats([{ title: null }, null], 'x'), [])
  assert.deepEqual(searchChats([chat('a', 'T', [{ id: 'm1', content: null }])], 'x'), [])
})

test('long messages produce a bounded snippet with ellipses', () => {
  const long = `${'filler '.repeat(200)}needle here ${'more '.repeat(200)}`
  const found = searchChats([chat('a', 'T', [{ id: 'm1', role: 'user', content: long }])], 'needle')
  const snippet = found[0].matches[0].snippet
  assert.equal(snippet.includes('needle'), true, 'snippet contains the match')
  assert.ok(snippet.length <= 145, `snippet is bounded, got ${snippet.length}`)
  assert.equal(snippet.startsWith('…'), true, 'leading ellipsis when trimmed')
})

test('regex metacharacters in a query are treated as literal text', () => {
  // A query of ".*" must not match everything; it must match only literal ".*".
  const chats = [chat('a', 'T', [{ id: 'm1', role: 'user', content: 'plain words here' }])]
  assert.equal(searchChats(chats, '.*').length, 0)
  assert.equal(searchChats(chats, 'plain').length, 1)
  // And a query with a paren must not blow up the highlighter.
  assert.equal(searchChats(chats, '(plain').length, 0)
  assert.doesNotThrow(() => highlightParts('a (b) c', '(b)'))
})

test('highlightParts splits into strings and marks without losing any text', () => {
  const parts = highlightParts('hello world hello', 'hello')
  const rebuilt = parts.map(part => (typeof part === 'string' ? part : part.mark)).join('')
  assert.equal(rebuilt, 'hello world hello')
  assert.equal(parts.filter(part => typeof part === 'object').length, 2)
})

test('highlightParts returns the text untouched for an empty query', () => {
  assert.deepEqual(highlightParts('hello', ''), ['hello'])
  assert.deepEqual(highlightParts('hello', '   '), ['hello'])
})

test('at most a few snippets per chat, so one long chat cannot flood the sidebar', () => {
  const messages = Array.from({ length: 20 }, (_, index) => ({ id: `m${index}`, role: 'user', content: `needle number ${index}` }))
  const found = searchChats([chat('a', 'T', messages)], 'needle')
  assert.equal(found[0].matches.length, 3)
})
