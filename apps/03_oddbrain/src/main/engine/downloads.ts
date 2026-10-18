/**
 * The download manager: the app brings a brain home at the owner's press.
 *
 * Rules, all enforced in code: only the official endpoint passes, only into
 * the app's own engines folder, capped in size, staged then verified, and a
 * run of a staged installer is its own permission on Windows. The zip reader
 * is deliberately small: stored and deflate entries, a zip-slip refusal, and
 * nothing else — this is not a general archiver, it is one trusted file from
 * one trusted host.
 */
import { existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ENGINE_DOWNLOADS, MAX_DOWNLOAD_BYTES, humanBytes, isOfficialDownloadHost, isOfficialUrl, parseShaLine } from '../../shared/lib/engineDownloads'
import { iterZipEntries, ZipRefusal } from '../ingest/zipEntries'

export type DownloadTick = { engine: string; got: number; total: number | null; phase: 'downloading' | 'unpacking' | 'staged' | 'error'; answer?: string }

export type InstallRecord = {
  engine: string
  file: string
  endpoint: string
  sha256: string
  at: string
}

type FetchLike = (url: string) => Promise<{ ok: boolean; status?: number; headers?: { get(name: string): string | null }; arrayBuffer?: () => Promise<ArrayBuffer>; body?: unknown }>

export type DownloadManager = {
  start(engine: string): Promise<{ ok: boolean; answer: string }>
  status(): Promise<Record<string, InstallRecord | undefined>>
  remove(engine: string): Promise<{ ok: boolean; answer: string }>
  /** v1 guard: a staged installer may run only on Windows, only from our folder. */
  runInstaller(engine: string, platform?: string): { ok: boolean; answer: string; command?: string[] }
  /**
   * The run, once the person has seen the full command and pressed the button
   * that says so. Windows only, staged file only; the installer's own
   * progress is its own window — the app says it started and gets out.
   */
  executeInstaller(engine: string, platform?: string): { ok: boolean; answer: string }
  ollamaBinary(): string | null
  /** The staged Ollama runtime, started and stopped by the app, for real. */
  ollamaStart(env?: { OLLAMA_KEEP_ALIVE: string }): Promise<{ ok: boolean; answer: string }>
  ollamaStop(): Promise<{ ok: boolean; answer: string }>
  ollamaStatus(): Promise<{ ok: boolean; answer: string; running: boolean }>
}


/** Is anything answering the local Ollama door, right now? */
async function answering(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 700)
    const reply = await fetch('http://127.0.0.1:11434/api/version', { signal: controller.signal })
    clearTimeout(timer)
    return reply.ok
  } catch {
    return false
  }
}

export function createDownloadManager(options: {
  root: string
  fetchImpl?: FetchLike
  onTick?: (tick: DownloadTick) => void
  join?: typeof join
  /** Overridable for tests — how the app knocks on the runtime's door. */
  probe?: () => Promise<boolean>
  /** Overridable for tests — how the app starts an installer it was told to run. */
  spawnImpl?: typeof spawn
}): DownloadManager {
  const root = options.root
  const doFetch: FetchLike = options.fetchImpl ?? (async (url) => {
    const reply = await fetch(url, { redirect: 'manual' })
    return {
      ok: reply.ok,
      status: reply.status,
      headers: { get: (name: string) => reply.headers.get(name) },
      arrayBuffer: () => reply.arrayBuffer(),
      body: reply.body,
    }
  })

  /**
   * One hop is never trusted: node's fetch would follow a redirect anywhere,
   * and the endpoint pin is only as strong as its weakest hop. Every 3xx is
   * resolved here and made to answer to the same official-URL rule as the
   * first address — a 302 cannot rewrite the pin.
   */
  const OFFICIAL_HOP_LIMIT = 5
  const fetchOfficial = async (
    engine: string,
    url: string
  ): Promise<{ ok: boolean; status?: number; headers?: { get(name: string): string | null }; arrayBuffer?: () => Promise<ArrayBuffer>; body?: unknown; refusal?: string }> => {
    let current = url
    for (let hop = 0; hop <= OFFICIAL_HOP_LIMIT; hop++) {
      const reply = await doFetch(current)
      const location = reply.status && reply.status >= 300 && reply.status < 400 ? reply.headers?.get('location') : null
      if (!location) return reply
      const next = new URL(location, current).toString()
      if (!isOfficialDownloadHost(engine, next)) {
        const host = ENGINE_DOWNLOADS[engine]?.host ?? 'The endpoint'
        return {
          ok: false,
          status: reply.status,
          refusal: `${host} answered with a redirect to somewhere this app does not know (${new URL(next).host}). The official endpoint is pinned, so nothing was downloaded.`,
        }
      }
      current = next
    }
    return { ok: false, refusal: 'The official endpoint redirected too many times. Nothing was downloaded.' }
  }
  const onTick = options.onTick ?? (() => undefined)

  const recordPath = (engine: string): string => join(root, engine, 'install-record.json')
  const stagedPath = (engine: string): string | null => {
    const info = ENGINE_DOWNLOADS[engine]
    if (!info || info.kind === 'page') return null
    const name = info.kind === 'zip' ? 'ollama-windows-amd64.zip' : 'install.ps1'
    return join(root, engine, name)
  }

  async function writeRecords(engine: string, record: InstallRecord): Promise<void> {
    await mkdir(join(root, engine), { recursive: true })
    await writeFile(recordPath(engine), JSON.stringify(record, null, 2))
  }

  async function readRecord(engine: string): Promise<InstallRecord | undefined> {
    try {
      return JSON.parse(await readFile(recordPath(engine), 'utf8')) as InstallRecord
    } catch {
      return undefined
    }
  }

  return {
    async start(engine: string): Promise<{ ok: boolean; answer: string }> {
      const info = ENGINE_DOWNLOADS[engine]
      if (!info) return { ok: false, answer: `No download is known for ${engine}.` }
      if (info.kind === 'page') {
        return { ok: false, answer: `${engine} has no verified direct endpoint. Open ${info.page} and install from Google itself; the app will find it on the next check.` }
      }
      if (!isOfficialUrl(engine, info.windows)) {
        // Code, not promise: a tampered endpoint table cannot send you anywhere else.
        return { ok: false, answer: 'That endpoint is not the official one. Nothing was downloaded.' }
      }
      onTick({ engine, got: 0, total: null, phase: 'downloading' })
      let reply: Awaited<ReturnType<typeof fetchOfficial>>
      try {
        reply = await fetchOfficial(engine, info.windows)
      } catch (failure) {
        onTick({ engine, got: 0, total: null, phase: 'error', answer: `Could not reach ${info.host}: ${(failure as Error).message}` })
        return { ok: false, answer: `Could not reach ${info.host}. Nothing was downloaded.` }
      }
      if ('refusal' in reply && reply.refusal) {
        onTick({ engine, got: 0, total: null, phase: 'error', answer: reply.refusal })
        return { ok: false, answer: reply.refusal }
      }
      if (!reply.ok) {
        const answer = `${info.host} answered ${reply.status ?? 'with an error'}. The endpoint may have moved; nothing was downloaded.`
        onTick({ engine, got: 0, total: null, phase: 'error', answer })
        return { ok: false, answer }
      }
      const declared = Number(reply.headers?.get('content-length') ?? '0')
      if (declared > MAX_DOWNLOAD_BYTES) {
        const answer = `${info.host} offered more than the ${humanBytes(MAX_DOWNLOAD_BYTES)} cap. Nothing was downloaded.`
        onTick({ engine, got: 0, total: null, phase: 'error', answer })
        return { ok: false, answer }
      }
      let bytes: Uint8Array
      try {
        const body = reply.body as { getReader?: () => { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> } } | null | undefined
        if (body && typeof body.getReader === 'function') {
          // Stream the real bytes: a 1.47 GB file is minutes of silence
          // otherwise, and a lie about progress is still a lie.
          const reader = body.getReader()
          const chunks: Uint8Array[] = []
          let got = 0
          let lastTick = 0
          for (;;) {
            const step = await reader.read()
            if (step.done) break
            const piece = step.value
            if (piece) {
              chunks.push(piece)
              got += piece.byteLength
            }
            if (got > MAX_DOWNLOAD_BYTES) {
              await reader.cancel()
              const answer = 'The download exceeded the size cap mid-stream. Nothing was installed.'
              onTick({ engine, got: 0, total: null, phase: 'error', answer })
              return { ok: false, answer }
            }
            const now = Date.now()
            if (got === 0 || now - lastTick >= 200) {
              lastTick = now
              onTick({ engine, got, total: declared || null, phase: 'downloading' })
            }
          }
          bytes = new Uint8Array(got)
          let at = 0
          for (const piece of chunks) { bytes.set(piece, at); at += piece.byteLength }
        } else {
          bytes = new Uint8Array((await reply.arrayBuffer?.()) ?? new ArrayBuffer(0))
        }
      } catch (failure) {
        const answer = `The download broke midway: ${(failure as Error).message}`
        onTick({ engine, got: 0, total: null, phase: 'error', answer })
        return { ok: false, answer }
      }
      if (!bytes.length) {
        const answer = `${info.host} sent nothing. Nothing was installed.`
        onTick({ engine, got: 0, total: null, phase: 'error', answer })
        return { ok: false, answer }
      }
      if (bytes.length > MAX_DOWNLOAD_BYTES) {
        const answer = 'The download exceeded the size cap. Nothing was installed.'
        onTick({ engine, got: 0, total: null, phase: 'error', answer })
        return { ok: false, answer }
      }
      onTick({ engine, got: bytes.length, total: bytes.length, phase: 'downloading' })
      const target = stagedPath(engine) ?? join(root, engine, 'download.bin')
      await mkdir(join(root, engine), { recursive: true })
      await writeFile(target, bytes)
      const digest = parseShaLine(await import('node:crypto').then(crypto => crypto.createHash('sha256').update(bytes).digest('hex')))
      const record: InstallRecord = {
        engine,
        file: target,
        endpoint: info.windows,
        sha256: digest,
        at: new Date().toISOString(),
      }
      await writeRecords(engine, record)
      // A zip for the app's own runtime is unpacked right away; an installer
      // script waits for its own run permission.
      if (info.kind === 'zip') {
        onTick({ engine, got: bytes.length, total: bytes.length, phase: 'unpacking' })
        const unpacked = await unzipArchive(bytes, join(root, engine, 'app'), RUNTIME_ZIP_LIMITS)
        if (!unpacked.ok) {
          const answer = `The archive could not be unpacked: ${unpacked.answer}`
          onTick({ engine, got: 0, total: null, phase: 'error', answer })
          return { ok: false, answer }
        }
      }
      const answer = info.kind === 'zip'
        ? 'Downloaded from the official endpoint and unpacked into the app\u2019s own engines folder. (The file\u2019s SHA-256 is recorded below; the official source is pinned by URL.)'
        : 'Staged. Running the official installer is a separate permission, shown in full before it runs.'
      onTick({ engine, got: bytes.length, total: bytes.length, phase: 'staged', answer })
      return { ok: true, answer }
    },

    async status() {
      const answer: Record<string, InstallRecord | undefined> = {}
      for (const engine of Object.keys(ENGINE_DOWNLOADS)) {
        const record = await readRecord(engine)
        if (record) answer[engine] = record
      }
      return answer
    },

    async remove(engine: string) {
      if (!ENGINE_DOWNLOADS[engine]) return { ok: false, answer: `Nothing is known about ${engine}.` }
      await rm(join(root, engine), { recursive: true, force: true })
      return { ok: true, answer: `Removed the app-managed ${engine}.` }
    },

    runInstaller(engine: string, platform = process.platform) {
      const info = ENGINE_DOWNLOADS[engine]
      if (!info || info.kind !== 'installer-script') return { ok: false, answer: `${engine} has no staged installer.` }
      const file = stagedPath(engine)
      if (!file || !existsSync(file)) return { ok: false, answer: 'Nothing is staged yet. Download it first.' }
      if (platform !== 'win32') {
        return { ok: false, answer: 'The installer runs on Windows. On this machine, run the staged file yourself, or download on the Windows machine.' }
      }
      return {
        ok: true,
        answer: 'The official installer will run in PowerShell.',
        command: ['powershell', '-ExecutionPolicy', 'Bypass', '-File', file],
      }
    },

    executeInstaller(engine: string, platform = process.platform) {
      const run = this.runInstaller(engine, platform)
      if (!run.ok || !run.command) return { ok: false, answer: run.answer }
      try {
        const child = (options.spawnImpl ?? spawn)(run.command[0], run.command.slice(1), { stdio: 'ignore' })
        return {
          ok: true,
          answer: `The official installer is running (pid ${child.pid}). Its progress is its own window; the brain appears here once it finishes.`,
        }
      } catch (failure) {
        return { ok: false, answer: `The installer could not start: ${(failure as Error).message}` }
      }
    },

    ollamaBinary() {
      // The staged copy first; then the Ollama the OWNER installed (the
      // desktop app puts it in Programs/Ollama; winget the same) — then any
      // ollama.exe sitting on the PATH. His install, started by the app: no
      // second copy downloaded for nothing.
      for (const candidate of [join(root, 'ollama', 'app', 'ollama.exe'), join(root, 'ollama', 'app', 'ollama')]) {
        if (existsSync(candidate)) return candidate
      }
      const env = process.env
      const programs = env['LOCALAPPDATA'] ? join(env['LOCALAPPDATA'], 'Programs', 'Ollama', 'ollama.exe') : ''
      if (programs && existsSync(programs)) return programs
      const pathText = env['PATH'] ?? ''
      for (const dir of pathText.split(pathText.includes(';') ? ';' : pathText.includes(':') ? ':' : ';').filter(Boolean).slice(0, 64)) {
        const onPath = join(dir, pathText.includes('\\') || process.platform === 'win32' ? 'ollama.exe' : 'ollama')
        try {
          if (existsSync(onPath)) return onPath
        } catch {
          /* a hostile PATH entry throws — skip it */
        }
      }
      return null
    },

    /** The staged runtime, started detached: its pid lives in our folder. */
    async ollamaStart(env?: { OLLAMA_KEEP_ALIVE: string }) {
      const binary = this.ollamaBinary()
      if (!binary) {
        return {
          ok: false,
          answer:
            'No Ollama was found — not staged here, not in Programs\\Ollama, not on the PATH. Install it once (winget install Ollama.Ollama) and it is found; or download the staged copy in the Engine bay.',
        }
      }
      if ((await this.ollamaStatus()).running) {
        return { ok: true, answer: 'The local runtime is already answering at 127.0.0.1:11434.' }
      }
      const staged = binary.startsWith(join(root, 'ollama'))
      const pidFile = join(root, 'ollama', 'serve.pid')
      try { await rm(pidFile, { force: true }) } catch {}
      const start = options.spawnImpl ?? spawn
      const child = start(binary, ['serve'], {
        cwd: staged ? join(root, 'ollama', 'app') : join(binary, '..'),
        detached: true,
        stdio: 'ignore',
        ...(env ? { env: { ...process.env, ...env } } : {}),
      })
      child.unref()
      if (!child.pid) return { ok: false, answer: 'The runtime could not be started.' }
      await mkdir(join(root, 'ollama'), { recursive: true })
      await writeFile(pidFile, String(child.pid), 'utf8')
      // Give it a moment, then say the truth about whether it came up.
      const knock = options.probe ?? answering
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(resolve => setTimeout(resolve, options.probe ? 5 : 500))
        if (await knock()) {
          const which = staged
            ? 'the app\u2019s staged copy'
            : `your installed Ollama (${binary})`
          return { ok: true, answer: `The local runtime is up at 127.0.0.1:11434 \u2014 ${which}, pid ${child.pid}.` }
        }
        if (child.exitCode !== null) break
      }
      return { ok: true, answer: `The runtime was started (pid ${child.pid}), but 127.0.0.1:11434 is not answering yet — give it a moment.` }
    },

    async ollamaStop() {
      const pidFile = join(root, 'ollama', 'serve.pid')
      let recorded = ''
      try { recorded = (await readFile(pidFile, 'utf8')).trim() } catch {
        return { ok: false, answer: 'The app has not started the runtime, so it will not stop it. If you started Ollama yourself, stop it your way.' }
      }
      const pid = Number(recorded)
      if (!Number.isInteger(pid) || pid <= 0) return { ok: false, answer: 'The recorded pid is not usable; stop the runtime by hand.' }
      try {
        if (process.platform === 'win32') spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
        else process.kill(pid, 'SIGTERM')
      } catch (failure) {
        return { ok: false, answer: `The runtime could not be stopped: ${(failure as Error).message}` }
      }
      await rm(pidFile, { force: true })
      return { ok: true, answer: `The runtime the app started (pid ${pid}) was stopped.` }
    },

    async ollamaStatus() {
      if (await (options.probe ?? answering)()) return { ok: true, running: true, answer: 'Answering at 127.0.0.1:11434.' }
      const pidFile = join(root, 'ollama', 'serve.pid')
      try {
        const pid = Number((await readFile(pidFile, 'utf8')).trim())
        if (Number.isInteger(pid) && pid > 0) {
          process.kill(pid, 0)
          return { ok: true, running: true, answer: `The process is up (pid ${pid}) but the door is not answering yet.` }
        }
      } catch {
        // no pid file or dead pid: not running by our hand
      }
      return { ok: true, running: false, answer: 'Not running. Start it here, or run your own Ollama.' }
    },
  }
}

/**
 * The runtime unpack gate, sized against the MEASURED official archive:
 * Ollama's real zip is 1.47 GB, unpacks to 1.94 GB, 87 entries, biggest
 * single file 692 MB (measured 2026-10-17). The caps exist to stop a lie —
 * they admit the truth and refuse more.
 */
export const RUNTIME_ZIP_LIMITS = {
  files: 512,
  perFile: 1.5 * 1024 * 1024 * 1024,
  totalUncompressed: 4 * 1024 * 1024 * 1024,
} as const

/**
 * The small zip reader: central directory, stored (0) and deflate (8)
 * entries, a strict zip-slip refusal, per-file and total caps. Enough for
 * one trusted archive from one trusted host; nothing more is claimed.
 * Callers with narrower material pass narrower limits (the store's packs do);
 * the default is the runtime gate above.
 */
export async function unzipArchive(
  bytes: Uint8Array,
  destination: string,
  limits: { files: number; perFile: number; totalUncompressed: number } = RUNTIME_ZIP_LIMITS,
  fs: { mkdir(path: string, options?: { recursive?: boolean }): Promise<unknown>; writeFile(path: string, data: Uint8Array): Promise<unknown> } = { mkdir, writeFile },
): Promise<{ ok: boolean; answer: string }> {
  await fs.mkdir(destination, { recursive: true })
  let count = 0
  try {
    for (const entry of iterZipEntries(bytes, limits)) {
      const out = join(destination, entry.name)
      const cut = Math.max(out.lastIndexOf('/'), out.lastIndexOf('\\'))
      await fs.mkdir(cut > 0 ? out.slice(0, cut) : destination, { recursive: true })
      await fs.writeFile(out, entry.content)
      count += 1
    }
  } catch (failure) {
    if (failure instanceof ZipRefusal) return { ok: false, answer: failure.answer }
    throw failure
  }
  return { ok: true, answer: `${count} files` }
}
