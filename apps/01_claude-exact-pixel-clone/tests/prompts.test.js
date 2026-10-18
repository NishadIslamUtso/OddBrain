import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { BUILT_IN_PROMPTS, allPrompts, filterPrompts, placeholdersIn } from '../src/lib/prompts.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

/**
 * The Composer decides whether to open the menu with this regex. It is easy to
 * write one that fires on a URL or a file path, which would be maddening —
 * typing a link is not an attempt to open the prompt library.
 */
const slashIn = input => /(?:^|\s)\/([^\s/]*)$/.exec(input)

test('the slash menu opens on "/" at the start of a word', () => {
  assert.ok(slashIn('/'))
  assert.ok(slashIn('/sum'))
  assert.ok(slashIn('hello /sum'))
})

test('the slash menu does not open inside a URL or a file path', () => {
  assert.equal(slashIn('http://example.com'), null)
  assert.equal(slashIn('see src/lib/a.js'), null)
  assert.equal(slashIn('a/b'), null)
  assert.equal(slashIn(''), null)
})

test('the slash menu closes once the query contains a space', () => {
  assert.ok(slashIn('/sum'))
  assert.equal(slashIn('/sum mar'), null, 'a finished command should not stay open')
})

test('a query filters by name, and name matches come first', () => {
  assert.equal(filterPrompts([], 'sum')[0].name, 'summarise')
  assert.equal(filterPrompts([], 'explain')[0].name, 'explain')
})

test('an empty query lists every built-in', () => {
  assert.equal(filterPrompts([], '').length, BUILT_IN_PROMPTS.length)
})

test('a query that matches nothing closes the menu rather than showing it empty', () => {
  assert.equal(filterPrompts([], 'zzzzzz').length, 0)
})

test('user prompts appear alongside built-ins and are marked as such', () => {
  const list = allPrompts([{ id: 'u1', name: 'mine', hint: 'h', body: 'b' }])
  assert.equal(list.length, BUILT_IN_PROMPTS.length + 1)
  assert.equal(list[0].builtin, true)
  assert.equal(list[list.length - 1].builtin, false)
  assert.equal(list[list.length - 1].name, 'mine')
})

test('every built-in has the fields the menu renders', () => {
  for (const prompt of BUILT_IN_PROMPTS) {
    assert.ok(prompt.id, `${prompt.name} has no id`)
    assert.ok(prompt.name && !/\s/.test(prompt.name), `"${prompt.name}" must be a single word — it is typed after a slash`)
    assert.ok(prompt.hint, `${prompt.name} has no hint`)
    assert.ok(prompt.body.length > 30, `${prompt.name} body is too short to be useful`)
  }
})

test('built-in ids are unique', () => {
  const ids = BUILT_IN_PROMPTS.map(prompt => prompt.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('placeholders are found so the composer can park the cursor on them', () => {
  assert.deepEqual(placeholdersIn('Explain {{topic}} clearly'), ['topic'])
  assert.deepEqual(placeholdersIn('{{a}} and {{b}}'), ['a', 'b'])
  assert.deepEqual(placeholdersIn('no placeholders here'), [])
  assert.deepEqual(placeholdersIn(''), [])
})

test('every built-in placeholder is well formed', () => {
  // A stray single brace would render as literal text the user cannot fill in.
  for (const prompt of BUILT_IN_PROMPTS) {
    const opens = (prompt.body.match(/\{\{/g) || []).length
    const closes = (prompt.body.match(/\}\}/g) || []).length
    assert.equal(opens, closes, `${prompt.name} has unbalanced braces`)
    for (const name of placeholdersIn(prompt.body)) {
      assert.ok(name.length > 0, `${prompt.name} has an empty placeholder`)
    }
  }
})

test('the composer wires the menu to the keyboard', () => {
  const source = readFileSync(join(root, 'components', 'Composer.jsx'), 'utf8')
  assert.match(source, /slashOpen/, 'the composer must know when the menu is open')
  for (const key of ['ArrowDown', 'ArrowUp', 'Escape', 'Tab']) {
    assert.match(source, new RegExp(`'${key}'`), `the composer must handle ${key}`)
  }
})
