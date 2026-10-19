// @vitest-environment jsdom
import { beforeEach, expect, test } from 'vitest'
import { draftStash } from '../src/shared/lib/draftStash'
beforeEach(() => localStorage.clear())
test('keeps full text, whitespace and independent drafts across store instances', () => {
  const first = draftStash(localStorage, 'real'), second = draftStash(localStorage, 'real')
  const text = '  first\n\n' + 'বাংলা '.repeat(2000)
  first.save(text, 'one'); second.save('other', 'two')
  expect(first.list()).toHaveLength(2); expect(first.list().find(d => d.id === 'one')?.text).toBe(text)
})
test('sample and real storage cannot overwrite or remove each other', () => {
  const real = draftStash(localStorage, 'real'), sample = draftStash(localStorage, 'sample')
  real.save('Private', 'same'); sample.save('Sample', 'same'); sample.remove('same')
  expect(real.list()[0].text).toBe('Private'); expect(sample.list()).toHaveLength(0)
})
test('corruption and duplicate ids refuse replacement rather than reset or lose data', () => {
  const store = draftStash(localStorage, 'real'); store.save('Original', 'one')
  expect(() => store.save('Replacement', 'one')).toThrow('overwritten')
  localStorage.setItem('real.bad', 'broken'); expect(() => store.save('New', 'new')).toThrow('damaged')
  expect(localStorage.getItem('real.bad')).toBe('broken'); expect(localStorage.getItem('real.one')).toContain('Original')
})
test('capacity and size limits never trim a draft or evict an older one', () => {
  const store = draftStash(localStorage, 'real')
  expect(() => store.save('x'.repeat(100001), 'huge')).toThrow('nothing was shortened')
  for (let i = 0; i < 50; i++) store.save(`Draft ${i}`, String(i))
  expect(() => store.save('51st', 'extra')).toThrow('nothing was discarded'); expect(store.list()).toHaveLength(50)
})
test('a blocked write does not claim to have saved the text', () => {
  const store = draftStash({ length: 0, getItem: () => null, key: () => null, setItem: () => { throw Error('Quota') } } as unknown as Storage, 'real')
  expect(() => store.save('Keep me', 'new')).toThrow('could not be saved')
})
