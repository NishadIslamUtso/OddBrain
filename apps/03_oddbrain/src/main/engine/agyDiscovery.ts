import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { enginePathSync, resolveEngineCommand } from './enginePath'
import { sanitizeEnvironment } from './claudeCode'
import { killTree } from '../media/process'
import { isValidModelName, THINKING_MODES, type EngineModelEntry, type EngineSettings, type ThinkingMode } from '../../shared/lib/engine'
import { selectedEffort, unverifiedCapabilities, type EngineCapabilityReport } from '../../shared/lib/engineCapabilities'

type RecordValue = Record<string, unknown>
const record = (value: unknown): RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}

/** Commands, not prompts. Closed stdin, bounded output, no shell or returned stderr. */
export function runAgyInspection(command: string, args: string[], options: { cwd?: string; signal?: AbortSignal; timeoutMs?: number; spawnProcess?: typeof spawn } = {}): Promise<string> {
  if (/\.(cmd|bat)$/i.test(command)) return Promise.reject(Error('Select the native agy executable, not a shell shim.'))
  if (options.signal?.aborted) return Promise.reject(Error('Canceled.'))
  return new Promise((resolve, reject) => {
    const child = (options.spawnProcess ?? spawn)(command, args, {
      cwd: options.cwd || homedir(), env: { ...sanitizeEnvironment(process.env), PATH: enginePathSync() },
      shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
    })
    let settled = false, bytes = 0
    const chunks: Buffer[] = []
    const finish = (error?: string): void => {
      if (settled) return
      settled = true; clearTimeout(timer); options.signal?.removeEventListener('abort', abort)
      if (error) { killTree(child); reject(Error(error)) } else resolve(Buffer.concat(chunks).toString('utf8'))
    }
    const abort = (): void => finish('Canceled.')
    const timer = setTimeout(() => finish('agy model inspection timed out. Check sign-in in your terminal and refresh.'), options.timeoutMs ?? 20_000)
    options.signal?.addEventListener('abort', abort, { once: true })
    child.stdout?.on('data', (data: Buffer) => { bytes += data.length; if (bytes > 1_000_000) finish('agy returned too much inspection output.'); else if (!settled) chunks.push(data) })
    child.stderr?.on('data', (data: Buffer) => { bytes += data.length; if (bytes > 1_000_000) finish('agy returned too much inspection output.') })
    child.on('error', () => finish('agy could not start. Check its executable.'))
    child.on('close', code => finish(code === 0 ? undefined : 'agy could not read model details. Check its sign-in and configuration in your terminal.'))
    if (options.signal?.aborted) abort()
  })
}

/** Older print mode might treat a slash command as a model prompt. Never probe it. */
export function supportsAgyInspection(raw: string): string | null {
  const match = raw.trim().match(/^(?:agy(?:\s+(?:CLI|version))?\s+)?v?(\d+)\.(\d+)\.(\d+)(?:\s.*)?$/i)
  if (!match) return null
  const [, major, minor, patch] = match
  if (+major < 1 || (+major === 1 && (+minor < 1 || (+minor === 1 && +patch < 11)))) return null
  return `${major}.${minor}.${patch}`
}

/** Only explicit native command metadata is evidence; free response text is not. */
export function agyCommandData(raw: string, name: 'models' | 'effort'): RecordValue {
  let frames: RecordValue[]
  try { frames = [record(JSON.parse(raw))] }
  catch { frames = raw.trim().split(/\r?\n/).filter(Boolean).map(line => record(JSON.parse(line))) }
  // Models uses stream-json; /effort uses the single-object JSON envelope.
  const results = frames.filter(frame => frame.event === 'result' || !('event' in frame))
  if (results.length !== 1 || frames.some(frame => frame.event && !['result', 'command_result'].includes(String(frame.event)))) throw Error('Unexpected agy inspection envelope.')
  const result = record(results[0].event === 'result' ? results[0].result : results[0])
  const usage = record(result.usage)
  if (result.status !== 'SUCCESS' || result.num_turns !== 0 || result.conversation_id !== '' ||
      !['input_tokens', 'output_tokens', 'thinking_tokens', 'cache_read_tokens', 'total_tokens'].every(key => usage[key] === 0)) throw Error('agy did not return a successful zero-turn report.')
  const command = record(result.command)
  if (command.name !== name || !command.data || typeof command.data !== 'object' || Array.isArray(command.data)) throw Error('agy did not return the requested command metadata.')
  return record(command.data)
}
export function parseAgyModels(raw: string): EngineModelEntry[] {
  const data = agyCommandData(raw, 'models')
  if (!Array.isArray(data.models) || data.models.length > 500) throw Error('Unknown agy model-list schema.')
  const models: EngineModelEntry[] = []
  for (const value of data.models) {
    const row = record(value)
    if (!isValidModelName(row.id) || (row.label !== undefined && typeof row.label !== 'string')) throw Error('Invalid agy model entry.')
    if (!models.some(model => model.name === row.id)) models.push({ name: row.id, displayName: typeof row.label === 'string' ? row.label.slice(0, 160) : row.id, provider: 'native', cloud: true, sizeGB: null })
  }
  return models
}
// Conditional adapter only: these fields lack a raw native capture. Unknown
// schemas remain unverified; never infer effort from a model name or prose.
export function parseAgyEffort(raw: string, report: EngineCapabilityReport, requested: ThinkingMode = 'default'): EngineCapabilityReport {
  const data = agyCommandData(raw, 'effort')
  if (data.adjustable === false) {
    report.effort = { ...report.effort, status: 'unsupported', levels: [], note: 'agy reports no adjustable effort for this model and sign-in. Engine default keeps its own setting.' }
  } else if (data.adjustable === true && Array.isArray(data.available) && data.available.length > 0 &&
    data.available.every(level => level !== 'default' && THINKING_MODES.includes(level)) &&
    typeof data.current === 'string' && data.available.includes(data.current) && (requested === 'default' || data.current === requested)) {
    report.effort = { ...report.effort, status: 'reported', levels: [...new Set(data.available)], note: `agy reports ${data.current} for this selection. Changes apply to the next message; Engine default keeps the model variant’s own setting.` }
  } else throw Error('Unrecognized or conflicting agy effort metadata.')
  return report
}
export async function inspectAgyCapabilities(settings: EngineSettings, options: { command?: string; cwd?: string; signal?: AbortSignal; run?: typeof runAgyInspection } = {}): Promise<EngineCapabilityReport> {
  const report = unverifiedCapabilities(settings, 'agy could not report effort options. Engine default leaves its own selection unchanged.')
  const command = options.command ?? resolveEngineCommand('agy'), run = options.run ?? runAgyInspection
  const environment = { cwd: options.cwd || settings.workspace || homedir(), signal: options.signal }
  try {
    const version = supportsAgyInspection(await run(command, ['--version'], environment))
    if (!version) { report.effort.note = 'Could not verify read-only report support. agy 1.1.11 or newer is required. No prompt was sent.'; return report }
    report.version = version
    const help = await run(command, ['--help'], environment)
    if (!/^\s+models(?:\s|$)/m.test(help) || !help.includes('--output-format')) throw Error()
    // Global flags precede the subcommand (agy rejects this flag after `models`).
    report.models = parseAgyModels(await run(command, ['--output-format', 'stream-json', 'models'], environment))
    report.ok = true
    if (!settings.model) { report.effort.note = 'Choose an agy model to check its effort. Listed variants are the CLI’s own choices.'; return report }
    if (!isValidModelName(settings.model) || settings.cloudProvider === 'anthropic' || !report.models.some(model => model.name === settings.model)) return report
    if (!help.includes('--effort')) return report
    const requested = selectedEffort(settings)
    try {
      const raw = await run(command, ['--output-format', 'json', '--model', settings.model, ...(requested !== 'default' ? ['--effort', requested] : []), '--print', '/effort'], environment)
      return parseAgyEffort(raw, report, requested)
    } catch {
      report.effort.note = 'agy did not confirm effort options for this exact model selection. Choose a listed model variant or use Engine default.'
      return report
    }
  } catch {
    report.effort.note = 'agy model details could not be read. Check its installation, sign-in and configuration in your terminal, then refresh. No task prompt was sent.'
    return report
  }
}
