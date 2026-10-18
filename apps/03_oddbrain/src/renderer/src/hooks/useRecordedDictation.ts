import { useEffect, useRef, useState } from 'react'
import { MAX_MEDIA_BYTES, type MediaPreferences } from '@shared/lib/mediaProcessing'
import { bridge } from '../platform/bridge'

/** One user-started recording. No wake word, persistent listener or auto-send. */
export function useRecordedDictation(value: string, onChange: (value: string) => void) {
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [starting, setStarting] = useState(false)
  const current = useRef(value); current.current = value
  const startingRef = useRef(false), mounted = useRef(true), generation = useRef(0)
  const stream = useRef<MediaStream | null>(null), recorder = useRef<MediaRecorder | null>(null), request = useRef('')
  const notice = (detail: string): void => { if (mounted.current) window.dispatchEvent(new CustomEvent('app:notice', { detail })) }
  const release = (): void => { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null }
  const cancel = (): void => {
    generation.current++
    if (request.current) void bridge.media.cancel(request.current)
    request.current = ''
    if (recorder.current?.state === 'recording') recorder.current.stop()
    release()
    if (mounted.current) { setRecording(false); setTranscribing(false); setStarting(false); notice('Dictation cancelled. No transcript was added to the draft.') }
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancel() } }, [])
  const stop = (): void => { if (recorder.current?.state === 'recording') recorder.current.stop() }
  const start = async (preferences: MediaPreferences): Promise<void> => {
    if (recording || transcribing || startingRef.current) return
    if (!preferences.model) { notice('Choose a transcription-capable media model in Settings > Models & API keys > Attachments & dictation.'); return }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder !== 'function') { notice('Audio recording is unavailable in this runtime. No microphone was opened.'); return }
    if (!window.confirm(`Record one dictation clip and transcribe it using exactly ${preferences.model}? The audio may leave this machine if its endpoint is external. Stop ends recording; the transcript only enters the draft and is never sent automatically.`)) return
    startingRef.current = true; setStarting(true)
    const clip = ++generation.current
    const stale = (): boolean => !mounted.current || clip !== generation.current
    let timer: ReturnType<typeof setTimeout> | undefined
    let capture: MediaStream | undefined
    const releaseCapture = (): void => {
      capture?.getTracks().forEach(track => track.stop())
      if (stream.current === capture) stream.current = null
    }
    try {
      capture = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      if (stale()) { releaseCapture(); return }
      stream.current = capture
      const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type))
      const ear = new MediaRecorder(capture, mime ? { mimeType: mime } : undefined); recorder.current = ear
      const chunks: Blob[] = []; let bytes = 0, oversize = false
      ear.ondataavailable = event => {
        if (stale() || !event.data.size) return
        bytes += event.data.size
        if (bytes > MAX_MEDIA_BYTES) { oversize = true; if (ear.state === 'recording') ear.stop() }
        else chunks.push(event.data)
      }
      ear.onerror = () => {
        releaseCapture(); if (timer) clearTimeout(timer)
        if (stale()) return
        generation.current++; setRecording(false); setTranscribing(false)
        notice('Recording failed. No audio was sent.')
      }
      ear.onstop = () => {
        if (timer) clearTimeout(timer)
        releaseCapture()
        if (stale()) return
        setRecording(false)
        if (oversize) { notice('Recording exceeded 24 MB. Nothing was sent. Record a shorter clip.'); return }
        const blob = new Blob(chunks, { type: ear.mimeType || 'audio/webm' })
        if (!blob.size) { notice('No audio was recorded. Nothing was sent.'); return }
        setTranscribing(true); notice(`Transcribing with ${preferences.model}. Cancel stops the request; the draft is not sent.`)
        const id = crypto.randomUUID(); request.current = id
        void blob.arrayBuffer().then(data => {
          if (stale()) throw Error('Dictation cancelled.')
          return bridge.media.process({ id, name: blob.type.includes('ogg') ? 'dictation.ogg' : 'dictation.webm', mime: blob.type, data: new Uint8Array(data), remote: true, model: preferences.model, revision: preferences.revision, operation: 'transcribe' })
        }).then(result => {
          if (stale()) return
          if (!result.ok) throw Error(result.error)
          const next = `${current.current.trimEnd()}${current.current.trim() ? ' ' : ''}${result.text.trim()}`
          current.current = next; onChange(next); notice(`Dictation added to the draft (${result.source}). Nothing was sent to chat.`)
        }).catch(error => { if (!stale()) notice((error as Error).message) }).finally(() => {
          if (!stale()) { request.current = ''; setTranscribing(false) }
        })
      }
      ear.start(1000); setRecording(true)
      notice('Recording dictation. Stop ends the clip; Cancel discards it. Maximum three minutes.')
      timer = setTimeout(() => {
        if (stale()) return
        notice('The three-minute recording limit was reached. Transcribing the recorded clip.')
        if (ear.state === 'recording') ear.stop()
      }, 180_000)
    } catch (error) {
      releaseCapture(); if (timer) clearTimeout(timer)
      if (!stale()) { setRecording(false); notice(`Could not record audio: ${(error as Error).message}. No audio was sent.`) }
    } finally {
      startingRef.current = false
      if (mounted.current && (clip === generation.current || !stream.current)) setStarting(false)
    }
  }
  return { starting, recording, transcribing, start, stop, cancel }
}
