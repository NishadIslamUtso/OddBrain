import test from 'node:test'
import assert from 'node:assert/strict'
import { createEngineParser } from '../src/main/engine/stream'

/**
 * The wire, chopped at arbitrary byte boundaries by real pipes: whatever
 * the cut, the events come out identical — a partial line is held, a
 * rescanned tail is parsed once, nothing duplicates.
 */

const L1 = JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1', model: 'm' })
const D1 = JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'STEP 1: Note the word walnut in one short sentence.' } } })
const D2 = JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'STEP 2: Say what the work order asks about: Remember the word walnut, then tell ' } } })
const D3 = JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'me the vault folder you .' } } })
const D4 = JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'STEP 3: Finish with the single word done.' } } })
const FULL = 'STEP 1: Note the word walnut in one short sentence.\nSTEP 2: Say what the work order asks about: Remember the word walnut, then tell me the vault folder you .\nSTEP 3: Finish with the single word done.'
const ASST = JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: FULL }] } })
const RES = JSON.stringify({ type: 'result', subtype: 'success', result: FULL, is_error: false, duration_ms: 220, usage: { input_tokens: 16, output_tokens: 50 }, total_cost_usd: 0.0001 })

const wire = [L1, D1, D2, D3, D4, ASST + '\n' + RES].map(l => l + '\n').join('')
const STREAMED = FULL.replace(/\n/g, '')

for (let cut = 1; cut < wire.length; cut += 37) {
  test(`the wire survives a cut at byte ${cut}`, () => {
    const parser = createEngineParser()
    const events = [...parser.feed(wire.slice(0, cut)), ...parser.feed(wire.slice(cut))]
    const deltas = events.filter(e => e.kind === 'delta').map(e => (e as { text: string }).text).join('')
    const texts = events.filter(e => e.kind === 'text').map(e => (e as { text: string }).text).join('')
    assert.equal(deltas, STREAMED, 'the stream is stitched exactly once, byte for byte')
    assert.equal(texts, FULL, 'the finished block arrives once, whole')
    assert.equal(events.filter(e => e.kind === 'done').length, 1)
    assert.equal(events.filter(e => e.kind === 'status').length, 1)
  })
}
