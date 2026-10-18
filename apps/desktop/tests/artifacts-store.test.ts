import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { adopt, duplicate, list, read, remove, rename, restore, save } from '../src/main/artifacts/store'

/**
 * The artifact library on disk.
 *
 * The subject is the record of everything the app has made, so what matters
 * here is not that saving works once — it is what happens afterwards:
 *
 *   - a version is a file, and a new version never replaces an old one
 *   - putting an old version back appends it; it does not truncate
 *   - taking something out of the library moves its folder, it does not delete it
 *   - adopting what is already in a conversation is idempotent: running it twice
 *     cannot produce two cards for one artifact
 *   - a damaged index is repaired from the files, because the files are the truth
 *   - an id that could walk out of the folder is refused before it is a path
 */

function workspace(): string {
  return mkdtempSync(join(tmpdir(), 'oddbrain-artifacts-'))
}

const PAGE = '<!doctype html><html><body><h1>Pomodoro</h1><script>1+1</script></body></html>'

test('saving an artifact writes its document and lists one card', () => {
  const root = workspace()
  try {
    const answer = save(root, { title: 'Pomodoro timer', type: 'html', content: PAGE, chatId: 'chat1', messageId: 'msg1' })
    assert.equal(answer.ok, true)
    if (!answer.ok) return
    assert.equal(answer.item.title, 'Pomodoro timer')
    assert.equal(answer.item.versionCount, 1)
    assert.equal(answer.item.current, 0)
    assert.ok(answer.item.bytes > 0, 'the summary knows the size of the document')

    // The document is a file, named the way the version chips name it.
    const file = join(root, 'items', answer.item.id, 'v1.html')
    assert.equal(existsSync(file), true)
    assert.equal(readFileSync(file, 'utf8'), PAGE)

    const listed = list(root)
    assert.equal(listed.ok, true)
    if (!listed.ok) return
    assert.equal(listed.items.length, 1)
    assert.equal(listed.where, root, 'the screen can say where the files are')
    // The list carries no document content: a grid of cards must not pull a
    // grid of documents across the bridge to draw titles.
    assert.equal('content' in (listed.items[0] as object), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a new version is appended, and identical content is not a version at all', () => {
  const root = workspace()
  try {
    const first = save(root, { title: 'Report', type: 'html', content: '<p>one</p>' })
    assert.equal(first.ok, true)
    if (!first.ok) return

    const again = save(root, { id: first.item.id, content: '<p>one</p>' })
    assert.equal(again.ok, true)
    if (!again.ok) return
    assert.equal(again.unchanged, true, 'saving what is already there changes nothing')
    assert.equal(again.item.versionCount, 1)

    const second = save(root, { id: first.item.id, content: '<p>two</p>', note: 'made it shorter' })
    assert.equal(second.ok, true)
    if (!second.ok) return
    assert.equal(second.item.versionCount, 2)
    assert.equal(second.item.current, 1)
    assert.equal(existsSync(join(root, 'items', first.item.id, 'v1.html')), true, 'version one is still on disk')
    assert.equal(existsSync(join(root, 'items', first.item.id, 'v2.html')), true)

    const older = read(root, first.item.id, 1)
    assert.equal(older.ok, true)
    if (!older.ok) return
    assert.equal(older.content, '<p>one</p>', 'an older version can still be read')
    assert.equal(older.version, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('restoring an old version adds it back; nothing is truncated', () => {
  const root = workspace()
  try {
    const first = save(root, { title: 'Timer', type: 'html', content: '<p>v1</p>' })
    assert.equal(first.ok, true)
    if (!first.ok) return
    save(root, { id: first.item.id, content: '<p>v2</p>' })
    save(root, { id: first.item.id, content: '<p>v3</p>' })

    const back = restore(root, first.item.id, 1)
    assert.equal(back.ok, true)
    if (!back.ok) return
    assert.equal(back.item.versionCount, 4, 'the restore is a fourth version, not a rewind')

    const newest = read(root, first.item.id)
    assert.equal(newest.ok, true)
    if (!newest.ok) return
    assert.equal(newest.content, '<p>v1</p>')
    assert.equal(newest.version, 4)

    // And every version in between is still there, which is the whole point.
    for (const version of [1, 2, 3]) {
      const answer = read(root, first.item.id, version)
      assert.equal(answer.ok, true)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('renaming refuses an empty title and keeps what is there', () => {
  const root = workspace()
  try {
    const first = save(root, { title: 'Untitled thing', type: 'html', content: PAGE })
    assert.equal(first.ok, true)
    if (!first.ok) return

    const refused = rename(root, first.item.id, '   ')
    assert.equal(refused.ok, false)
    if (!refused.ok) assert.match(refused.error, /cannot be empty/)

    const renamed = rename(root, first.item.id, '  Study chart  ')
    assert.equal(renamed.ok, true)
    if (renamed.ok) assert.equal(renamed.item.title, 'Study chart')

    // A mirror of a chat must not undo a rename, so a plain save leaves the title.
    const mirrored = save(root, { id: first.item.id, title: 'Some other title', content: '<p>new</p>' })
    assert.equal(mirrored.ok, true)
    if (mirrored.ok) assert.equal(mirrored.item.title, 'Study chart')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('duplicating makes an independent copy', () => {
  const root = workspace()
  try {
    const first = save(root, { title: 'Landing page', type: 'html', content: PAGE })
    assert.equal(first.ok, true)
    if (!first.ok) return

    const copy = duplicate(root, first.item.id)
    assert.equal(copy.ok, true)
    if (!copy.ok) return
    assert.notEqual(copy.item.id, first.item.id)
    assert.equal(copy.item.title, 'Landing page copy')

    // Editing the copy leaves the original alone.
    save(root, { id: copy.item.id, content: '<p>changed</p>' })
    const original = read(root, first.item.id)
    assert.equal(original.ok, true)
    if (original.ok) assert.equal(original.content, PAGE)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('removing moves the files aside — it does not destroy them', () => {
  const root = workspace()
  try {
    const first = save(root, { title: 'Old thing', type: 'html', content: PAGE })
    assert.equal(first.ok, true)
    if (!first.ok) return
    const id = first.item.id

    const removed = remove(root, id)
    assert.equal(removed.ok, true)
    if (!removed.ok) return
    assert.match(removed.movedTo, /^\.trash\//)

    const listed = list(root)
    assert.equal(listed.ok, true)
    if (listed.ok) assert.equal(listed.items.length, 0)

    // The document is still readable where it was moved to.
    const moved = join(root, removed.movedTo, 'v1.html')
    assert.equal(existsSync(moved), true)
    assert.equal(readFileSync(moved, 'utf8'), PAGE)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('adopting is by id: a second run cannot double a library', () => {
  const root = workspace()
  try {
    const records = [
      { id: 'artone', title: 'Timer', type: 'html' as const, content: PAGE, chatId: 'c1', messageId: 'm1' },
      { id: 'arttwo', title: 'Chart', type: 'html' as const, content: '<p>chart</p>', chatId: 'c1', messageId: 'm2' },
    ]
    const first = adopt(root, records)
    assert.equal(first.adopted, 2)
    assert.equal(first.skipped, 0)

    const second = adopt(root, records)
    assert.equal(second.adopted, 0)
    assert.equal(second.skipped, 2)

    const listed = list(root)
    assert.equal(listed.ok, true)
    if (listed.ok) assert.equal(listed.items.length, 2)

    // An adopted artifact keeps its chat, so "Open" can find the conversation.
    const one = read(root, 'artone')
    assert.equal(one.ok, true)
    if (one.ok) assert.equal(one.item.chatId, 'c1')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('adopting refuses junk instead of writing a card that cannot be opened', () => {
  const root = workspace()
  try {
    const answer = adopt(root, [
      { id: '../escape', title: 'Bad', type: 'html', content: PAGE },
      { id: 'goodid', title: 'Empty', type: 'html', content: '   ' },
      { id: 'alsogood', title: 'Wrong type', type: 'exe', content: PAGE },
      { id: 'fineid', title: 'Fine', type: 'svg', content: '<svg xmlns="http://www.w3.org/2000/svg"/>' },
    ])
    assert.equal(answer.adopted, 1)
    assert.equal(answer.refused, 3)

    const listed = list(root)
    assert.equal(listed.ok, true)
    if (listed.ok) {
      assert.equal(listed.items.length, 1)
      assert.equal(listed.items[0].id, 'fineid')
      assert.equal(listed.items[0].type, 'svg')
    }
    // An SVG keeps its own extension, because that is what the file is.
    assert.equal(existsSync(join(root, 'items', 'fineid', 'v1.svg')), true)
    assert.equal(existsSync(join(root, '..', 'escape')), false, 'nothing was written outside the library')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an id that could walk out of the folder is refused', () => {
  const root = workspace()
  try {
    const first = save(root, { title: 'Thing', type: 'html', content: PAGE })
    assert.equal(first.ok, true)

    for (const bad of ['../settings', '..\\settings', 'a/b', '', 'x'.repeat(65)]) {
      const answer = read(root, bad)
      assert.equal(answer.ok, false, `${bad} must not be read`)
    }
    assert.equal(remove(root, '../settings').ok, false)
    assert.equal(rename(root, '../settings', 'nope').ok, false)

    // A save with an unusable id still succeeds — it simply becomes a new
    // artifact with an id this app made, rather than a write somewhere else.
    const sneaky = save(root, { id: '../../escape', title: 'Sneaky', type: 'html', content: PAGE })
    assert.equal(sneaky.ok, true)
    if (sneaky.ok) assert.match(sneaky.item.id, /^art/)
    assert.equal(existsSync(join(root, '..', '..', 'escape')), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a damaged index is repaired from the files that are still there', () => {
  const root = workspace()
  try {
    const first = save(root, { title: 'Kept one', type: 'html', content: PAGE })
    assert.equal(first.ok, true)
    if (!first.ok) return

    // The index is what a crash mid-write could ruin. The documents are not.
    writeFileSync(join(root, 'index.json'), '{"version":1,"items":[{"id":"broken"', 'utf8')
    const repaired = list(root)
    assert.equal(repaired.ok, true)
    if (!repaired.ok) return
    assert.equal(repaired.items.length, 1)
    assert.equal(repaired.items[0].id, first.item.id)
    // The title could not be recovered, and the id stands in rather than an
    // invented name.
    assert.equal(repaired.items[0].title, first.item.id)
    assert.equal(existsSync(join(root, 'items', first.item.id, 'v1.html')), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('documents copied into the folder by hand appear rather than vanish', () => {
  const root = workspace()
  try {
    mkdirSync(join(root, 'items', 'byhand'), { recursive: true })
    writeFileSync(join(root, 'items', 'byhand', 'v1.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>', 'utf8')
    save(root, { title: 'Made here', type: 'html', content: PAGE })

    const listed = list(root)
    assert.equal(listed.ok, true)
    if (!listed.ok) return
    const ids = listed.items.map(item => item.id).sort()
    assert.equal(ids.length, 2, 'both the hand-made folder and the saved one are listed')
    assert.equal(ids.includes('byhand'), true, 'the folder found on disk is in the library')
    const found = listed.items.find(item => item.id === 'byhand')
    assert.equal(found?.type, 'svg')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an empty library is an empty library, not an error', () => {
  const root = workspace()
  try {
    const listed = list(root)
    assert.equal(listed.ok, true)
    if (listed.ok) {
      assert.deepEqual(listed.items, [])
      assert.equal(listed.where, root)
    }
    // Reading from a library that has never held anything says so in a sentence.
    const missing = read(root, 'nothinghere')
    assert.equal(missing.ok, false)
    if (!missing.ok) assert.match(missing.error, /not in the library/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the list is newest first, and saving again moves an item to the top', () => {
  const root = workspace()
  try {
    const older = save(root, { title: 'Older', type: 'html', content: '<p>a</p>' })
    const newer = save(root, { title: 'Newer', type: 'html', content: '<p>b</p>' })
    assert.equal(older.ok && newer.ok, true)
    if (!older.ok || !newer.ok) return

    let listed = list(root)
    assert.equal(listed.ok, true)
    if (!listed.ok) return
    assert.deepEqual(listed.items.map(item => item.title), ['Newer', 'Older'])

    // Changing the older one makes it the most recently touched.
    save(root, { id: older.item.id, content: '<p>a, edited</p>' })
    listed = list(root)
    assert.equal(listed.ok, true)
    if (listed.ok) assert.deepEqual(listed.items.map(item => item.title), ['Older', 'Newer'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an empty document and an oversized one are both refused with a sentence', () => {
  const root = workspace()
  try {
    const empty = save(root, { title: 'Nothing', type: 'html', content: '   ' })
    assert.equal(empty.ok, false)
    if (!empty.ok) assert.match(empty.error, /nothing to save/i)

    const huge = save(root, { title: 'Huge', type: 'html', content: 'x'.repeat(4_000_001) })
    assert.equal(huge.ok, false)
    if (!huge.ok) assert.match(huge.error, /4 MB/)

    // Neither refusal wrote anything.
    assert.equal(readdirSync(root).includes('items'), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
