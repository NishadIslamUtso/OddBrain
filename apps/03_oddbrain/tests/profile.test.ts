import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeProfile, initials, MAX_AVATAR_BYTES } from '../src/shared/lib/profile'

/**
 * The profile crosses a storage boundary (localStorage) and a greeting ("Good
 * evening, ."), so junk in must never reach either. The de-padding pass
 * deleted this coverage along with its source-grep neighbors; these are the
 * real assertions, restored on their own.
 */

test('normalizeProfile: junk becomes a usable profile, never an empty greeting', () => {
  const junk = normalizeProfile('yes')
  assert.equal(typeof junk.name, 'string')
  assert.notEqual(junk.name, '', 'a non-object cannot blank the greeting name')

  const nothing = normalizeProfile(undefined)
  assert.equal(nothing.email, '')
  assert.equal(nothing.avatar, '')

  const crafted = normalizeProfile({
    name: '   Nishad   Islam   Utso  ',
    email: '  a@b.co  ',
    tagline: 'x'.repeat(500),
    avatar: 'data:image/png;base64,AAA',
  })
  assert.equal(crafted.name, 'Nishad Islam Utso', 'whitespace collapses')
  assert.equal(crafted.email, 'a@b.co')
  assert.ok(crafted.tagline.length <= 80, 'the tagline is capped')
  assert.equal(crafted.avatar, 'data:image/png;base64,AAA', 'an inline image is kept')
})

test('normalizeProfile: an avatar that is not an inline image is refused', () => {
  const sneaky = normalizeProfile({ avatar: 'file:///home/user/.ssh/id_rsa' })
  assert.equal(sneaky.avatar, '', 'a file path is not an avatar')
  const js = normalizeProfile({ avatar: 'javascript:alert(1)' })
  assert.equal(js.avatar, '')
  assert.ok(MAX_AVATAR_BYTES > 0)
})

test('initials: two words take the outer letters, one word takes its first two', () => {
  assert.equal(initials('Nishad Islam Utso'), 'NU')
  assert.equal(initials('Odd'), 'OD')
  assert.equal(initials('   '), '?', 'nothing in, question mark out')
})
