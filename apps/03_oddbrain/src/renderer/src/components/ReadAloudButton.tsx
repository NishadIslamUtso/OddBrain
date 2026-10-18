import { useEffect, useRef, useState } from 'react'
import { Square, Volume2 } from 'lucide-react'
import { ttsSupported } from '@shared/lib/media'

const STOP_EVENT = 'oddbrain:read-aloud-stop'

/** A long answer is read in order. Never silently chop it at the voice API's
 * usual long-utterance limit. Only OS/local voices are permitted here. */
export function speechChunks(text: string, limit = 1500): string[] {
  const chunks: string[] = []
  let rest = text.trim()
  while (rest.length) {
    if (rest.length <= limit) { chunks.push(rest); break }
    const window = rest.slice(0, limit)
    const paragraph = window.lastIndexOf('\n')
    const sentence = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '))
    const space = window.lastIndexOf(' ')
    const cut = paragraph > limit / 2 ? paragraph + 1 : sentence > limit / 2 ? sentence + 2 : space > limit / 2 ? space + 1 : limit
    chunks.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trimStart()
  }
  return chunks
}

export default function ReadAloudButton({ text, className = '' }: { text: string; className?: string }) {
  const [speaking, setSpeaking] = useState(false)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const active = useRef(false)
  useEffect(() => {
    if (!ttsSupported()) return
    const update = (): void => setVoices(window.speechSynthesis.getVoices().filter(voice => voice.localService))
    update()
    window.speechSynthesis.addEventListener('voiceschanged', update)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', update)
      if (active.current) { active.current = false; window.speechSynthesis.cancel() }
    }
  }, [])
  useEffect(() => {
    const stop = (): void => { active.current = false; setSpeaking(false) }
    window.addEventListener(STOP_EVENT, stop)
    return () => window.removeEventListener(STOP_EVENT, stop)
  }, [])
  if (!ttsSupported()) return null
  const toggle = (): void => {
    if (speaking) {
      active.current = false
      window.speechSynthesis.cancel()
      window.dispatchEvent(new Event(STOP_EVENT))
      return
    }
    if (!voices.length) {
      window.dispatchEvent(new CustomEvent('app:notice', { detail: 'No local system voice is available. Install an on-device voice in Windows speech settings; no online speech service was started.' }))
      return
    }
    const local = voices.find(voice => voice.lang.toLowerCase() === navigator.language.toLowerCase()) || voices[0]
    const chunks = speechChunks(text)
    if (!chunks.length) return
    window.speechSynthesis.cancel()
    window.dispatchEvent(new Event(STOP_EVENT))
    active.current = true
    setSpeaking(true)
    let index = 0
    const next = (): void => {
      if (!active.current) return
      if (index === chunks.length) { active.current = false; setSpeaking(false); return }
      const utterance = new SpeechSynthesisUtterance(chunks[index++])
      utterance.voice = local
      utterance.lang = local.lang
      utterance.onend = next
      utterance.onerror = event => {
        if (active.current && event.error !== 'canceled' && event.error !== 'interrupted') {
          window.dispatchEvent(new CustomEvent('app:notice', { detail: `The local voice stopped: ${event.error}. Nothing was sent to a provider.` }))
        }
        active.current = false
        setSpeaking(false)
      }
      window.speechSynthesis.speak(utterance)
    }
    next()
  }
  return (
    <button type="button" onClick={toggle}
      aria-label={speaking ? 'Stop reading aloud' : 'Read aloud'}
      title={speaking ? 'Stop speaking' : voices.length ? 'Read this answer with a local system voice' : 'Needs an on-device system voice; no online voice is used'}
      className={`mt-2 flex items-center gap-1 rounded-lg border border-line px-1.5 py-0.5 text-[10.5px] text-muted hover:text-ink ${className}`}
    >
      {speaking ? <Square size={10} /> : <Volume2 size={10} />}
      {speaking ? 'Stop' : 'Listen'}
    </button>
  )
}
