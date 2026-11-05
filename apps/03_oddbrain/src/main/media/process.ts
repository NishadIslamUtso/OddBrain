import { spawn, type ChildProcess } from 'node:child_process'
export function childEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !/TOKEN|API_KEY|SECRET|PASSWORD|^NODE_OPTIONS$|^ELECTRON_RUN_AS_NODE$/i.test(key)))
}
export function killTree(child: ChildProcess): void {
  if (!child.pid) return
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    killer.on('error', () => child.kill('SIGKILL'))
  } else { try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') } }
}
/** Bounded, cancellable command arrays. No shell, interpolated command or inherited stdin. */
export function runMediaCommand(command: string, args: string[], signal: AbortSignal, timeout = 90_000, limit = 2_000_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(Error('Cancelled.')); return }
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], shell: false, detached: process.platform !== 'win32', env: childEnvironment() })
    const chunks: Buffer[] = []; let size = 0, error = '', reason = ''
    const stop = (message: string): void => { reason = message; killTree(child) }
    const abort = (): void => stop('Cancelled.')
    signal.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => stop('The decoder exceeded its time limit.'), timeout)
    const cleanup = (): void => { clearTimeout(timer); signal.removeEventListener('abort', abort) }
    child.stdout.on('data', (data: Buffer) => { size += data.length; if (size > limit) stop('Decoder output exceeded its size limit.'); else chunks.push(data) })
    child.stderr.on('data', (data: Buffer) => { error = (error + data.toString()).slice(-1200) })
    child.on('error', failure => { cleanup(); reject(Error(`The selected decoder could not start: ${failure.message}`)) })
    child.on('close', code => { cleanup(); if (reason || code !== 0) reject(Error(reason || `Decoder refused the file: ${error || `exit ${code}`}`)); else resolve(Buffer.concat(chunks)) })
  })
}
