import test from 'node:test'
import assert from 'node:assert/strict'
import { CapExceeded, PROGRESS_TICK_BYTES, readReplyBytes } from '../src/main/engine/downloads'

/**
 * The streaming read, on its own.
 *
 * Two things are being proved. The progress line moves WHILE the bytes arrive
 * instead of jumping from nothing to done in one step — on a 1.47 GB download
 * over a home link that is the difference between a live card and a frozen one.
 * And the size cap is enforced IN FLIGHT, so a hostile offer is cut off at the
 * cap rather than after the whole thing has been pulled down and held in memory.
 *
 * Chunk sizes in the tick test are derived from the product tick value, not
 * hardcoded, so the test cannot quietly stop testing anything if it is retuned.
 */

type FakeReply = {
  headers: { get(name: string): string | null }
  body: { getReader(): unknown }
  /** How many chunks the reader actually handed over. */
  reads: number
  /** Whether the reader was cancelled, i.e. the transfer was let go of. */
  cancelled: boolean
}

/** A ReadableStream-shaped fake over fixed chunks. */
const streamOf = (chunks: Uint8Array[], length?: number): FakeReply => {
  const reply: FakeReply = {
    reads: 0,
    cancelled: false,
    headers: {
      get: (name: string) => (name === 'content-length' && length !== undefined ? String(length) : null),
    },
    body: {
      getReader: () => {
        let index = 0
        return {
          read: async () => {
            if (index >= chunks.length) return { done: true, value: undefined }
            reply.reads += 1
            return { done: false, value: chunks[index++] }
          },
          cancel: async () => { reply.cancelled = true },
        }
      },
    },
  }
  return reply
}

test('progress ticks while the bytes arrive, not only at the end', async () => {
  const chunk = new Uint8Array(PROGRESS_TICK_BYTES).fill(7)
  const reply = streamOf([chunk, chunk, chunk], PROGRESS_TICK_BYTES * 3)
  const seen: Array<{ got: number; total: number | null }> = []

  const bytes = await readReplyBytes(reply, PROGRESS_TICK_BYTES * 10, (got, total) => seen.push({ got, total }))

  assert.equal(bytes.length, PROGRESS_TICK_BYTES * 3, 'every byte arrived')
  assert.ok(bytes.every(value => value === 7), 'and they are the right bytes, in order')
  // One tick per chunk, plus the final one: the card moved three times before
  // the transfer finished. A single jump from 0 to done would be length 1.
  assert.equal(seen.length, 4, `the line moved during the download, saw ${seen.length} ticks`)
  assert.deepEqual(seen.map(tick => tick.got), [
    PROGRESS_TICK_BYTES,
    PROGRESS_TICK_BYTES * 2,
    PROGRESS_TICK_BYTES * 3,
    PROGRESS_TICK_BYTES * 3,
  ], 'the counts climb, then close')
  assert.ok(seen.every(tick => tick.total === PROGRESS_TICK_BYTES * 3), 'the total is known from the header')
})

test('a hostile offer is cut off AT the cap, not after it all lands', async () => {
  // 40 KB offered against a 10 KB cap. The tick is 8 MB, so this asserts on
  // chunks CONSUMED — the thing the cap actually protects.
  const reply = streamOf(Array.from({ length: 40 }, () => new Uint8Array(1024).fill(1)))

  await assert.rejects(
    readReplyBytes(reply, 1024 * 10, () => undefined),
    (error: unknown) => error instanceof CapExceeded,
    'the cap throws its own error, so the answer can say which cap it was',
  )
  assert.equal(reply.reads, 11, 'it stopped at the chunk that crossed the cap')
  assert.ok(reply.reads < 40, 'it did not pull the whole hostile offer down')
  assert.equal(reply.cancelled, true, 'and it let go of the transfer')
})

test('a declared length that does not match what arrived is reported, not handed on', async () => {
  // Declares 4 KB, sends 2 KB. A truncated transfer must not reach the unpacker
  // looking like a complete archive.
  const reply = streamOf([new Uint8Array(2048).fill(3)], 4096)
  await assert.rejects(
    readReplyBytes(reply, 1024 * 1024, () => undefined),
    /declared .* but sent /,
  )
})

test('a reply with no body falls back to arrayBuffer, which is what the fakes offer', async () => {
  const payload = new TextEncoder().encode('the whole thing in one go')
  const reply = {
    headers: { get: (name: string) => (name === 'content-length' ? String(payload.length) : null) },
    arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.length),
  }
  const seen: number[] = []
  const bytes = await readReplyBytes(reply, 1024, (got) => seen.push(got))
  assert.equal(new TextDecoder().decode(bytes), 'the whole thing in one go')
  assert.deepEqual(seen, [payload.length], 'one tick, at the end, is the honest shape for a buffered reply')
})

test('the buffered fallback still honours the cap', async () => {
  const payload = new Uint8Array(4096).fill(9)
  const reply = {
    headers: { get: () => null },
    arrayBuffer: async () => payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.length),
  }
  await assert.rejects(
    readReplyBytes(reply, 1024, () => undefined),
    (error: unknown) => error instanceof CapExceeded,
  )
})

test('an unknown length still assembles one buffer, in order', async () => {
  // No content-length: the chunks are gathered and copied once. A spread would
  // blow the stack on a large download, so this walks the chunk list instead.
  const reply = streamOf([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5]), new Uint8Array([6])])
  const seen: Array<{ got: number; total: number | null }> = []
  const bytes = await readReplyBytes(reply, 1024, (got, total) => seen.push({ got, total }))
  assert.deepEqual(Array.from(bytes), [1, 2, 3, 4, 5, 6])
  // These chunks are far below the tick, so the only report is the closing one,
  // and by then the total IS known — reporting it is more honest than a null.
  assert.equal(seen.length, 1, 'a tiny transfer reports once, at the close')
  assert.deepEqual(seen[0], { got: 6, total: 6 }, 'the close names the real total')
})

test('an empty chunk in the stream does not stall or corrupt the read', async () => {
  const reply = streamOf(
    [new Uint8Array([1]), new Uint8Array(0), new Uint8Array([2]), new Uint8Array(0)],
    2,
  )
  const bytes = await readReplyBytes(reply, 1024, () => undefined)
  assert.deepEqual(Array.from(bytes), [1, 2], 'zero-length reads are skipped, not counted')
})
