import { createCommandLibrary } from './library'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, realpathSync, statSync, writeSync } from 'node:fs'
import { join, resolve, isAbsolute } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { configBytes, commitConfigs, noLinkedPath } from '../engine/configTransaction'
import { createChatShellReview } from '../chatShellReview'
import type { CommandRecord, ShellExecution, ShellRequest, ShellResult } from '../../shared/lib/commands'
const ID = /^\d{13}-[a-f0-9-]{36}$/
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
export const COMMAND_DISCLOSURE = 'App-owned OS command, not an AI task or a native engine tool. Runs as your OS user outside the engine’s sandbox; the starting folder does not confine file or network access. No elevation or saved app API keys are supplied. Commands are not automatically checkpointed. Review covers this command and folder, not the contents of referenced scripts. Stop requests do not prove all escaped/background descendants exited.'
const ENV_KEYS = new Set(['PATH', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'APPDATA', 'LOCALAPPDATA', 'LANG', 'LC_ALL', 'LC_CTYPE', 'PATHEXT'])
export function commandEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(source).filter(([key, value]) => ENV_KEYS.has(key.toUpperCase()) && typeof value === 'string'))
}
export function commandSpec(command: string, platform: NodeJS.Platform = process.platform, env = process.env): ShellExecution {
  if (typeof command !== 'string' || !command.trim() || command.length > 32_000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(command) || Buffer.from(command, 'utf8').toString('utf8') !== command) throw Error('Provide a valid command up to 32,000 characters. Nothing was shortened or run.')
  const environmentKeys = Object.keys(commandEnvironment(env)).sort()
  if (platform === 'win32') {
    const root = env.SystemRoot || env.SYSTEMROOT
    if (!root || !/^[A-Za-z]:[\\/]/.test(root)) throw Error('Windows system directory could not be identified. No shell was selected.')
    const program = root.replace(/[\\/]+$/, '') + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    const script = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [Console]::OutputEncoding;\n' + command
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    if (encoded.length + program.length + 128 > 32_000) throw Error('This script exceeds the Windows encoded command-line budget. Nothing was shortened. Use a short invocation of a script you have separately reviewed.')
    return { program, arguments: ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], script, environmentKeys }
  }
  if (platform !== 'linux' && platform !== 'darwin') throw Error('This OS has no configured command runner. Nothing was executed.')
  return { program: '/bin/sh', arguments: ['-c', command], script: command, environmentKeys }
}
type Scope = { cwd: string; authority: string; stableAuthority?: string; busy?: boolean; allowed: boolean; explanation: string }
type Lease = { recheck(): void; release(): void }
export function createCommandRunner(options: {
  root: string
  scope(): Scope
  acquire(request: ShellRequest, authority: string, signal: AbortSignal): Promise<Lease>
  spawnProcess?: typeof spawn
  deadlineMs?: number
  maxBytes?: number
}) {
  const limit = options.maxBytes ?? 2_000_000, deadline = options.deadlineMs ?? 300_000
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 2_000_000 || !Number.isSafeInteger(deadline) || deadline < 1 || deadline > 300_000) throw Error('Invalid command resource limits.')
  const library = createCommandLibrary(join(options.root, 'saved-commands'))
  const checkSource = (request: ShellRequest) => {
    if (!request.source) return
    const saved = library.read(request.source.id)
    if (saved.archived || saved.platform !== process.platform || saved.digest !== request.source.digest || saved.name !== request.source.name || saved.command !== request.command || saved.cwd !== request.cwd) throw Error('Saved command was archived, changed or belongs to another OS. Review the current command explicitly; nothing was run.')
  }
  const reviews = new Map<number, ReturnType<typeof createChatShellReview>>()
  let active: { owner: number; controller: AbortController; id: string | null } | null = null
  const directory = (id: string) => { if (!ID.test(id)) throw Error('Invalid command record ID.'); const dir = join(options.root, id); noLinkedPath(dir); return dir }
  const file = (id: string) => join(directory(id), 'record.json')
  const readRecord = (id: string): CommandRecord => {
    const bytes = configBytes(file(id)); if (!bytes) throw Error('Command record is missing.')
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as CommandRecord
    if (value?.id !== id || !['starting', 'running', 'finished', 'interrupted'].includes(value.state) || typeof value.request?.command !== 'string' || typeof value.request?.cwd !== 'string' || typeof value.note !== 'string' || typeof value.at !== 'string' || typeof value.outputComplete !== 'boolean' || !Number.isSafeInteger(value.stdoutBytes) || !Number.isSafeInteger(value.stderrBytes) || value.stdoutBytes < 0 || value.stderrBytes < 0 || value.stdoutBytes + value.stderrBytes > limit || !(value.exitCode === null || Number.isSafeInteger(value.exitCode))) throw Error('Command record is damaged. Original files were not changed.')
    if (value.request.source && (typeof value.request.source.id !== 'string' || !ID.test(value.request.source.id) || typeof value.request.source.name !== 'string' || !/^[a-f0-9]{64}$/.test(value.request.source.digest))) throw Error('Saved command provenance is invalid. Original retained.')
    if (value.outputComplete && (value.state !== 'finished' || value.exitCode === null || !/^[a-f0-9]{64}$/.test(value.stdoutHash || '') || !/^[a-f0-9]{64}$/.test(value.stderrHash || ''))) throw Error('Command completion metadata is incomplete. Originals were retained.')
    return value
  }
  const observed = (record: CommandRecord) => active?.id !== record.id && ['starting', 'running'].includes(record.state) ? { ...record, state: 'interrupted' as const, outputComplete: false, note: 'No final result is recorded and this app has no active handle for this run. It may have been interrupted before or during execution; escaped descendants may have continued. Nothing was automatically retried.' } : record
  const inspect = (request: ShellRequest) => {
    checkSource(request)
    const scope = options.scope()
    if (!scope.allowed || active) throw Error(active ? 'Another app command is preparing or running.' : scope.explanation)
    if (!isAbsolute(request.cwd) || resolve(request.cwd) !== resolve(scope.cwd)) throw Error('Use the app’s selected working folder. Mentioning another path does not authorize it.')
    noLinkedPath(request.cwd)
    const folder = statSync(request.cwd)
    if (!folder.isDirectory()) throw Error('The selected working folder is not a directory.')
    const execution = commandSpec(request.command), program = realpathSync(execution.program), executable = statSync(program)
    if (!executable.isFile()) throw Error('The OS shell is not a regular executable.')
    execution.program = program
    const environment = commandEnvironment(process.env)
    const stamp = sha(JSON.stringify([scope.authority, resolve(request.cwd), folder.dev, folder.ino, execution, environment, executable.dev, executable.ino, executable.size, executable.mtimeMs, executable.ctimeMs]))
    const stableStamp = sha(JSON.stringify([scope.stableAuthority || scope.authority, resolve(request.cwd), folder.dev, folder.ino, execution, environment, executable.dev, executable.ino, executable.size, executable.mtimeMs, executable.ctimeMs]))
    return { scope, execution, stamp, stableStamp }
  }
  type Checked = ReturnType<typeof inspect>
  type Active = { owner: number; controller: AbortController; id: string | null }
  const runOne = async (request: ShellRequest, checked: Checked, own: Active, lease: Lease, outputLimit = limit, recorded?: (id: string) => void): Promise<ShellResult> => {
      const controller = own.controller, expected = checked.stamp
      controller.signal.throwIfAborted(); lease.recheck()
      // Repeat filesystem/environment checks without treating our own reservation as another run.
      const folder = statSync(request.cwd); noLinkedPath(request.cwd)
      const executable = statSync(checked.execution.program)
      const stamp = sha(JSON.stringify([checked.scope.authority, resolve(request.cwd), folder.dev, folder.ino, checked.execution, commandEnvironment(process.env), executable.dev, executable.ino, executable.size, executable.mtimeMs, executable.ctimeMs]))
      if (stamp !== expected || realpathSync(commandSpec(request.command).program) !== checked.execution.program) throw Error('Command target changed before launch. Nothing was run.')
      const id = `${Date.now()}-${randomUUID()}`; own.id = id
      mkdirSync(directory(id), { recursive: true, mode: 0o700 })
      const stdoutFile = join(directory(id), 'stdout.bin'), stderrFile = join(directory(id), 'stderr.bin')
      let out: number | undefined, err: number | undefined, previous: Buffer | null = null
      const record: CommandRecord = { id, at: new Date().toISOString(), request, execution: checked.execution, state: 'starting', exitCode: null, signal: null, stdoutBytes: 0, stderrBytes: 0, outputComplete: false, note: COMMAND_DISCLOSURE }
      const persist = () => { const text = JSON.stringify(record); commitConfigs([{ path: file(id), text, expected: previous }]); previous = Buffer.from(text) }
      try {
        persist() // No process before a durable, inspectable work order exists.
        recorded?.(id)
        out = openSync(stdoutFile, 'wx', 0o600); err = openSync(stderrFile, 'wx', 0o600)
        controller.signal.throwIfAborted(); lease.recheck(); checkSource(request)
        const result = await new Promise<ShellResult>(resolveResult => {
          let child: ChildProcess | undefined, ended = false, stopNote = '', saveFault = '', closed = false
          const buffers = { stdout: [] as Buffer[], stderr: [] as Buffer[] }
          const stop = (reason: string) => {
            if (!stopNote) {
              stopNote = reason; record.note = reason + ' Process exit has not yet been confirmed.'; record.outputComplete = false
              try { persist() } catch { saveFault ||= 'The stop request could not be recorded on disk.' }
            }
            if (!child || closed) return
            if (process.platform === 'win32' && child.pid && !options.spawnProcess) {
              const taskkill = join(process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows', 'System32', 'taskkill.exe')
              execFile(taskkill, ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, error => { if (error && !closed) { try { child?.kill('SIGKILL') } catch { saveFault ||= 'Process stop could not be confirmed.' } } })
            } else {
              try { if (child.pid && !options.spawnProcess) process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL') }
              catch { try { child.kill('SIGKILL') } catch { saveFault ||= 'Process stop could not be confirmed.' } }
            }
          }
          const finish = (code: number | null, signal: string | null) => {
            if (ended) return; ended = true; closed = true
            clearTimeout(timer); controller.signal.removeEventListener('abort', abort)
            record.exitCode = code; record.signal = signal; record.finishedAt = new Date().toISOString()
            record.state = stopNote || saveFault || code === null ? 'interrupted' : 'finished'
            record.outputComplete = !stopNote && !saveFault && code !== null
            const stdout = Buffer.concat(buffers.stdout), stderr = Buffer.concat(buffers.stderr)
            record.stdoutHash = sha(stdout); record.stderrHash = sha(stderr)
            record.note = [stopNote, saveFault, 'Raw output bytes are retained; visible output is UTF-8 only. Exit status belongs to the launched shell, not proof every background descendant exited.'].filter(Boolean).join(' ')
            try { fsyncSync(out!); fsyncSync(err!);
              if (!configBytes(stdoutFile)?.equals(stdout) || !configBytes(stderrFile)?.equals(stderr)) { record.outputComplete = false; record.note += ' Saved output does not match the captured bytes. Keep the visible result; files were not overwritten to hide the mismatch.' }
              persist() } catch { record.outputComplete = false; record.note += ' Final output/record persistence could not be confirmed. Keep visible output before closing; no retry was made.' }
            const display = (bytes: Buffer) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { return 'This stream contains non-UTF-8 bytes. Download its raw output to inspect it.' } }
            resolveResult({ exitCode: code, stdout: display(stdout), stderr: display(stderr), interrupted: record.state !== 'finished', outputComplete: record.outputComplete, runId: id, note: record.note })
          }
          const receive = (stream: 'stdout' | 'stderr', data: Buffer) => {
            if (ended || saveFault || stopNote) return
            const remaining = outputLimit - record.stdoutBytes - record.stderrBytes, chunk = Buffer.from(data).subarray(0, Math.max(0, remaining))
            try {
              let offset = 0; while (offset < chunk.length) { const n = writeSync(stream === 'stdout' ? out! : err!, chunk, offset, chunk.length - offset); if (!n) throw Error(); offset += n }
              buffers[stream].push(Buffer.from(chunk)); if (stream === 'stdout') record.stdoutBytes += chunk.length; else record.stderrBytes += chunk.length
            } catch { saveFault = 'Output storage failed. Only the confirmed prefix is retained.'; stop(saveFault); return }
            if (data.length > remaining) stop('Combined output limit reached. Stop requested; the retained output is explicitly incomplete.')
          }
          const abort = () => stop('Stop requested by the owner or because access changed. Completion is unconfirmed.')
          const timer = setTimeout(() => stop('Command exceeded its time limit. Stop requested; no automatic retry.'), deadline)
          controller.signal.addEventListener('abort', abort, { once: true })
          try {
            child = (options.spawnProcess || spawn)(checked.execution.program, checked.execution.arguments, { cwd: request.cwd, env: commandEnvironment(process.env), shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
            child.stdout?.on('data', chunk => receive('stdout', chunk)); child.stderr?.on('data', chunk => receive('stderr', chunk))
            const pipeError = () => { if (!ended) { saveFault = 'The output pipe failed; the retained prefix may be incomplete.'; stop(saveFault) } }
            child.stdout?.on('error', pipeError); child.stderr?.on('error', pipeError)
            child.once('spawn', () => { record.state = 'running'; try { persist() } catch { saveFault = 'Running state could not be saved.'; stop(saveFault) } })
            child.once('error', () => { saveFault ||= 'The OS command could not start or its process channel failed.'; stop(saveFault); if (!child?.pid) finish(null, null) })
            child.once('close', (code, signal) => finish(code, signal))
            if (controller.signal.aborted) abort()
          } catch { saveFault = 'The OS shell could not be launched. No automatic retry.'; finish(null, null) }
        })
        return result
      } finally { if (out !== undefined) closeSync(out); if (err !== undefined) closeSync(err) }
  }
  const execute = async (owner: number, request: ShellRequest, expected: string): Promise<ShellResult> => {
    const checked = inspect(request)
    if (checked.stamp !== expected) throw Error('Command authority, folder or environment changed. Review again; nothing was run.')
    const own: Active = { owner, controller: new AbortController(), id: null }; active = own
    let lease: Lease | undefined
    try { lease = await options.acquire(request, checked.scope.authority, own.controller.signal); return await runOne(request, checked, own, lease) }
    finally { lease?.release(); if (active === own) active = null }
  }
  /** Main-only capability. No IPC exposes run(); workflow approval owns it. */
  const plan = (input: ShellRequest[]) => {
    if (!Array.isArray(input) || !input.length || input.length > 8) throw Error('A workflow has one to eight exact commands.')
    const requests = structuredClone(input), checked = requests.map(request => inspect(request))
    const fingerprint = sha(JSON.stringify(checked.map(entry => entry.stamp))), stableFingerprint = sha(JSON.stringify(checked.map(entry => entry.stableStamp)))
    let consumed = false
    return {
      fingerprint, stableFingerprint, executions: checked.map(entry => entry.execution),
      async run(owner: number, signal: AbortSignal, callbacks: { starting(index: number): void; recorded(index: number, id: string): void; finished(index: number, result: ShellResult): void }) {
        if (consumed) throw Error('Workflow execution capability was already consumed.')
        consumed = true; signal.throwIfAborted()
        const fresh = requests.map(request => inspect(request))
        if (sha(JSON.stringify(fresh.map(entry => entry.stamp))) !== fingerprint) throw Error('Workflow authority or targets changed. Review again.')
        const own: Active = { owner, controller: new AbortController(), id: null }; active = own
        const abort = () => own.controller.abort(signal.reason)
        signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort()
        const timer = setTimeout(() => own.controller.abort('Workflow time budget reached'), 900_000)
        let lease: Lease | undefined, remaining = 8_000_000
        try {
          lease = await options.acquire(requests[0], checked[0].scope.authority, own.controller.signal)
          for (let index = 0; index < requests.length; index++) {
            own.controller.signal.throwIfAborted(); lease.recheck()
            if (remaining <= 0) throw Error('Workflow output budget reached; later steps were not started.')
            callbacks.starting(index)
            const result = await runOne(requests[index], checked[index], own, lease, Math.min(limit, remaining), id => callbacks.recorded(index, id))
            callbacks.finished(index, result)
            if (result.runId) { const record = readRecord(result.runId); remaining -= record.stdoutBytes + record.stderrBytes }
            if (result.interrupted || !result.outputComplete || result.exitCode !== 0) return
          }
        } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); lease?.release(); if (active === own) active = null }
      },
    }
  }

  const service = (owner: number) => {
    let review = reviews.get(owner)
    if (!review) {
      review = createChatShellReview({ inspect: async request => { const result = inspect(request); return { supported: true, authorityFingerprint: result.stamp, execution: result.execution, explanation: `${COMMAND_DISCLOSURE} A stop is requested after ${deadline / 1000} seconds or ${limit.toLocaleString()} combined output bytes; termination is not guaranteed. No automatic retries.` } }, execute: (request, stamp) => execute(owner, request, stamp) })
      reviews.set(owner, review)
    }
    return review
  }
  const output = (id: string, stream: 'stdout' | 'stderr') => {
    if (!['stdout', 'stderr'].includes(stream)) throw Error('Choose a recorded output stream.')
    const record = observed(readRecord(id)), bytes = configBytes(join(directory(id), stream + '.bin'))
    if (bytes === null) throw Error('Output file is missing. Nothing was substituted.')
    const expected = stream === 'stdout' ? record.stdoutHash : record.stderrHash
    if (expected && sha(bytes) !== expected) throw Error('Saved output changed after recording; it is not the confirmed original.')
    return bytes
  }
  return {
    plan,
    readiness: () => ({ ...options.scope(), busy: !!active || options.scope().busy === true }),
    running: () => active !== null,
    context() { const scope = options.scope(); return { cwd: scope.cwd, allowed: scope.allowed && !active, explanation: active ? 'An app command is preparing or running.' : scope.explanation || COMMAND_DISCLOSURE, activeId: active?.id || null } },
    // Ordinary IPC cannot forge saved-command provenance.
    preview: (owner: number, request: ShellRequest) => service(owner).preview({ command: request?.command, cwd: request?.cwd }),
    saved: (before?: string) => library.list(before),
    save(input: { name: string; command: string; cwd: string }) {
      const scope = options.scope()
      if (typeof input?.cwd !== 'string' || !isAbsolute(input.cwd) || resolve(input.cwd) !== resolve(scope.cwd)) throw Error('Save commands for the selected working folder, not an unapproved path.')
      commandSpec(input.command); noLinkedPath(input.cwd); if (!statSync(input.cwd).isDirectory()) throw Error('Choose a working directory.')
      return library.save({ name: input.name, command: input.command, cwd: scope.cwd, platform: process.platform })
    },
    archiveSaved: (id: string, archived: boolean) => library.archive(id, archived),
    previewSaved(owner: number, id: string) { const saved = library.read(id); return service(owner).preview({ command: saved.command, cwd: saved.cwd, source: { id: saved.id, name: saved.name, digest: saved.digest } }) },
    decide: (owner: number, token: string, decision: 'allow' | 'deny') => service(owner).decide(token, decision),
    cancel(owner?: number) { const requested = !!active && (owner === undefined || active.owner === owner); if (requested) active!.controller.abort(); return { requested, answer: requested ? 'Stop requested. Wait for the process result; escaped/background descendants are not certified stopped.' : owner === undefined ? 'No app command is active.' : 'No command owned by this window is active.' } },
    forget(owner: number) { reviews.get(owner)?.revoke(); reviews.delete(owner); if (active?.owner === owner) active.controller.abort() },
    history(before = '') {
      if (before && !ID.test(before)) throw Error('Invalid command-history cursor.')
      noLinkedPath(options.root); if (!existsSync(options.root)) return { records: [], next: '', notice: '' }
      const ids = readdirSync(options.root).filter(name => ID.test(name)).sort().reverse().filter(id => !before || id < before)
      const records: CommandRecord[] = []; let damaged = false
      for (const id of ids.slice(0, 20)) { try { records.push(observed(readRecord(id))) } catch { damaged = true } }
      return { records, next: ids.length > 20 ? ids[19] : '', notice: damaged ? 'Some command records could not be read. Originals were not changed.' : '' }
    },
    read(id: string) {
      const record = observed(readRecord(id)), display = (stream: 'stdout' | 'stderr') => { const bytes = output(id, stream); try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { return 'Non-UTF-8 output: download the raw bytes.' } }
      return { record, result: { runId: id, exitCode: record.exitCode, stdout: display('stdout'), stderr: display('stderr'), interrupted: record.state === 'interrupted', outputComplete: record.outputComplete, note: record.note } }
    },
    output(id: string, stream: 'stdout' | 'stderr') { const record = observed(readRecord(id)); return { base64: output(id, stream).toString('base64'), name: `command-${id}-${stream}${record.outputComplete ? '' : '-partial'}.bin` } },
  }
}
