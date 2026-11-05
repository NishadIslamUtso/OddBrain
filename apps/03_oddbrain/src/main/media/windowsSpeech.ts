import { join } from 'node:path'
import { runMediaCommand } from './process'
/** Fixed System.Speech program; no transcript or file contents enter the command. */
export function speechScript(language: string, file?: string): string {
  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(language)) throw Error('Invalid recognition language.')
  const literal = (s: string): string => "'" + s.replace(/'/g, "''") + "'"
  return `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Speech; $r=New-Object System.Speech.Recognition.SpeechRecognitionEngine ([Globalization.CultureInfo]::GetCultureInfo(${literal(language)})); try { $r.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar)); ${file ? `$r.SetInputToWaveFile(${literal(file)})` : '$r.SetInputToDefaultAudioDevice()'}; $words=New-Object System.Collections.Generic.List[string]; ${file ? 'while($true) { $x=$r.Recognize(); if($null -eq $x){break}; $words.Add($x.Text) }' : '$x=$r.Recognize([TimeSpan]::FromSeconds(60)); if($null -ne $x){$words.Add($x.Text)}'}; [Console]::Write(($words -join ' ')) } finally { $r.Dispose() }`
}
export async function windowsRecognize(language: string, signal: AbortSignal, file?: string): Promise<string> {
  if (process.platform !== 'win32') throw Error('Offline System.Speech recognition requires Windows and an installed recognition language. Choose a transcription provider explicitly in Voice & files on other systems.')
  const command = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const script = Buffer.from(speechScript(language, file), 'utf16le').toString('base64')
  const result = (await runMediaCommand(command, ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', script], signal, file ? 15 * 60_000 : 65_000)).toString('utf8').replace(/^\uFEFF/, '').trim()
  if (!result) throw Error('No speech was recognized. Check the microphone and installed recognition language; no other provider was used.')
  return result
}
