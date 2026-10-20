// @vitest-environment node
import { expect, test } from 'vitest'
import { boundedResponse } from '../src/main/network/boundedResponse'

test('stream size overflow cancels the reader before draining an unbounded response', async () => {
  let reads = 0, cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { reads++; controller.enqueue(new Uint8Array(4)) },
    cancel() { cancelled = true },
  })
  await expect(boundedResponse(new Response(stream), 5)).rejects.toThrow(/size limit/)
  expect(cancelled).toBe(true)
  expect(reads).toBeLessThanOrEqual(3)
  expect(stream.locked).toBe(false)
})

test('byte limit handles UTF-8 split between chunks and accepts the exact limit', async () => {
  const bytes = new TextEncoder().encode('বাংলা')
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(bytes.slice(0, 1)); controller.enqueue(bytes.slice(1)); controller.close()
  } })
  await expect(boundedResponse(new Response(stream), bytes.length)).resolves.toBe('বাংলা')
  await expect(boundedResponse(new Response('বাংলা'), bytes.length - 1)).rejects.toThrow(/size limit/)
})
