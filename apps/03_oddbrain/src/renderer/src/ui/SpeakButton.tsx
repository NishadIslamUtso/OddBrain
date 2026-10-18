import { useEffect, useState } from 'react'
import { Volume2, Square } from 'lucide-react'
import { ttsSupported } from '@shared/lib/media'
let active: SpeechSynthesisUtterance | null = null
const CHANGED = 'ob:speech-changed'
/** Native voices only. Never fetch another provider or fall back to a remote voice. */
export default function SpeakButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState('')
  const [own] = useState<{ voice: SpeechSynthesisUtterance | null }>(() => ({ voice: null }))
  useEffect(() => {
    const update = (): void => setSpeaking(!!own.voice && active === own.voice)
    window.addEventListener(CHANGED, update)
    return () => {
      window.removeEventListener(CHANGED, update)
      if (own.voice && active === own.voice) { window.speechSynthesis?.cancel(); active = null; window.dispatchEvent(new Event(CHANGED)) }
    }
  }, [own])
  if (!ttsSupported() || !text.trim()) return null
  const toggle = (): void => {
    setError('')
    const synth = window.speechSynthesis
    synth.cancel()
    if (speaking) { active = null; window.dispatchEvent(new Event(CHANGED)); return }
    const voices = synth.getVoices().filter(voice => voice.localService)
    const voice = voices.find(v => v.lang === navigator.language) || voices.find(v => v.lang.split('-')[0] === navigator.language.split('-')[0]) || voices[0]
    if (!voice) { setError('No on-device reading voice is available. Install a Windows speech voice and try again.'); return }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = voice
    utterance.lang = voice.lang
    const finish = (): void => { if (active === utterance) { active = null; window.dispatchEvent(new Event(CHANGED)) } }
    utterance.onend = finish
    utterance.onerror = event => { finish(); if (event.error !== 'canceled' && event.error !== 'interrupted') setError('Reading aloud failed. No other service was used.') }
    own.voice = utterance; active = utterance
    synth.speak(utterance); window.dispatchEvent(new Event(CHANGED))
  }
  return <span><button type="button" onClick={toggle} aria-label={speaking ? 'Stop reading aloud' : 'Read aloud'} className="ob-small-button mt-2">{speaking ? <Square size={12} /> : <Volume2 size={12} />}{speaking ? 'Stop reading' : 'Read aloud'}</button>{error ? <span role="status" className="block text-[12px] text-warn">{error}</span> : null}</span>
}
