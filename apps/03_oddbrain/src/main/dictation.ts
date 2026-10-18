/**
 * Dictation for the target machine: Windows' own speech engine (SAPI),
 * spawned per session, spoken words streamed back as plain lines. This is
 * local-first dictation — nothing leaves the machine, no network listener
 * is involved. The window's own Chromium listener stays as the fallback in
 * the browser preview; when neither path exists the button says so with the
 * real reason, and never fakes a live microphone.
 */
import { spawn } from 'node:child_process'

/** The child shape this service uses — narrow, so tests can stand in for spawn. */
export type DictationChild = {
  stdout: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown } | null
  stderr: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown } | null
  on(event: 'error' | 'close', listener: (...args: never[]) => void): unknown
  kill(): boolean
}

export type DictationEvent = { kind: 'text'; value: string } | { kind: 'stopped'; reason?: string }

export type DictationService = {
  /** Begin listening. ok:false answers name the real reason. */
  start(onEvent: (event: DictationEvent) => void): { ok: boolean; answer: string }
  /** End this listening session (the spawned recognizer is ours to kill). */
  stop(): { ok: boolean; answer: string }
}

/**
 * The recognizer, as one -Command payload: default microphone, English
 * dictation grammar, phrases printed to stdout as they are accepted.
 * SpeechRecognized fires at phrase boundaries, which is exactly the cadence
 * the composer wants — a sentence at a time, no hallucinated buffering.
 */
const RECOGNIZER = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -AssemblyName System.Speech',
  "$voice = New-Object System.Speech.Recognition.SpeechRecognitionEngine([System.Globalization.CultureInfo]::GetCultureInfo('en-US'))",
  '$voice.SetInputToDefaultAudioDevice()',
  '$grammar = New-Object System.Speech.Recognition.DictationGrammar',
  "$grammar.Name = 'oddbrain-dictation'",
  '$voice.LoadGrammar($grammar)',
  "$onHeard = { param($sender, $args) if ($args.Result -and $args.Result.Confidence -ge 0.30) { [Console]::Out.WriteLine($args.Result.Text) ; [Console]::Out.Flush() } }",
  '$voice.add_SpeechRecognized($onHeard)',
  '$voice.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)',
  'while ($true) { Start-Sleep -Milliseconds 250 }',
].join('; ')

export function createDictationService(options: {
  platform?: NodeJS.Platform
  spawnImpl?: (command: string, args: string[], options: object) => DictationChild
} = {}): DictationService {
  const platform = options.platform ?? process.platform
  const spawnImpl = options.spawnImpl ?? ((command: string, args: string[], spawnOptions: object) =>
    spawn(command, args, spawnOptions) as unknown as DictationChild)
  let child: DictationChild | null = null

  return {
    start(onEvent) {
      if (child) return { ok: true, answer: 'Already listening.' }
      if (platform !== 'win32') {
        return {
          ok: false,
          answer: 'Windows dictation runs on Windows. In this window, the browser\u2019s own listener is used when it exists; otherwise the button reports that no listener is present.',
        }
      }
      let spawned: DictationChild
      try {
        spawned = spawnImpl(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', RECOGNIZER],
          { stdio: ['ignore', 'pipe', 'pipe'] }
        )
      } catch (failure) {
        return { ok: false, answer: `The speech recognizer could not start: ${(failure as Error).message}. Nothing was recorded.` }
      }
      child = spawned
      let buffer = ''
      spawned.stdout?.on('data', (chunk: Buffer | string) => {
        buffer += String(chunk)
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const value = line.trim()
          if (value) onEvent({ kind: 'text', value })
        }
      })
      spawned.stderr?.on('data', (chunk: Buffer | string) => {
        const message = String(chunk).trim()
        if (message) onEvent({ kind: 'stopped', reason: `The speech recognizer said: ${message.slice(0, 300)}. Nothing more will be recorded.` })
      })
      spawned.on('error', ((failure: Error) => {
        if (child === spawned) child = null
        onEvent({ kind: 'stopped', reason: `The speech recognizer stopped: ${failure.message}. Nothing was recorded.` })
      }) as never)
      spawned.on('close', ((code: number | null) => {
        if (child !== spawned) return
        child = null
        if (code !== null && code !== 0) {
          onEvent({ kind: 'stopped', reason: `The speech recognizer exited (${code}). If no words appeared, this machine may have no speech engine installed — Settings > Speech in Windows.` })
        } else {
          onEvent({ kind: 'stopped' })
        }
      }) as never)
      return { ok: true, answer: 'Listening on the default microphone. Speak in phrases; each accepted phrase lands in the box.' }
    },

    stop() {
      if (!child) return { ok: false, answer: 'Not listening.' }
      const current = child
      child = null
      current.kill()
      return { ok: true, answer: 'Stopped.' }
    },
  }
}
