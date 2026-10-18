// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { speechChunks } from '../src/renderer/src/components/ReadAloudButton'

it('reads all of a long answer in order rather than silently cutting it', () => {
  const phrase = 'A full sentence of locally spoken words. '
  const input = phrase.repeat(200).trim()
  const chunks = speechChunks(input)
  expect(chunks.length).toBeGreaterThan(1)
  expect(chunks.every(part => part.length <= 1500)).toBe(true)
  expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(input.replace(/\s+/g, ' '))
  expect(speechChunks('')).toEqual([])
})
