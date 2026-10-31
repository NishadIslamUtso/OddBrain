import { useEffect, useRef, useState } from 'react'
import { Volume2, Square } from 'lucide-react'

const STOP_EVENT = 'oddbrain:stop-read-aloud'
export function localVoice(voices: readonly SpeechSynthesisVoice[], language: string): SpeechSynthesisVoice | undefined {
  const local = voices.filter(voice => voice.localService)
  return local.find(voice => voice.lang.toLowerCase() === language.toLowerCase())
    || local.find(voice => voice.lang.split('-')[0] === language.split('-')[0])
    || local.find(voice => voice.default) || local[0]
}

/** Never hand text to an implicit network speech service. Provider speech is a separate opt-in. */
export default function ReadAloudButton({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false)
  const utterance = useRef<SpeechSynthesisUtterance | null>(null)
  useEffect(() => {
    const stop = (): void => { utterance.current = null; setSpeaking(false) }
    window.addEventListener(STOP_EVENT, stop)
    return () => {
      window.removeEventListener(STOP_EVENT, stop)
      if (utterance.current) window.speechSynthesis?.cancel()
    }
  }, [])
  const notice = (detail: string): void => { window.dispatchEvent(new CustomEvent('app:notice', { detail })) }
  const toggle = (): void => {
    const speech = window.speechSynthesis
    if (!speech || typeof SpeechSynthesisUtterance !== 'function') { notice('Read aloud is unavailable in this window. No text was sent to a speech provider.'); return }
    const wasSpeaking = speaking
    speech.cancel()
    window.dispatchEvent(new Event(STOP_EVENT))
    if (wasSpeaking) return
    const voice = localVoice(speech.getVoices(), navigator.language || 'en-US')
    if (!voice) { notice('No installed on-device voice is ready. Install a system voice or wait for it to load, then try again. No text was sent to another provider.'); return }
    const next = new SpeechSynthesisUtterance(text)
    next.voice = voice; next.lang = voice.lang
    next.onend = () => { if (utterance.current === next) { utterance.current = null; setSpeaking(false) } }
    next.onerror = () => { if (utterance.current === next) { utterance.current = null; setSpeaking(false); notice('The installed voice could not read this reply. No other speech provider was used.') } }
    utterance.current = next
    try { speech.speak(next); setSpeaking(true) } catch { utterance.current = null; notice('The installed voice could not start. No other speech provider was used.') }
  }
  return <button type="button" onClick={toggle} aria-label={speaking ? 'Stop reading aloud' : 'Read aloud'} title="Read with an installed on-device voice" className="mt-2 flex items-center gap-1 rounded-lg border border-line px-1.5 py-0.5 text-[10.5px] text-muted hover:text-ink">
    {speaking ? <Square size={10} /> : <Volume2 size={10} />}{speaking ? 'Stop' : 'Listen'}
  </button>
}
