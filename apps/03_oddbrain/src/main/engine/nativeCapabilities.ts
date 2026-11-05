import { inspectAgyCapabilities } from './agyDiscovery'
import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { homedir } from 'node:os'
import { enginePathSync, resolveEngineCommand } from './enginePath'
import { sanitizeEnvironment } from './claudeCode'
import { killTree } from '../media/process'
import { isValidModelName, THINKING_MODES, type EngineModelEntry, type EngineSettings, type ThinkingMode } from '../../shared/lib/engine'
import { effortTarget, unverifiedCapabilities, type EngineCapabilityReport } from '../../shared/lib/engineCapabilities'

const REQUEST_ID = 'oddbrain-model-capabilities'
// Official Claude SDK initialize protocol. No user frame, prompt or slash command.
// Tools, MCP and startup hooks are disabled in this metadata-only process.
export const CLAUDE_INSPECTION_ARGS = [
  '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
  '--permission-mode', 'plan', '--tools', '', '--strict-mcp-config',
  '--mcp-config', '{"mcpServers":{}}', '--setting-sources', 'user,project,local',
  '--settings', '{"disableAllHooks":true}', '--no-session-persistence',
]
export const CLAUDE_INSPECTION_REQUEST = JSON.stringify({ type: 'control_request', request_id: REQUEST_ID, request: { subtype: 'initialize' } }) + '\n'

/** Strictly the matching initialize response; never extract capabilities from model text. */
export function parseClaudeCapabilities(raw: unknown, settings: EngineSettings): EngineCapabilityReport | null {
  if (!raw || typeof raw !== 'object') return null
  const frame = raw as Record<string, any>
  if (frame.type !== 'control_response' || frame.response?.request_id !== REQUEST_ID) return null
  const data = frame.response?.response
  if (frame.response.subtype !== 'success' || !Array.isArray(data?.models)) throw Error('Unsupported initialize response.')
  if (data.models.length > 500 || data.models.some((m: any) => !m || !isValidModelName(m.value)) || new Set(data.models.map((m: any) => m.value)).size !== data.models.length) throw Error('Incomplete or ambiguous native model catalog.')
  const rows = data.models
  const models: EngineModelEntry[] = []
  for (const m of rows) if (!models.some(row => row.name === m.value)) models.push({
    name: m.value, displayName: typeof m.displayName === 'string' ? m.displayName.slice(0, 160) : m.value,
    cloud: true, provider: 'native', sizeGB: null,
  })
  const report = unverifiedCapabilities(settings, 'This provider has not reported compatible effort controls. Engine default leaves its own settings unchanged.')
  report.ok = true
  report.models = models
  report.version = typeof data.claude_code_version === 'string' ? data.claude_code_version.slice(0, 80) : undefined
  // Native catalog metadata is NOT evidence about an Ollama/custom or saved-key route.
  if (settings.cloudProvider === 'anthropic' || (settings.model && settings.cloudProvider !== 'native')) return report
  if (!settings.model) { report.effort.note = 'The CLI chooses your default model. Select a listed CLI model to check its effort options.'; return report }
  if (data.account?.apiProvider !== 'firstParty') {
    report.effort.note = 'The CLI uses a different provider. Its effort support has not been verified.'
    return report
  }
  const selected = rows.find((m: any) => m.value === (settings.model || 'default'))
    ?? rows.find((m: any) => m.resolvedModel === settings.model)
  if (!selected) { report.effort.note = 'The CLI did not report effort support for this model. Refresh after changing your CLI settings.'; return report }
  if (selected.supportsEffort === false) {
    report.effort = { target: effortTarget(settings), status: 'unsupported', levels: [], note: 'The CLI reports no adjustable effort for this model. Engine default leaves its settings unchanged.' }
  } else if (selected.supportsEffort === true && Array.isArray(selected.supportedEffortLevels)) {
    // A future/unrecognized schema is not a reason to guess or silently clamp.
    const levels = selected.supportedEffortLevels
    if (levels.length && levels.every((level: unknown) => typeof level === 'string' && level !== 'default' && THINKING_MODES.includes(level as ThinkingMode))) {
      report.effort = { target: effortTarget(settings), status: 'reported', levels: [...new Set(levels)] as Exclude<ThinkingMode, 'default'>[], note: 'CLI-reported options, not an account-access check. A change is requested for your next message. Engine default uses the CLI’s own settings.' }
    }
  }
  return report
}

/** Bounded initialization, no shell and no model turn. No stderr or account details cross IPC. */
export function inspectClaudeCapabilities(settings: EngineSettings, options: {
  command?: string; cwd?: string; spawnProcess?: typeof spawn; signal?: AbortSignal; timeoutMs?: number
} = {}): Promise<EngineCapabilityReport> {
  const unknown = (note = 'Model details could not be read from Claude Code. Check its installation and refresh; no message was sent.') => unverifiedCapabilities(settings, note)
  const command = options.command ?? resolveEngineCommand('claude-code')
  if (/\.(cmd|bat)$/i.test(command)) return Promise.resolve(unknown('Model inspection needs the native Claude executable, not a shell shim. Choose claude.exe in engine settings.'))
  if (options.signal?.aborted) return Promise.resolve(unknown())
  return new Promise(resolve => {
    let child: ReturnType<typeof spawn>
    try {
      child = (options.spawnProcess ?? spawn)(command, CLAUDE_INSPECTION_ARGS, {
        cwd: options.cwd || settings.workspace || homedir(), shell: false, windowsHide: true, detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...sanitizeEnvironment(process.env), PATH: enginePathSync(), CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
      })
    } catch { resolve(unknown()); return }
    let settled = false, buffer = '', size = 0
    const decoder = new StringDecoder('utf8')
    const finish = (answer: EngineCapabilityReport): void => {
      if (settled) return
      settled = true; clearTimeout(timer); options.signal?.removeEventListener('abort', abort)
      killTree(child); resolve(answer)
    }
    const abort = (): void => finish(unknown())
    const timer = setTimeout(abort, options.timeoutMs ?? 20_000)
    options.signal?.addEventListener('abort', abort, { once: true })
    child.on('error', abort); child.on('close', abort)
    child.stdin?.on('error', abort)
    child.stderr?.on('data', (data: Buffer) => { size += data.length; if (size > 1_000_000) abort() })
    child.stdout?.on('data', (data: Buffer) => {
      if (settled) return
      size += data.length
      if (size > 1_000_000) { abort(); return }
      buffer += decoder.write(data)
      let end: number
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1)
        try {
          const answer = parseClaudeCapabilities(JSON.parse(line), settings)
          if (answer) { finish(answer); return }
        } catch { abort(); return }
      }
    })
    try { child.stdin?.write(CLAUDE_INSPECTION_REQUEST) } catch { abort() }
    if (options.signal?.aborted) abort()
  })
}

/** Engine-specific native metadata only. No test-prompt fallback. */
export async function inspectEngineCapabilities(settings: EngineSettings, cwd?: string): Promise<EngineCapabilityReport> {
  if (settings.id === 'agy') return inspectAgyCapabilities(settings, { cwd })
  return inspectClaudeCapabilities(settings, { cwd })
}

/** The main process checks again; a renderer-provided option list is never authority. */
export async function checkEffortSelection(settings: EngineSettings, thinking: string, expectedTarget: string,
  inspect: (settings: EngineSettings) => Promise<EngineCapabilityReport> = inspectEngineCapabilities,
): Promise<{ ok: boolean; answer: string }> {
  if (expectedTarget !== effortTarget(settings) || !THINKING_MODES.includes(thinking as ThinkingMode)) return { ok: false, answer: 'The model or effort choice changed. Reopen Reasoning effort and try again.' }
  if (thinking !== 'default') {
    const report = await inspect(settings.id === 'agy' ? { ...settings, thinking: thinking as ThinkingMode, effortTarget: expectedTarget } : settings)
    if (report.effort.target !== expectedTarget || report.effort.status !== 'reported' || !report.effort.levels.includes(thinking as Exclude<ThinkingMode, 'default'>)) return { ok: false, answer: 'This effort level was not reported for this model and provider. Nothing was changed.' }
  }
  return { ok: true, answer: thinking === 'default' ? 'The next message uses the engine’s own effort setting.' : 'Reasoning effort requested for the next message. The current response is unchanged.' }
}

/** One inspection per window, shared by model/effort readers; no persistent account cache. */
export function createCapabilityInspector(run = inspectClaudeCapabilities, runAgy = inspectAgyCapabilities) {
  const jobs = new Map<number, { key: string; controller: AbortController; promise: Promise<EngineCapabilityReport> }>()
  const cancel = (owner: number): void => { jobs.get(owner)?.controller.abort(); jobs.delete(owner) }
  return {
    inspect(owner: number, settings: EngineSettings, cwd: string): Promise<EngineCapabilityReport> {
      const command = resolveEngineCommand(settings.id), key = JSON.stringify([effortTarget(settings), settings.thinking, command, cwd])
      const existing = jobs.get(owner)
      if (existing?.key === key) return existing.promise
      cancel(owner)
      const controller = new AbortController()
      const job = { key, controller, promise: Promise.resolve(null as unknown as EngineCapabilityReport) }
      job.promise = (settings.id === 'agy' ? runAgy : run)(settings, { command, cwd, signal: controller.signal })
        .catch(() => unverifiedCapabilities(settings, 'Model inspection could not finish. Refresh to try again.'))
        .finally(() => { if (jobs.get(owner) === job) jobs.delete(owner) })
      jobs.set(owner, job)
      return job.promise
    },
    cancel,
    cancelAll(): void { for (const owner of jobs.keys()) cancel(owner) },
  }
}
