export type RecognitionResult = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }
export type LocalRecognizer = {
  processLocally?: boolean; lang: string; interimResults: boolean; continuous: boolean
  start(): void; stop(): void; abort(): void
  onresult: ((event: RecognitionResult) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}
export type RecognizerConstructor = new () => LocalRecognizer

/** One explicit dictation session. Never use Chromium's implicit cloud recognizer. */
export function startLocalDictation(
  Ctor: RecognizerConstructor | undefined,
  language: string,
  append: (text: string) => void,
  ended: () => void,
  notice: (text: string) => void,
): { stop(): void; abort(): void } {
  if (!Ctor) throw Error('On-device dictation is unavailable in this window. No audio was sent. Windows voice typing (Win+H) can enter text in this box.')
  const ear = new Ctor()
  if (!('processLocally' in ear)) throw Error('This recognizer cannot guarantee on-device dictation. It was not started, and no provider was substituted. Windows voice typing (Win+H) is available separately.')
  ear.processLocally = true
  ear.lang = language
  ear.interimResults = false
  ear.continuous = false
  let processed = 0
  ear.onresult = event => {
    for (let index = Math.max(event.resultIndex, processed); index < event.results.length; index++) {
      const result = event.results[index]
      if (result.isFinal) { processed = index + 1; const text = result[0].transcript.trim(); if (text) append(text) }
    }
  }
  ear.onerror = event => {
    notice(event.error === 'not-allowed' || event.error === 'service-not-allowed'
      ? 'Microphone access was refused. No alternate speech provider was used.'
      : 'On-device dictation could not run. Check the microphone and installed speech language. No alternate speech provider was used.')
    ended()
  }
  ear.onend = ended
  try { ear.start() } catch (error) { ear.onresult = ear.onerror = ear.onend = null; throw error }
  return {
    stop: () => ear.stop(),
    abort: () => { ear.onresult = ear.onerror = ear.onend = null; ear.abort() },
  }
}
