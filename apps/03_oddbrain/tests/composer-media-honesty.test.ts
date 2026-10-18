import test from 'node:test'
import assert from 'node:assert/strict'
import {
  audioModelDisclosure,
  base64PayloadBytes,
  formatExactBytes,
  imageModelDisclosure,
  preparedMediaPayloadBytes,
  preparedMediaSizeLabel,
} from '../src/renderer/src/components/composerMedia'

const audioModel = 'openai/gpt-4o-audio-preview'

test('audio capability stays unverified for the exact selected model, regardless of its name', () => {
  const disclosure = audioModelDisclosure(audioModel, [{ name: audioModel }])

  assert.equal(disclosure.state, 'unverified')
  assert.match(disclosure.message, /openai\/gpt-4o-audio-preview/)
  assert.match(disclosure.message, /not reported/)
  assert.match(disclosure.message, /may refuse/)
  assert.match(disclosure.message, /exact model; there is no fallback/i)
  assert.doesNotMatch(disclosure.message, /supports audio/i)
})

test('audio does not choose a model automatically or treat a missing model as enabled', () => {
  const unselected = audioModelDisclosure('', [{ name: audioModel }])
  assert.equal(unselected.state, 'unselected')
  assert.match(unselected.message, /choose an enabled OpenAI model/i)
  assert.match(unselected.message, /no model is selected automatically/i)

  const absent = audioModelDisclosure(audioModel, [])
  assert.equal(absent.state, 'not-enabled')
  assert.match(absent.message, /not in the current enabled OpenAI model list/i)
  assert.match(absent.message, /nothing will be rerouted/i)
})

test('AGY image capability is named as unsupported before send, without switching engines', () => {
  const disclosure = imageModelDisclosure('agy', '')

  assert.equal(disclosure.state, 'unsupported')
  assert.match(disclosure.message, /agy engine cannot receive image attachments/i)
  assert.match(disclosure.message, /sampled video frames are images too/i)
  assert.match(disclosure.message, /nothing is sent or switched/i)
})

test('Claude Code image capability is unverified for the exact selected model', () => {
  const disclosure = imageModelDisclosure('claude-code', 'sonnet')

  assert.equal(disclosure.state, 'unverified')
  assert.match(disclosure.message, /claude-code model "sonnet"/)
  assert.match(disclosure.message, /not reported here/i)
  assert.match(disclosure.message, /may refuse/i)
  assert.match(disclosure.message, /nothing will be sent to another engine/i)
  assert.doesNotMatch(disclosure.message, /supports images/i)
})

test('an unnamed Claude Code model is not replaced with a guessed identifier', () => {
  const disclosure = imageModelDisclosure('claude-code', '')

  assert.equal(disclosure.state, 'unverified')
  assert.match(disclosure.message, /current claude-code model/)
  assert.doesNotMatch(disclosure.message, /sonnet|opus|haiku/i)
})

test('prepared image and audio size is the exact decoded payload byte count', () => {
  const bytes = Buffer.from([0, 1, 2, 127, 128, 255])
  const encoded = bytes.toString('base64')

  assert.equal(base64PayloadBytes(encoded), bytes.byteLength)
  assert.equal(base64PayloadBytes(`data:image/jpeg;base64,${encoded}`), bytes.byteLength)
  assert.equal(preparedMediaPayloadBytes({ kind: 'image', data: encoded }), bytes.byteLength)
  assert.equal(preparedMediaPayloadBytes({ kind: 'audio', audioData: encoded }), bytes.byteLength)
  assert.equal(preparedMediaSizeLabel({ kind: 'image', data: encoded }), '6 B')
  assert.equal(preparedMediaPayloadBytes({ kind: 'text', data: encoded }), null)
})

test('malformed or absent media bytes do not produce a guessed size', () => {
  assert.equal(base64PayloadBytes(undefined), null)
  assert.equal(base64PayloadBytes(''), null)
  assert.equal(base64PayloadBytes('not base64'), null)
  assert.equal(preparedMediaPayloadBytes({ kind: 'audio', audioData: 'not base64' }), null)
  assert.equal(formatExactBytes(null), null)
  assert.equal(formatExactBytes(-1), null)
})

test('size labels retain exact byte counts rather than rounded MB estimates', () => {
  assert.equal(formatExactBytes(100_000_001), '100,000,001 B')
  assert.equal(formatExactBytes(0), '0 B')
  assert.equal(formatExactBytes(Number.MAX_SAFE_INTEGER + 1), null)
})
