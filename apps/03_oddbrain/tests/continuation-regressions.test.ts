// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import { startLocalDictation, type LocalRecognizer } from '../src/renderer/src/lib/localDictation'
import { localVoice } from '../src/renderer/src/ui/ReadAloudButton'
import { applyAppearance, DEFAULT_APPEARANCE } from '../src/renderer/src/state/appearance'
import { applyLook, DEFAULT_LOOK, lookTokens, presetSnapshot, DEFAULT_SIDEBAR } from '../src/renderer/src/state/look'
import { isDesignSystem } from '../src/shared/lib/design-systems'

test('dictation refuses implicit network speech and does not start it', () => {
  let started = 0
  class RemoteOnly { start() { started++ } }
  assert.throws(() => startLocalDictation(RemoteOnly as unknown as new () => LocalRecognizer, 'en-US', () => {}, () => {}, () => {}), /not started/)
  assert.equal(started, 0)
  assert.throws(() => startLocalDictation(undefined, 'en-US', () => {}, () => {}, () => {}), /unavailable/)
})

test('local dictation appends final results once and releases the microphone on unmount', () => {
  let ear!: LocalRecognizer
  let aborted = 0, ended = 0
  class Fake implements LocalRecognizer {
    processLocally = false; lang = ''; interimResults = true; continuous = true
    onresult: LocalRecognizer['onresult'] = null
    onerror: LocalRecognizer['onerror'] = null
    onend: LocalRecognizer['onend'] = null
    constructor() { ear = this }
    start() { assert.equal(this.processLocally, true); assert.equal(this.continuous, false) }
    stop() { this.onend?.() }
    abort() { aborted++ }
  }
  const words: string[] = []
  const handle = startLocalDictation(Fake, 'en-US', text => words.push(text), () => ended++, () => {})
  const event = { resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'first words' } }] }
  ear.onresult?.(event); ear.onresult?.(event)
  assert.deepEqual(words, ['first words'])
  handle.stop(); assert.equal(ended, 1)
  handle.abort(); assert.equal(aborted, 1); assert.equal(ear.onresult, null)
})

test('read aloud selects an installed local voice, never a default remote service', () => {
  const voices = [{ name: 'remote', default: true, localService: false, lang: 'en-US' }, { name: 'installed', default: false, localService: true, lang: 'en-GB' }] as SpeechSynthesisVoice[]
  assert.equal(localVoice(voices, 'en-US')?.name, 'installed')
  assert.equal(localVoice(voices.slice(0, 1), 'en-US'), undefined)
})

test('saved systems and pack styles survive the new look application; custom presets clear them', () => {
  window.matchMedia = () => ({ matches: false }) as MediaQueryList
  const root = document.documentElement
  const system = { ...DEFAULT_APPEARANCE, designSystem: 'linear-app' }
  applyAppearance(system); applyLook(system, DEFAULT_LOOK)
  assert.equal(root.style.getPropertyValue('--bg'), '#08090a')
  assert.equal(root.style.getPropertyValue('--color-bg'), 'var(--bg)')
  assert.equal(lookTokens(system, DEFAULT_LOOK)['--color-bg'], 'var(--bg)')
  const pack = { ...DEFAULT_APPEARANCE, packCss: ':root { --color-bg: #123456; --ob-radius: 2px; }' }
  applyAppearance(pack); applyLook(pack, DEFAULT_LOOK)
  assert.equal(root.style.getPropertyValue('--color-bg'), '')
  assert.equal(root.style.getPropertyValue('--ob-radius'), '')
  assert.equal(document.getElementById('ob-pack-style')?.textContent, pack.packCss)
  assert.equal(document.getElementById('ob-design-system'), null)
  const custom = presetSnapshot('playful-lab', system, DEFAULT_SIDEBAR)!
  assert.equal(custom.appearance.designSystem, ''); assert.equal(custom.appearance.packCss, '')
  assert.equal(isDesignSystem('toString'), false)
  assert.equal(isDesignSystem('__proto__'), false)
})
