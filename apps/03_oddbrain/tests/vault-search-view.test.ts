// @vitest-environment node
import test from 'node:test'
import assert from 'node:assert/strict'
import { vaultHitDetail, vaultHitTitle, vaultScanNote, HIT_DETAIL_CHARS } from '../src/shared/lib/vaultSearch'

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

test('the palette says when a search stopped short of the vault', () => {
  assert.equal(vaultScanNote(undefined), '', 'no answer yet, no claim')
  assert.equal(vaultScanNote({ files: 120, bytes: 2_000_000, capped: false, partial: 0 }), '', 'a whole read says nothing')
  assert.equal(
    vaultScanNote({ files: 4000, bytes: 24_000_000, capped: true, partial: 0 }),
    'Searched 4000 files, then stopped at the limit; the rest was not searched.'
  )
  assert.equal(
    vaultScanNote({ files: 40, bytes: 300_000, capped: false, partial: 1 }),
    '1 file was longer than 64 KB and read in part.'
  )
  assert.equal(
    vaultScanNote({ files: 4000, bytes: 24_000_000, capped: true, partial: 3 }),
    'Searched 4000 files, then stopped at the limit; the rest was not searched. 3 files were longer than 64 KB and read in part.'
  )
})
