import { useEffect, useRef, useState } from 'react'
import { bridge, isDemo } from '../platform/bridge'
import { startLocalDictation, type RecognizerConstructor } from '../lib/localDictation'

/** One user-triggered recording; cancellation and unmount discard late results. */
export default function useDictation(value: string, onChange: (value: string) => void) {
  const [state, setState] = useState<'idle' | 'listening' | 'transcribing'>('idle')
  const [label, setLabel] = useState('')
  const latest = useRef({ value, onChange }); latest.current = { value, onChange }
  const generation = useRef(0), recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const local = useRef<{ stop(): void; abort(): void } | null>(null), running = useRef(false)
  const notice = (detail: string): void => { window.dispatchEvent(new CustomEvent('app:notice', { detail })) }
  const release = (): void => { if (timer.current) clearTimeout(timer.current); timer.current = null; stream.current?.getTracks().forEach(track => track.stop()); stream.current = null }
  const cancel = (): void => {
    generation.current++; running.current = false
    local.current?.abort(); local.current = null
    if (recorder.current?.state === 'recording') recorder.current.stop()
    recorder.current = null; release(); void bridge.media.cancel(); setState('idle'); setLabel('')
  }
  useEffect(() => bridge.media.onCancelled(cancel), [])
  useEffect(() => () => { generation.current++; local.current?.abort(); if (recorder.current?.state === 'recording') recorder.current.stop(); release(); void bridge.media.cancel() }, [])
  const append = (text: string): void => { const old = latest.current; const next = `${old.value.trimEnd()}${old.value.trim() ? ' ' : ''}${text}`; latest.current = { ...old, value: next }; old.onChange(next) }
  const toggle = async (): Promise<void> => {
    if (running.current) {
      if (recorder.current?.state === 'recording') { recorder.current.stop(); return }
      if (local.current) { local.current.stop(); return }
      cancel(); return
    }
    running.current = true
    const ticket = ++generation.current
    setState('listening'); setLabel('Preparing dictation…')
    const finish = (): void => { if (ticket === generation.current) { running.current = false; setState('idle'); setLabel(''); release(); void bridge.media.cancel() } }
    try {
      const prefs = await bridge.media.read(); if (ticket !== generation.current) return
      if (prefs.dictation === 'local') {
        setLabel('Listening offline. Pause to finish; Cancel discards this session.')
        if (isDemo) {
          const scope = globalThis as unknown as { SpeechRecognition?: RecognizerConstructor; webkitSpeechRecognition?: RecognizerConstructor }
          local.current = startLocalDictation(scope.SpeechRecognition || scope.webkitSpeechRecognition, prefs.language, text => { if (ticket === generation.current) append(text) }, finish, notice)
          return
        }
        const answer = await bridge.media.dictate(); if (ticket !== generation.current) return
        if (!answer.ok) throw Error(answer.error || 'Dictation failed.')
        if (answer.text) append(answer.text)
        finish(); return
      }
      if (isDemo) throw Error('Provider dictation requires the installed desktop app. No audio was recorded.')
      if (!prefs.transcriptionProvider || !prefs.transcriptionModel) throw Error('Choose a transcription provider and exact model in Voice & files before recording.')
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw Error('Microphone recording is unavailable in this window.')
      const authorized = await bridge.media.authorizeRecording({ provider: prefs.transcriptionProvider, model: prefs.transcriptionModel })
      if (ticket !== generation.current) return
      if (!authorized.ok) throw Error(authorized.error || 'Microphone use was refused.')
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      if (ticket !== generation.current) { audio.getTracks().forEach(track => track.stop()); return }
      stream.current = audio
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type))
      if (!mime) throw Error('This window cannot record a supported audio container.')
      const capture = new MediaRecorder(audio, { mimeType: mime }); recorder.current = capture
      const chunks: Blob[] = []; let bytes = 0
      setLabel(`Recording for ${prefs.transcriptionProvider} / ${prefs.transcriptionModel}. Stop sends; Cancel discards. Maximum 60 seconds.`)
      capture.ondataavailable = event => { if (ticket !== generation.current) return; bytes += event.data.size; if (bytes > 24 * 1024 * 1024) { cancel(); notice('Recording exceeded 24 MB and was discarded without upload.') } else if (event.data.size) chunks.push(event.data) }
      capture.onerror = () => { cancel(); notice('Microphone recording failed. No recording was uploaded.') }
      capture.onstop = () => {
        release(); recorder.current = null
        if (ticket !== generation.current) return
        setState('transcribing'); setLabel(`Transcribing with ${prefs.transcriptionProvider} / ${prefs.transcriptionModel}…`)
        void (async () => {
          const blob = new Blob(chunks, { type: mime })
          if (!blob.size) throw Error('The microphone recording was empty.')
          const data = new Uint8Array(await blob.arrayBuffer()); if (ticket !== generation.current) return
          const result = await bridge.media.decode({ name: mime.includes('mp4') ? 'dictation.m4a' : 'dictation.webm', mime, bytes: data, route: 'transcribe', expected: { provider: prefs.transcriptionProvider, model: prefs.transcriptionModel } })
          if (ticket !== generation.current) return
          if (!result.ok) throw Error(result.error || 'Transcription failed.')
          if (result.text) append(result.text)
        })().catch(error => { if (ticket === generation.current) notice((error as Error).message) }).finally(finish)
      }
      capture.start(250)
      timer.current = setTimeout(() => { if (capture.state === 'recording') capture.stop() }, 60_000)
    } catch (error) { if (ticket === generation.current) { notice((error as Error).message); finish() } }
  }
  return { active: state !== 'idle', transcribing: state === 'transcribing', label, toggle, cancel }
}
