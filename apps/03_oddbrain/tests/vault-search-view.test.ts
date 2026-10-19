// @vitest-environment node
import test from 'node:test'
import assert from 'node:assert/strict'
import { vaultHitDetail, vaultHitTitle, HIT_DETAIL_CHARS } from '../src/shared/lib/vaultSearch'

/**
 * What a vault search hit looks like in the palette.
 *
 * The palette shows one title and one line. If that line does not say where the
 * words came from, a captured message is indistinguishable from a note, and the
 * person lands in a file with no idea which chat wrote it.
 */

test('a note says it is a note; a captured message names the provider', () => {
  assert.match(vaultHitDetail({ path: 'Notes/Mint.md', kind: 'note', snippet: { text: 'mint on the balcony' } }), /^Vault note · mint on the balcony$/)
  assert.match(
    vaultHitDetail({ path: '02 Sources/Conversations/Browser/a/messages/b.md', kind: 'message', conversation: { provider: 'Claude' }, snippet: { text: 'the marigold needs water' } }),
    /^Claude · the marigold needs water$/
  )
  // No provider, still honest about the kind.
  assert.match(vaultHitDetail({ path: 'x.md', kind: 'message', snippet: { text: 'a line' } }), /^Captured conversation · a line$/)
})

test('a hit with no snippet says only where it came from, not an empty dot', () => {
  assert.equal(vaultHitDetail({ path: 'Notes/A.md', kind: 'note' }), 'Vault note')
  assert.equal(vaultHitDetail({ path: 'b.md', kind: 'message', snippet: { text: '   ' } }), 'Captured conversation')
})

test('a long or multi-line snippet stays one bounded line', () => {
  const long = 'word '.repeat(80)
  const detail = vaultHitDetail({ path: 'x.md', kind: 'note', snippet: { text: `first line\nsecond line ${long}` } })
  assert.ok(!detail.includes('\n'), 'a newline would break the palette row')
  assert.ok(detail.length <= 'Vault note · '.length + HIT_DETAIL_CHARS + 1)
  assert.match(detail, /…$/)
  assert.match(detail, /first line second line/)
})

test('a hit without a title falls back to its file name, never to blank', () => {
  assert.equal(vaultHitTitle({ path: '02 Sources/Conversations/Browser/a/messages/bbbb.md', kind: 'message' }), 'bbbb.md')
  assert.equal(vaultHitTitle({ path: 'Notes/Mint.md', kind: 'note', title: '  Mint on the balcony  ' }), 'Mint on the balcony')
})
