/**
 * The Brain Window — the addon's local window onto the owner's brain.
 *
 * This is NOT a second frontend and not a second memory authority. It serves
 * the SAME built renderer (dist-web) that the OddBrain app uses, over loopback
 * only, and backs it with the SAME main-process services the app uses: the
 * vault service (files, recall, grep, capsules, privacy list, link graph), the
 * memory workspace (the Review screen's doubts/confirmations/interpretations),
 * the chat store, and the Memmory_OB catalogue — all rooted at ONE brain
 * folder the owner chooses. Everything it cannot do honestly (native dialogs,
 * engines, media) stays behind the bridge's own truthful "needs the desktop
 * app" answers; nothing pretends.
 *
 * It does not import Electron. It binds 127.0.0.1 only. It never opens a
 * socket on the network.
 */
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { createVaultService, type VaultService } from './vault/service'
import { startLocalApi, type LocalApi } from './api/server'
import { createChatStore } from './chats/store'
import { createMemoryWorkspace } from './memory/workspace'
import { createMemmoryObStore } from './memmoryOb/store'
import { classifyBrainRoot, defaultVaultPath, planBrainApply, planBrainRefresh } from '../shared/lib/brainStructure'

export type BrainWindowOptions = {
  /** The owner's brain folder — the one memory. */
  brainRoot: string
  /** Directory holding the built renderer (dist-web). */
  uiDir: string
  /** Loopback port for the window. The vault API runs on apiPort. */
  port: number
  apiPort: number
  /** Bind address. Default 127.0.0.1 — the window is local-only by design. */
  host?: string
  version?: string
}

const safePath = (root: string, relative: string): string | null => {
  const full = resolve(root, normalize(relative))
  if (full !== resolve(root) && !full.startsWith(resolve(root) + sep)) return null
  return full
}

export async function startBrainWindow(options: BrainWindowOptions): Promise<{ url: string; close: () => Promise<void> }> {
  const uiDir = resolve(options.uiDir)
  if (!existsSync(join(uiDir, 'index.html'))) throw Error(`The Brain Window needs the built interface at ${uiDir}. Build it with: npm run build:web`)

  // One brain folder is the live root. The owner can point at a different
  // folder from the first-run screen; services are rebuilt on the new root —
  // no second authority, the old root is simply no longer the live one.
  let brainRoot = resolve(options.brainRoot)
  const settingsFile = (): string => join(brainRoot, '00 System', 'Brain Window.json')
  const readSettings = (): Record<string, unknown> => {
    try { return JSON.parse(readFileSync(settingsFile(), 'utf8')) as Record<string, unknown> } catch { return {} }
  }
  const writeSettings = (patch: Record<string, unknown>): Record<string, unknown> => {
    const next = { ...readSettings(), ...patch }
    mkdirSync(dirname(settingsFile()), { recursive: true })
    writeFileSync(settingsFile(), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    return next
  }

  let vaultService: VaultService = createVaultService({ vaultPath: brainRoot })
  let memoryStore = (): ReturnType<typeof createMemoryWorkspace> => createMemoryWorkspace(vaultService.files())
  let chatStore = (): ReturnType<typeof createChatStore> => createChatStore(join(brainRoot, 'chats'))
  let memmoryStore = (): ReturnType<typeof createMemmoryObStore> => createMemmoryObStore(join(brainRoot, 'store'))

  const reroot = (nextRoot: string): void => {
    brainRoot = resolve(nextRoot)
    vaultService = createVaultService({ vaultPath: brainRoot })
    api?.setVault(vaultService)
  }

  const api: LocalApi | undefined = await startLocalApi({ port: options.apiPort, vault: vaultService })
  if (!existsSync(brainRoot)) mkdirSync(brainRoot, { recursive: true })

  /** The folder-and-decide flow: inspect a folder, then use it, prepare it, or leave it. */
  const structurePlan = (root: string): Record<string, unknown> => {
    if (typeof root !== 'string' || !root.trim() || root.length > 4_096 || /[\n\r]/.test(root)) throw Error('Give a real folder path.')
    let names: string[] = []
    try { names = readdirSync(root) } catch { return { error: 'That folder cannot be read.' } }
    const { kind } = classifyBrainRoot(names)
    const readExisting = (relative: string): string | null => {
      try { const full = join(root, relative); return existsSync(full) ? readFileSync(full, 'utf8') : null } catch { return null }
    }
    const plan = planBrainApply(kind, relative => existsSync(join(root, relative)), readExisting, () => false)
    const differing = planBrainRefresh(kind, readExisting)
    return { kind: plan.kind, present: plan.present, missing: plan.missing, differing, conflicts: plan.conflicts, writes: plan.writes as Array<{ relative: string; content: string }> }
  }
  const inspect = (root: string): Record<string, unknown> => {
    const plan = structurePlan(root)
    if (!plan.error) plan.writes = (plan.writes as Array<{ relative: string }>).map(file => file.relative)
    return plan
  }
  const integrateStructure = (root: string): Record<string, unknown> => {
    const plan = structurePlan(root)
    if (plan.error) return { ok: false, kind: '', written: [], conflicts: [], differing: [], error: plan.error }
    const written: string[] = []
    for (const file of (plan.writes as Array<{ relative: string; content: string }>)) {
      const full = join(root, file.relative)
      mkdirSync(dirname(full), { recursive: true })
      try { writeFileSync(full, file.content, { encoding: 'utf8', flag: 'wx' }); written.push(file.relative) } catch { /* exists already: never rewritten */ }
    }
    return { ok: true, kind: plan.kind, written, conflicts: plan.conflicts, differing: plan.differing }
  }

  const respond = (res: ServerResponse, value: unknown, status = 200): void => {
    const body = JSON.stringify(value)
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(body)
  }

  const readBody = (req: IncomingMessage): Promise<Record<string, unknown>> => new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > 2_000_000) { rejectBody(Error('The request is too large.')); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try { resolveBody(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown> : {}) }
      catch { rejectBody(Error('The request body is not valid JSON.')) }
    })
    req.on('error', rejectBody)
  })

  /** The window bridge: exactly the domains the screens need, over real brain files. */
  const windowApi = async (path: string, req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const body = req.method === 'POST' ? await readBody(req) : {}
    const op = String(body.op || path.split('/')[0] || '')
    if (path === '/ping' || op === 'ping') return respond(res, { ok: true, brainRoot, version: options.version || '1.0.0' })
    if (op === 'app') {
      let name = ''
      try { name = userInfo().username } catch { /* unnamed machine */ }
      return respond(res, { ok: true, version: options.version || '1.0.0', platform: process.platform, whoami: name })
    }
    if (op === 'settings') {
      if (req.method === 'POST') return respond(res, { ok: true, settings: writeSettings(body.patch && typeof body.patch === 'object' ? body.patch as Record<string, unknown> : {}) })
      return respond(res, { ok: true, settings: readSettings() })
    }
    if (op === 'brain') {
      // Selecting a folder (memory folder / data folder) and deciding what to do.
      const action = String(body.action || 'inspect')
      const target = typeof body.path === 'string' && body.path.trim() ? resolve(body.path) : brainRoot
      if (action === 'inspect') return respond(res, { ok: true, root: target, ...inspect(target), defaultPath: defaultVaultPath(homedir()) })
      if (action === 'use' || action === 'fresh') {
        const prepared = integrateStructure(target)
        writeSettings({ vaultPath: target })
        reroot(target)
        return respond(res, { ok: true, root: target, ...prepared })
      }
      return respond(res, { ok: false, error: 'Choose inspect, use, or fresh.' }, 400)
    }
    if (op === 'memory') {
      // The Review screen: real doubts/confirmations/interpretations, and the
      // only place a confirmation is ever decided. Organizer model-drafting
      // stays out until a model connection is wired; discovery is local.
      const store = memoryStore()
      const answer = (work: () => unknown): void => {
        try { respond(res, { ok: true, view: work() }) } catch (error) { respond(res, { ok: false, error: (error as Error).message }) }
      }
      if (body.action === 'act') return answer(() => store.act(body as never))
      if (body.action === 'run') return answer(() => { store.discover(); return store.read() })
      return answer(() => store.read())
    }
    if (op === 'projects') {
      const file = join(brainRoot, '05 Workspace', 'projects.json')
      try {
        const readProjects = (): Array<Record<string, unknown>> => {
          try { return JSON.parse(readFileSync(file, 'utf8')) as Array<Record<string, unknown>> } catch { return [] }
        }
        const saveProjects = (projects: Array<Record<string, unknown>>): void => {
          mkdirSync(dirname(file), { recursive: true })
          writeFileSync(file, `${JSON.stringify(projects, null, 2)}\n`, 'utf8')
          try { memmoryStore().syncProjects(projects as never) } catch { /* catalogue intake is best-effort; the list is saved */ }
        }
        if (req.method === 'POST' && body.action === 'attach') {
          const projects = readProjects()
          const project = projects.find(row => row.id === body.projectId)
          const reference = body.reference as Record<string, unknown> | undefined
          if (!project || !reference || typeof reference.id !== 'string' || typeof reference.path !== 'string' || typeof reference.label !== 'string' || typeof reference.addedAt !== 'string' || typeof reference.includeInContext !== 'boolean') {
            return respond(res, { ok: false, error: 'That project or reference is not usable. Nothing was attached.' }, 400)
          }
          const references = Array.isArray(project.references) ? project.references as Array<Record<string, unknown>> : []
          if (references.length >= 40) return respond(res, { ok: false, error: 'This project already has 40 references. Remove one before adding another.' }, 400)
          project.references = [...references, reference]
          saveProjects(projects)
          return respond(res, { ok: true, references: project.references })
        }
        if (req.method === 'POST') {
          if (!Array.isArray(body.projects)) return respond(res, { ok: true, projects: readProjects() })
          const projects = body.projects as Array<Record<string, unknown>>
          if (projects.length > 100) return respond(res, { ok: false, error: 'There may be at most 100 Projects. Nothing was saved.' }, 400)
          saveProjects(projects)
          return respond(res, { ok: true, projects })
        }
        return respond(res, { ok: true, projects: readProjects() })
      } catch (error) { return respond(res, { ok: false, error: (error as Error).message }) }
    }
    if (op === 'chats') {
      try {
        const snapshot = chatStore().read()
        return respond(res, { ok: true, snapshot: { initialized: snapshot.initialized, revision: snapshot.revision, chats: snapshot.chats, currentChat: snapshot.currentChat, notice: snapshot.notice } })
      } catch (error) { return respond(res, { ok: false, error: (error as Error).message }) }
    }
    if (op === 'memmory') {
      try {
        const store = memmoryStore()
        if (body.action === 'project') return respond(res, store.project(String(body.projectId || '')))
        if (body.action === 'search') return respond(res, store.search(body as never))
        return respond(res, store.read())
      } catch (error) { return respond(res, { ok: false, error: (error as Error).message }) }
    }
    if (op === 'structure') {
      const action = String(body.action || 'inspect')
      const target = typeof body.path === 'string' && body.path.trim() ? resolve(body.path) : brainRoot
      try {
        if (action === 'inspect') return respond(res, { ok: true, ...inspect(target) })
        if (action === 'apply') return respond(res, integrateStructure(target))
        if (action === 'linkCheck') return respond(res, vaultService.links())
        return respond(res, { ok: false, error: 'Choose inspect, apply, or linkCheck.' }, 400)
      } catch (error) { return respond(res, { ok: false, error: (error as Error).message }) }
    }
    if (op === 'vault') {
      // Real vault operations the screen already speaks HTTP for are proxied;
      // folder-picker style calls are answered here against the real machine.
      const action = String(body.action || '')
      if (action === 'useDefault') {
        const target = defaultVaultPath(homedir())
        mkdirSync(target, { recursive: true })
        writeSettings({ vaultPath: target })
        reroot(target)
        return respond(res, { ok: true, path: target, ...integrateStructure(target) })
      }
      if (action === 'chooseFolder') {
        // No native dialog in a browser: the owner types or pastes the folder.
        return respond(res, { ok: true, needsPath: true, hint: 'Enter the full path of your memory folder (data folder).' })
      }
      return respond(res, { ok: false, error: 'Unknown folder action.' }, 400)
    }
    return respond(res, { ok: false, error: `Unknown Brain Window request: ${op}` }, 404)
  }

  const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' }

  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const path = url.pathname
    if (path.startsWith('/api/window/')) {
      windowApi(path.slice('/api/window/'.length), req, res).catch(error => respond(res, { ok: false, error: (error as Error).message }, 500))
      return
    }
    // Everything else under /api belongs to the app's own local API.
    if (path.startsWith('/api/')) {
      const proxied = httpRequest({ host: '127.0.0.1', port: options.apiPort, method: req.method, path: req.url, headers: { ...req.headers, host: `127.0.0.1:${options.apiPort}` } }, upstream => {
        res.writeHead(upstream.statusCode || 502, upstream.headers)
        upstream.pipe(res)
      })
      proxied.on('error', () => respond(res, { ok: false, error: 'The local brain API is unavailable.' }, 502))
      req.pipe(proxied)
      return
    }
    // Static: the same renderer the app ships. The page is told, once, that a
    // real brain is behind it — the interface then uses real data everywhere
    // it has a real answer and its own truthful fallbacks everywhere else.
    let relative = decodeURIComponent(path)
    if (relative === '/' || relative === '') relative = '/index.html'
    const file = safePath(uiDir, relative.slice(1))
    if (!file) { res.writeHead(403); res.end('Forbidden'); return }
    const isIndex = relative === '/index.html' || extname(relative) === ''
    if (isIndex) {
      // The page is told, once, that a real brain is behind it — the interface
      // then uses real data everywhere it has a real answer and its own
      // truthful fallbacks everywhere else.
      const html = readFileSync(join(uiDir, 'index.html'), 'utf8')
        .replace('<head>', '<head><script>window.__ODDBRAIN_BRAIN_HOST__ = true</script>')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      res.end(html)
      return
    }
    if (!existsSync(file)) { res.writeHead(404); res.end('Not found'); return }
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    res.end(readFileSync(file))
  })

  await new Promise<void>(resolveListen => server.listen(options.port, options.host || '127.0.0.1', resolveListen))
  return {
    url: `http://127.0.0.1:${options.port}/`,
    close: () => new Promise<void>(done => { server.close(() => { void api?.close?.(); done() }) }),
  }
}
