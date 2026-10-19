import { unverifiedCapabilities } from '@shared/lib/engineCapabilities'
import type { DesktopBridge, EngineBridge } from './bridge'
import type { ArtifactSummary, SaveInput } from '../../../main/artifacts/store'
import { DEFAULT_ENGINE, type EngineEvent, type EngineSettings } from '@shared/lib/engine'
import { DEFAULT_PERMISSIONS } from '@shared/lib/permissions'
import { normalizeProjects } from '@shared/lib/projects'
import { normalizeMcpServers, type McpServerEntry } from '@shared/lib/mcp'
import { getSampleFiles, readSample, sampleEnabled, sampleLinks, sampleProjects, SAMPLE_ROOT, sampleTime, writeSample } from '@shared/lib/sampleWorkspace'

type SampleArtifact = { item: ArtifactSummary; contents: string[] }
function initialArtifacts(): SampleArtifact[] {
  const html = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>body{font:16px/1.6 system-ui;background:#f6f6f7;color:#24272b;padding:36px;max-width:720px;margin:auto}small{color:#666}h1{font-size:32px}li{margin:12px 0}input{accent-color:#386451}section{border-top:1px solid #cdd2d0;margin-top:24px;padding-top:16px}</style></head><body><small>ODDBRAIN · SAMPLE ARTIFACT</small><h1>${title}</h1>${body}</body></html>`
  const content = [
    html('Workshop checklist', '<p>A practical plan for a small repair workshop.</p><ul><li><label><input type="checkbox"> Confirm the space and accessibility</label></li><li><label><input type="checkbox"> Lay out tools and safety equipment</label></li><li><label><input type="checkbox"> Assign volunteer stations</label></li></ul><section><h2>Before everyone leaves</h2><p>Share one repair, one lesson and one open question.</p></section>'),
    html('A little room to make things', '<p>Community repair workshop · Saturday · 10:00–13:00</p><section><h2>Bring something worth repairing</h2><p>Start small. Share tools. Ask questions. Tea is optional; curiosity is not.</p></section><section><h2>The morning</h2><p>Welcome → Safety check → Repair stations → Show and tell</p></section>'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 420"><rect width="700" height="420" fill="#f6f6f7"/><g font-family="system-ui" fill="#24272b"><text x="40" y="55" font-size="24">Balcony garden · sample plan</text><g fill="#dce6df" stroke="#567863"><rect x="40" y="110" width="170" height="210" rx="12"/><rect x="260" y="110" width="170" height="210" rx="12"/><rect x="480" y="110" width="170" height="210" rx="12"/></g><g font-size="18"><text x="95" y="205">Basil</text><text x="300" y="205">Rosemary</text><text x="540" y="205">Mint</text></g><text x="40" y="375" font-size="14">Separate containers · measure sunlight before planting</text></g></svg>',
  ]
  return content.map((body, i) => ({ item: { id: ['sample-checklist', 'sample-event-page', 'sample-garden-map'][i], title: ['Workshop checklist', 'Event page', 'Balcony planting plan'][i], type: i === 2 ? 'svg' : 'html', createdAt: sampleTime(), updatedAt: sampleTime(), origin: 'chat', current: i === 0 ? 1 : 0, versionCount: i === 0 ? 2 : 1, bytes: body.length, chatId: ['sample-chat-workshop', 'sample-chat-site', 'sample-chat-garden'][i] }, contents: i === 0 ? [html('Workshop checklist', '<p>First draft: confirm the space, gather tools, invite volunteers.</p>'), body] : [body] }))
}
const artifacts = () => readSample('artifacts', initialArtifacts())
const missing = { ok: false as const, error: 'Sample artifact not found.' }
const say = (answer: string) => ({ ok: true as const, answer })
/** Override only browser fallbacks. Untouched capabilities keep their explicit refusals. */
function replace<T extends object>(target: T, overrides: Partial<T>): void {
  for (const key of Object.keys(overrides) as Array<keyof T>) {
    const previous = target[key], next = overrides[key]
    if (typeof previous === 'function' && typeof next === 'function') {
      target[key] = ((...args: unknown[]) => (sampleEnabled() ? next : previous)(...args)) as T[keyof T]
    }
  }
}
export function installSampleBridge(bridge: DesktopBridge, engine: EngineBridge): void {
  if (!sampleEnabled()) return
  let settings: EngineSettings = readSample('engine', { ...DEFAULT_ENGINE, model: 'sample-balanced', workspace: '/Sample workspace/Workshop' })
  const change = (patch: Partial<EngineSettings>) => { settings = { ...settings, ...patch }; writeSample('engine', settings); return say('Sample engine setting changed. No runtime was contacted.') }
  const saveArtifact = (input: SaveInput) => {
    const list = artifacts(), old = list.find(a => a.item.id === input.id), now = sampleTime()
    if (input.content.length > 4_000_000 || list.length >= 200 && !old) return { ok: false as const, error: 'Sample library limit reached. Reset samples to start again.' }
    const item: ArtifactSummary = old ? { ...old.item, updatedAt: now, current: old.contents.length, versionCount: old.contents.length + 1, bytes: input.content.length } : { id: input.id || crypto.randomUUID(), title: input.title || 'Sample artifact', type: input.type || 'html', createdAt: now, updatedAt: now, origin: input.origin || 'chat', current: 0, versionCount: 1, bytes: input.content.length, chatId: input.chatId }
    if (old) { old.contents.push(input.content); old.item = item } else list.push({ item, contents: [input.content] })
    writeSample('artifacts', list); return { ok: true as const, item }
  }
  replace(bridge.projects, { read: async () => readSample('projects', sampleProjects()), write: async input => { const projects = normalizeProjects(input); writeSample('projects', projects); return { ok: true, projects } } })
  replace(bridge.structure, { linkCheck: async () => sampleLinks(), inspect: async () => ({ ok: true, kind: 'Sample vault', present: ['Projects', 'Reading', 'Memory', 'Inbox'], missing: [], differing: [], conflicts: [] }) })
  replace(bridge.settings, { read: async () => ({ vaultPath: SAMPLE_ROOT, cloud: { baseUrl: '', model: '' }, permissions: { ...DEFAULT_PERMISSIONS, browserCapture: false, keepConversations: false } }) })

  replace(bridge.artifacts, {
    list: async () => ({ ok: true, items: artifacts().map(a => a.item), where: 'Sample library · browser storage' }),
    read: async (id, version) => { const a = artifacts().find(a => a.item.id === id), n = version ?? a?.item.current ?? 0; return a && a.contents[n] !== undefined ? { ok: true, item: a.item, content: a.contents[n], version: n } : missing },
    save: async input => saveArtifact(input),
    rename: async (id, title) => { const list = artifacts(), a = list.find(a => a.item.id === id); if (!a) return missing; a.item.title = title.trim().slice(0, 120) || a.item.title; writeSample('artifacts', list); return { ok: true, item: a.item } },
    duplicate: async id => { const a = artifacts().find(a => a.item.id === id); return a ? saveArtifact({ title: a.item.title + ' copy', type: a.item.type, content: a.contents[a.item.current] }) : missing },
    restore: async (id, version) => { const a = artifacts().find(a => a.item.id === id); return a && a.contents[version] !== undefined ? saveArtifact({ id, content: a.contents[version] }) : missing },
    remove: async id => { const list = artifacts(), a = list.find(a => a.item.id === id); if (!a) return missing; writeSample('trash', [...readSample<SampleArtifact[]>('trash', []), a]); writeSample('artifacts', list.filter(a => a.item.id !== id)); return { ok: true, movedTo: 'Sample trash' } },
    trashList: async () => ({ ok: true, items: readSample<SampleArtifact[]>('trash', []).map(a => ({ key: a.item.id, originalId: a.item.id, recoveredMetadata: false, title: a.item.title, type: a.item.type, versionCount: a.contents.length, removedAt: sampleTime() })) }),
    trashRestore: async key => { const trash = readSample<SampleArtifact[]>('trash', []), a = trash.find(a => a.item.id === key); if (!a) return missing; if (artifacts().some(item => item.item.id === key)) return { ok: false, error: 'A sample with this ID already exists.' }; writeSample('artifacts', [...artifacts(), a]); writeSample('trash', trash.filter(a => a.item.id !== key)); return { ok: true, item: a.item } },
  })
  replace(bridge.mcp, {
    read: async () => ({ servers: readSample<McpServerEntry[]>('mcp', []), problem: '' }),
    write: async servers => {
      const normalized = normalizeMcpServers(servers)
      if (normalized.problems.length) return { ok: false as const, written: [], answer: normalized.problems[0] }
      writeSample('mcp', normalized.servers)
      return { ok: true as const, written: ['Sample workspace/.mcp.json', 'Sample workspace/.agents/mcp_config.json'], answer: `${normalized.servers.length} tool server${normalized.servers.length === 1 ? '' : 's'} written to the sample workspace only. No engine config was touched.` }
    },
  })
  replace(engine, {
    authStatus: async id => id === 'agy'
      ? { ok: true, loggedIn: false, method: '', provider: '', answer: 'agy does not report a sign-in state. This sample runs no CLI, so there is nothing to ask.' }
      : { ok: true, loggedIn: true, method: 'sample', provider: 'sample', answer: 'Sample answer: signed in with sample (sample). No CLI was run and no credential was read.' },
    ollamaVersion: async () => ({ ok: true, version: '0.15.2', compatible: true, answer: 'Sample answer: Ollama 0.15.2 is new enough for Claude Code\u2019s local door. Nothing was contacted.' }),
    openLogin: async () => ({ ok: false, answer: 'This sample has no terminal to open. The installed app opens Claude Code\u2019s own sign-in there.' }),
  })
  replace(bridge.engine, {
    sessions: async () => readSample('sessions', sampleProjects().slice(0, 2).map((p, i) => ({ workspace: p.folder, sessionId: `sample-session-${i}` }))),
    boardRead: async () => readSample('board', { continuing: {}, done: [] }),
    boardWrite: async board => { writeSample('board', board); return { ok: true } },
    setWorkspace: async folder => change({ workspace: folder }),
    forgetSession: async workspace => { const sessions = readSample('sessions', sampleProjects().slice(0, 2).map((p, i) => ({ workspace: p.folder, sessionId: `sample-session-${i}` }))); writeSample('sessions', sessions.filter(s => s.workspace !== workspace)); return { ok: true } },
  })
  const listeners = new Set<(event: EngineEvent) => void>(), timers = new Set<ReturnType<typeof setTimeout>>()
  let active = false, pending = false, runtime = false
  const emit = (event: EngineEvent) => { for (const listener of listeners) listener(event) }
  const schedule = (delay: number, callback: () => void) => { const timer = setTimeout(() => { timers.delete(timer); if (active && sampleEnabled()) callback() }, delay); timers.add(timer) }
  const finish = (text: string) => { emit({ kind: 'done', text }); active = false; pending = false; emit({ kind: 'closed' }) }
  const cancel = () => { for (const timer of timers) clearTimeout(timer); timers.clear(); pending = false; active = false; emit({ kind: 'closed' }) }
  replace(engine, {
    capabilities: async () => unverifiedCapabilities(settings, 'This is a sample workspace. Real model and effort options need the desktop app and an installed engine.'),
    read: async () => ({ engine: settings, running: false, history: [] }),
    pick: async id => change({ id }), setModel: async (model, provider) => change({ model, cloudProvider: provider || '', thinking: 'default', effortTarget: undefined }), setApproval: async approval => change({ approval }), setThinking: async (thinking, effortTarget) => change({ thinking, effortTarget }),
    detect: async () => ['claude-code', 'agy'].map(id => ({ id: id as EngineSettings['id'], found: true, version: 'Simulated · not installed', install: '', path: '/Sample workspace/engines/' + id })),
    models: async () => ({ ok: true, models: ['sample-balanced', 'sample-fast', 'sample-reasoning'].map(name => ({ name, cloud: false, sizeGB: null })) }),
    pickWorkspace: async () => change({ workspace: '/Sample workspace/Website' }),
    send: async (_prompt, _cwd, pictures) => {
      if (pictures?.length) return { ok: false, answer: 'Sample engines do not process attachments. No file was sent.' }
      if (active) return { ok: false, answer: 'The sample engine is already working.' }
      active = true
      schedule(100, () => emit({ kind: 'status', text: 'Sample run · scripted locally, no model or command is running.' }))
      schedule(450, () => emit({ kind: 'tool', name: 'Read', summary: 'Sample: Projects/Workshop/Workshop plan.md' }))
      schedule(1000, () => {
        if (settings.approval === 'ask') { pending = true; emit({ kind: 'permission', requestId: 'sample-permission', tool: 'Write', summary: 'Add a note to the sample vault', detail: 'Only browser sample storage changes. No disk file or command will be touched.', file: 'Inbox/Sample task.md' }) }
        else finish('Sample response: the plan is ready to review. Explore Projects, Artifacts, Vault and Brain to see the related examples. This is a scripted demonstration, not an AI answer to your prompt.')
      })
      return say('Sample run started.')
    },
    answer: async (id, allow) => {
      if (!pending || id !== 'sample-permission') return { ok: false }
      pending = false
      if (allow) { const files = getSampleFiles(); files['Inbox/Sample task.md'] = '# Sample task\n\nYou approved a simulated write to browser storage.\n\nRelated: [[Workshop plan]].'; writeSample('files', files) }
      finish(allow ? 'Approved sample write saved in the sample vault. No real files were changed.' : 'Sample write denied. No note was added.'); return { ok: true }
    },
    stop: async () => { cancel(); return { ok: true } },
    onEvent: listener => { listeners.add(listener); return () => listeners.delete(listener) },
  })
  replace(engine.memory, {
    list: async () => ({ ok: true, folder: SAMPLE_ROOT + '/Memory', files: Object.entries(getSampleFiles()).filter(([name]) => name.startsWith('Memory/')).map(([path, content]) => ({ name: path.split('/').at(-1)!, path, content, clipped: false, updated: sampleTime() })) }),
    remove: async name => { const files = getSampleFiles(), path = name.startsWith('Memory/') ? name : 'Memory/' + name; if (!Object.hasOwn(files, path)) return { ok: false, answer: 'Sample memory note not found.' }; delete files[path]; writeSample('files', files); return say('Removed from sample memory only.') },
  })
  replace(engine.journal, {
    list: async () => ({ ok: true, entries: readSample('journal', [{ at: sampleTime(), prompt: 'Prepare the sample workshop checklist', answer: 'Sample checklist ready for review in Artifacts.', sessionId: 'sample-session-0', usage: 'Scripted example · no tokens used', workspace: settings.workspace }]) }),
    append: async entry => { writeSample('journal', [...readSample<Parameters<EngineBridge['journal']['append']>[0][]>('journal', []), entry].slice(-100)); return say('Saved to sample journal.') },
    clear: async () => { writeSample('journal', []); return say('Sample journal cleared.') },
  })
  replace(engine.downloads, {
    serveStatus: async () => ({ ok: true, running: runtime, answer: 'Simulated runtime status. No Ollama process is running from this preview.' }),
    serveStart: async () => { runtime = true; return say('Sample runtime switched on; no process started.') },
    serveStop: async () => { runtime = false; return say('Sample runtime switched off; no process stopped.') },
  })
}
