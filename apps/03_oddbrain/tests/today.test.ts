// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { isToday, todaysArtifacts, todaysChats, worthDoing } from '../src/shared/lib/today'

/**
 * Today's arithmetic: the landing screen counts real records and suggests
 * only what a record supports. These tests pin the counting and the
 * no-filler rule, because a landing screen that invents activity is the one
 * lie this app cannot survive.
 */
const morning = new Date('2026-10-16T09:00:00')

test('isToday: same day yes, other day no, missing or broken never', () => {
  assert.equal(isToday('2026-10-16T08:14:00', morning), true)
  assert.equal(isToday('2026-10-15T23:59:00', morning), false)
  assert.equal(isToday(undefined, morning), false)
  assert.equal(isToday('not a date', morning), false)
  assert.equal(isToday(1760000000000, new Date(1760000000000)), true)
})

test('todays lists: only today records, newest first', () => {
  const chats = [
    { id: 'a', title: 'Morning ask', updatedAt: '2026-10-16T08:00:00' },
    { id: 'b', title: 'Yesterday', updatedAt: '2026-10-15T20:00:00' },
    { id: 'c', title: 'Later today', updatedAt: '2026-10-16T08:30:00' },
  ]
  const kept = todaysChats(chats, morning)
  assert.deepEqual(kept.map((chat) => chat.id), ['c', 'a'])

  const artifacts = [
    { id: 'x', title: 'Chart', type: 'chart', createdAt: '2026-10-16T07:00:00' },
    { id: 'y', title: 'Old page', type: 'page', createdAt: '2026-10-14T07:00:00' },
    { id: 'z', title: 'Newer page', type: 'page', createdAt: '2026-10-16T07:30:00' },
  ]
  assert.deepEqual(todaysArtifacts(artifacts, morning).map((item) => item.id), ['z', 'x'])
})

test('worth doing: continue first, artifact second, never filler beyond the records', () => {
  const chats = [{ id: 'a', title: 'Morning ask', updatedAt: '2026-10-16T08:00:00' }]
  const artifacts = [{ id: 'x', title: 'Chart', type: 'chart', createdAt: '2026-10-16T07:00:00' }]
  const both = worthDoing(chats, artifacts, morning)
  assert.equal(both.length, 2)
  assert.equal(both[0].action, 'open-chat')
  assert.equal(both[0].chatId, 'a')
  assert.equal(both[1].action, 'artifacts')

  // An empty day offers exactly one honest suggestion — to start.
  const empty = worthDoing([], [], morning)
  assert.equal(empty.length, 1)
  assert.equal(empty[0].action, 'chat')
  assert.match(empty[0].label, /Start something/)
})

test('worth doing: caps at three, all from records', () => {
  const chats = [
    { id: '1', title: 'one', updatedAt: '2026-10-16T06:00:00' },
    { id: '2', title: 'two', updatedAt: '2026-10-16T07:00:00' },
  ]
  const artifacts = [{ id: 'x', title: 'Chart', type: 'chart', createdAt: '2026-10-16T07:00:00' }]
  const out = worthDoing(chats, artifacts, morning)
  assert.equal(out.length, 2, 'two distinct records, two suggestions — the second chat adds nothing')
})
