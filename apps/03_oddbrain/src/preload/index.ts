import type { WorkflowMode, WorkflowStep } from '../shared/lib/workflows'
import type { ScheduleInput } from '../shared/lib/schedules'
import type { ShellRequest } from '../shared/lib/commands'
import type { SkillDraft } from '../shared/lib/installedSkills'
import type { NativeConversation, NativeSessionLink, NativeContextTarget } from '../shared/lib/nativeConversation'
import { type EngineCapabilityReport } from '../shared/lib/engineCapabilities'
import type { ThinkingMode } from '../shared/lib/engine'
import type { MemoryBridge } from '../shared/lib/memoryWorkspace'
import type { MediaBridge } from '../shared/lib/mediaBridge'
import type { EngineSourceFile } from '../shared/lib/media'
import type { MarketplaceBridge } from '../shared/lib/marketplace'
import type { AutomationBridge, AutomationPreferences, AutomationView, ReviewInput } from '../shared/lib/automation'
import { contextBridge, ipcRenderer } from 'electron'
import type {
  CloudModelsAnswer,
  CloudTestAnswer,
  CloudView,
} from '../shared/lib/providers'
import type { Permissions } from '../shared/lib/permissions'
import type { ApprovalMode, EngineAvailability, EngineEvent, EngineId, EngineModelEntry, EngineSettings } from '../shared/lib/engine'
import type { HouseRules } from '../shared/lib/houseRules'
import type { Project } from '../shared/lib/projects'
import type { ChatStoreBridge, ChatStoreMigration, ChatStoreWrite } from '../shared/lib/chatStore'
import type { ReadTrustBridge } from '../shared/lib/readTrust'
import type {
  AdoptInput,
  ItemAnswer,
  ListAnswer,
  ReadAnswer,
  RemoveAnswer,
  SaveInput,
} from '../main/artifacts/store'

/**
 * The only bridge between the window and the machine.
 *
 * Every API added here gets an explicit, narrow shape: no raw `ipcRenderer`, so
 * the renderer can only call the functions named below and never an arbitrary
 * channel. Each one returns a value or a plain sentence — nothing here throws at
 * the interface, because a failed folder choice is not an exception, it is an
 * answer.
 */
/** The engine, exactly as the window may touch it: ask, task, answer, watch. */
const engineApi = {
  /** The chosen engine, whether it is working, and what it last said. */
  read: (): Promise<{ engine: EngineSettings; running: boolean; history: EngineEvent[]; lastSequence?: number; active?: { transcriptId: string; chatId?: string; prompt: string }; busy?: boolean }> =>
    ipcRenderer.invoke('engine:read'),
  /** Choose which engine thinks inside the app. */
  pick: (id: EngineId): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('engine:pick', id),
  /** The brains this engine can use, as its own door reports them. */
  models: (): Promise<{ ok: boolean; models: EngineModelEntry[]; error?: string }> =>
    ipcRenderer.invoke('engine:models'),
  /** What engines are really installed on this machine. */
  detect: (fresh?: boolean): Promise<EngineAvailability[]> => ipcRenderer.invoke('engine:detect', fresh === true),
  /** Point the app at the exe yourself — beats every automatic probe. */
  pickBinary: (id: 'claude-code' | 'agy'): Promise<{ ok: boolean; answer: string; path?: string }> =>
    ipcRenderer.invoke('engine:pick-binary', id),
  clearBinary: (id: 'claude-code' | 'agy'): Promise<{ ok: boolean; answer: string }> =>
    ipcRenderer.invoke('engine:clear-binary', id),
  binaryOverride: (id: 'claude-code' | 'agy'): Promise<{ path: string }> =>
    ipcRenderer.invoke('engine:binary-override', id),
  /** The CLI's own sign-in answer. agy has none, and says so. */
  authStatus: (id?: 'claude-code' | 'agy'): Promise<{ ok: boolean; loggedIn: boolean; method: string; provider: string; answer: string }> =>
    ipcRenderer.invoke('engine:auth-status', id),
  /** Open the engine's own login in a terminal; nothing is read back. */
  restart: (): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('engine:restart'),
  openLogin: (): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('engine:open-login'),
  /** The Ollama answering on the door, plus whether Claude Code can use it. */
  ollamaVersion: (): Promise<{ ok: boolean; version: string; compatible: boolean; answer: string }> =>
    ipcRenderer.invoke('engine:ollama-version'),
  /** Bring a brain home; progress arrives through onPullEvent. */
  pull: (name: string): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('engine:pull', name),
  /** Take a brain off this machine. */
  deleteModel: (name: string): Promise<{ ok: boolean; answer: string }> =>
    ipcRenderer.invoke('engine:model-delete', name),
  /** The rulebook, as it stands (blanks already filled from the defaults). */
  readHouseRules: (): Promise<{ rules: HouseRules; defaults: HouseRules }> =>
    ipcRenderer.invoke('houserules:read'),
  /** Save the rulebook and deploy it to every engine's global file. */
  writeHouseRules: (rules: HouseRules): Promise<{ ok: boolean; written: string[] }> =>
    ipcRenderer.invoke('houserules:write', rules),
  /** Pull progress ticks, in the same shape `parsePullLine` produces. */
  onPullEvent: (listener: (tick: unknown) => void): (() => void) => {
    const channel = 'engine:pull-event'
    const wrapped = (_event: unknown, tick: unknown): void => listener(tick)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
  /** Pick which brain the engine thinks with (provider brains say which door). */
  setModel: (model: string, provider?: 'anthropic' | 'native', expectedEngine?: EngineId): Promise<{ ok: boolean; answer: string }> =>
    ipcRenderer.invoke('engine:model', model, provider, expectedEngine),
  /** Set the throttle: how much the engine may do before asking. */
  setApproval: (mode: ApprovalMode): Promise<{ ok: boolean; answer: string }> =>
    ipcRenderer.invoke('engine:approval', mode),
  capabilities: (): Promise<EngineCapabilityReport> => ipcRenderer.invoke('engine:capabilities'),
  setThinking: (mode: ThinkingMode, target: string): Promise<{ ok: boolean; answer: string }> =>
    ipcRenderer.invoke('engine:thinking', mode, target),
  memory: {
    chooseFolder: (): Promise<{ ok: boolean; answer: string; folder?: string; canceled?: boolean }> => ipcRenderer.invoke('memory:choose-folder'),
    defaultFolder: (): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('memory:default-folder'),
    list: (): Promise<{ ok: boolean; folder?: string; files?: Array<{ name: string; path: string; updated: string; content: string; clipped: boolean }> }> =>
      ipcRenderer.invoke('memory:list'),
    remove: (name: string, expectedFolder?: string): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('memory:remove', name, expectedFolder),
  },
  journal: {
    list: (): Promise<{ ok: boolean; entries: Array<{ at: string; prompt: string; answer: string; sessionId: string | null; usage: string; workspace: string }> }> =>
      ipcRenderer.invoke('journal:list'),
    append: (entry: { at: string; prompt: string; answer: string; sessionId: string | null; usage: string; workspace: string }): Promise<{ ok: boolean; answer: string }> =>
      ipcRenderer.invoke('journal:append', entry),
    clear: (): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('journal:clear'),
  },
  /** "Open a folder": choose where the engine works. */
  pickWorkspace: (): Promise<{ ok: boolean; answer: string }> =>
    ipcRenderer.invoke('engine:pick-workspace'),
  /** Hand the engine a task. Events arrive through `onEvent` from then on. */
  send: (prompt: string, cwd: string, pictures?: Array<{ mime: string; data: string }>, conversation?: NativeConversation, queuedId?: string, originalFiles?: EngineSourceFile[]): Promise<{ ok: boolean; answer: string; transcriptId?: string }> =>
    ipcRenderer.invoke('engine:send', prompt, cwd, pictures, conversation, queuedId, originalFiles),
  /** What the app kept before allowed writes, and the way back. */
  checkpoints: {
    preview: (copy: string, original: string) => ipcRenderer.invoke('engine:checkpoint:preview', copy, original),
    decide: (token: string, decision: 'allow' | 'deny') => ipcRenderer.invoke('engine:checkpoint:decide', token, decision),
    list: (): Promise<{ ok: boolean; checkpoints: Array<{ copy: string; original: string; at: string }> }> =>
      ipcRenderer.invoke('engine:checkpoints:list'),
    restore: (copy: string, original?: string): Promise<{ ok: boolean; answer: string }> =>
      ipcRenderer.invoke('engine:checkpoint:restore', copy, original),
  },
  watch: {
    start: (folder: string): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('watch:start', folder),
    stop: (): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('watch:stop'),
    status: (): Promise<{ folder: string; active: boolean }> => ipcRenderer.invoke('watch:status'),
    onEvent: (listener: (tick: { folder: string; names: string[]; at: number }) => void): (() => void) => {
      const hear = (_event: unknown, tick: { folder: string; names: string[]; at: number }): void => listener(tick)
      ipcRenderer.on('watch:event', hear)
      return () => ipcRenderer.removeListener('watch:event', hear)
    },
  },
  hooks: {
    list: (): Promise<{ ok: boolean; hooks: Array<{ id: string; name: string; event: string; command: string }> }> =>
      ipcRenderer.invoke('hooks:list'),
    save: (hook: unknown): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('hooks:save', hook),
    remove: (id: string): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('hooks:remove', id),
    test: (command: string): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('hooks:test', command),
  },
  battle: {
    record: (entry: { prompt: string; winner: string; loser: string; tie: boolean; blind: boolean }): Promise<{ ok: boolean; answer: string }> =>
      ipcRenderer.invoke('battle:record', entry),
    ledger: (): Promise<{ ok: boolean; entries: Array<{ prompt: string; winner: string; loser: string; tie: boolean; at: string }> }> =>
      ipcRenderer.invoke('battle:ledger'),
  },
  repoMap: (): Promise<{ ok: boolean; answer?: string; map?: string; files?: number; dirs?: number; truncated?: boolean; root?: string }> =>
    ipcRenderer.invoke('repo:map'),
  compact: {
    save: (input: { brief: string; workspace: string; at: string }): Promise<{ ok: boolean; answer: string; file?: string }> =>
      ipcRenderer.invoke('compact:save', input),
  },
  fresh: (): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('engine:fresh'),
  recipes: {
    list: (): Promise<{ ok: boolean; recipes: Array<{ name: string; description?: string; parameters: Array<{ name: string; description?: string; default?: string }>; body: string }>; broken: Array<{ file: string; answer: string }> }> =>
      ipcRenderer.invoke('recipes:list'),
    save: (recipe: unknown): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('recipes:save', recipe),
    remove: (name: string): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('recipes:remove', name),
  },
  downloads: {
    start: (engine: string): Promise<{ ok: boolean; answer: string }> =>
      ipcRenderer.invoke('engine:download:start', engine),
    status: (): Promise<Record<string, { engine: string; endpoint: string; sha256: string; at: string } | undefined>> =>
      ipcRenderer.invoke('engine:download:status'),
    run: (engine: string): Promise<{ ok: boolean; answer: string; command?: string[] }> =>
      ipcRenderer.invoke('engine:download:run', engine),
    execute: (engine: string): Promise<{ ok: boolean; answer: string }> =>
      ipcRenderer.invoke('engine:download:execute', engine),
    remove: (engine: string): Promise<{ ok: boolean; answer: string }> =>
      ipcRenderer.invoke('engine:download:remove', engine),
    serveStart: (): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('engine:download:serve-start'),
    serveStop: (): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('engine:download:serve-stop'),
    serveStatus: (): Promise<{ ok: boolean; answer: string; running: boolean }> => ipcRenderer.invoke('engine:download:serve-status'),
    onEvent: (listener: (tick: { engine: string; got: number; total: number | null; phase: string; answer?: string }) => void): (() => void) => {
      const channel = (_outer: unknown, tick: { engine: string; got: number; total: number | null; phase: string; answer?: string }): void => listener(tick)
      ipcRenderer.on('engine:download-event', channel)
      return () => ipcRenderer.removeListener('engine:download-event', channel)
    },
  },
  extensionPair: {
    get: (): Promise<{ token: string }> => ipcRenderer.invoke('extension-pair:get'),
    rotate: (): Promise<{ ok: boolean; token: string }> => ipcRenderer.invoke('extension-pair:rotate'),
  },
  readTrust: {
    list: () => ipcRenderer.invoke('engine:read-trust:list'),
    approve: (requestId, mode) => ipcRenderer.invoke('engine:read-trust:approve', requestId, mode),
    revoke: id => ipcRenderer.invoke('engine:read-trust:revoke', id),
    migrateLegacy: raw => ipcRenderer.invoke('engine:read-trust:migrate', raw),
    onChanged: listener => { const hear = (): void => listener(); ipcRenderer.on('engine:read-trust-changed', hear); return () => ipcRenderer.removeListener('engine:read-trust-changed', hear) },
  } satisfies ReadTrustBridge,
  /** Answer one of the engine's permission cards. */
  answer: (requestId: string, allow: boolean): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('engine:answer', requestId, allow),
  /** Make the engine stop. */
  stop: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('engine:stop'),
  /** Watch the engine live. Returns the unsubscribe function. */
  onEvent: (listener: (event: EngineEvent) => void): (() => void) => {
    const channel = (_outer: unknown, event: EngineEvent): void => listener(event)
    ipcRenderer.on('engine:event', channel)
    return () => ipcRenderer.removeListener('engine:event', channel)
  },
}

const automationApi: AutomationBridge = {
  history: (before?: string) => ipcRenderer.invoke('automation:history', before),
  saved: (id: string) => ipcRenderer.invoke('automation:saved', id),
  read: () => ipcRenderer.invoke('automation:read'),
  update: (patch: Partial<AutomationPreferences>) => ipcRenderer.invoke('automation:update', patch),
  models: () => ipcRenderer.invoke('automation:models'),
  review: (input: ReviewInput) => ipcRenderer.invoke('automation:review', input),
  cancel: () => ipcRenderer.invoke('automation:cancel'),
  onChanged: listener => { const hear = (_event: unknown, view: AutomationView): void => listener(view); ipcRenderer.on('automation:changed', hear); return () => ipcRenderer.removeListener('automation:changed', hear) },
}
const mediaApi: MediaBridge = {
  authorizeRecording: expected => ipcRenderer.invoke('media:authorize-recording', expected),
  onCancelled: listener => { const fn = (): void => listener(); ipcRenderer.on('media:cancelled', fn); return () => ipcRenderer.removeListener('media:cancelled', fn) },
  read: () => ipcRenderer.invoke('media:read'), update: patch => ipcRenderer.invoke('media:update', patch),
  chooseDecoder: () => ipcRenderer.invoke('media:decoder'), decode: input => ipcRenderer.invoke('media:decode', input),
  dictate: () => ipcRenderer.invoke('media:dictate'), cancel: () => ipcRenderer.invoke('media:cancel'),
}
const marketplaceApi: MarketplaceBridge = {
  inspect: (repo, plugin, engine) => ipcRenderer.invoke('market:inspect', repo, plugin, engine),
  sources: engine => ipcRenderer.invoke('market:sources', engine), browse: (repo, engine) => ipcRenderer.invoke('market:browse', repo, engine),
  probe: engine => ipcRenderer.invoke('market:probe', engine), installed: engine => ipcRenderer.invoke('market:installed', engine),
  plan: (repo, action, plugin, engine) => ipcRenderer.invoke('market:plan', repo, action, plugin, engine),
  confirm: (token, engine) => ipcRenderer.invoke('market:confirm', token, engine), cancel: engine => ipcRenderer.invoke('market:cancel', engine),
}
const api = {
  chats: {
    read: () => ipcRenderer.invoke('chats:read'),
    onLoadProgress: listener => {
      const wrapped = (_event: Electron.IpcRendererEvent, progress: { done: number; total: number }) => listener(progress)
      ipcRenderer.on('chats:load-progress', wrapped)
      return () => { ipcRenderer.removeListener('chats:load-progress', wrapped) }
    },
    migrate: (input: ChatStoreMigration) => ipcRenderer.invoke('chats:migrate', input),
    write: (input: ChatStoreWrite) => ipcRenderer.invoke('chats:write', input),
    exportRecovery: (input: ChatStoreMigration) => ipcRenderer.invoke('chats:export-recovery', input),
    importRecovery: () => ipcRenderer.invoke('chats:import-recovery'),
    openLocation: () => ipcRenderer.invoke('chats:open-location'),
  } satisfies ChatStoreBridge,
  transcripts: { raw: (id: string) => ipcRenderer.invoke('transcripts:raw', id), image: (id: string, imageId: string) => ipcRenderer.invoke('transcripts:image', id, imageId), attachment: (id: string, attachmentId: string) => ipcRenderer.invoke('transcripts:attachment', id, attachmentId), recover: (chatIds: string[], knownTranscriptIds: string[], before?: string) => ipcRenderer.invoke('transcripts:recover', chatIds, knownTranscriptIds, before), list: (before?: string) => ipcRenderer.invoke('transcripts:list', before), read: (id: string) => ipcRenderer.invoke('transcripts:read', id) },
  media: mediaApi, marketplace: marketplaceApi,
  automation: automationApi,
  memoryWorkspace: { read: () => ipcRenderer.invoke('memory-workspace:read'), act: action => ipcRenderer.invoke('memory-workspace:act', action), run: () => ipcRenderer.invoke('memory-workspace:run') } satisfies MemoryBridge,
  app: {
    previewHtml: (): Promise<{ ok: boolean; html?: string; error?: string }> => ipcRenderer.invoke('app:preview-html'),
    claimLaunch: (): Promise<boolean> => ipcRenderer.invoke('app:claim-launch'),
    /** Which build is running. Used by the About panel and bug reports. */
    version: process.env['npm_package_version'] ?? '0.1.0',
    platform: process.platform,
    /** Open the vault folder in the file manager — the owner's own folder. */
    openVaultFolder: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('vault:open-folder'),
    /** The machine's own suggestion for the owner's name, for first run. */
    whoami: (): Promise<{ name: string }> => ipcRenderer.invoke('app:whoami'),
    flags: {
      get: (): Promise<{ loginItem: boolean; warmRuntime: boolean; keepLoadedAlways: boolean }> =>
        ipcRenderer.invoke('app:flags:get'),
      set: (patch: { loginItem?: boolean; warmRuntime?: boolean; keepLoadedAlways?: boolean }): Promise<{
        loginItem: boolean
        warmRuntime: boolean
        keepLoadedAlways: boolean
      }> => ipcRenderer.invoke('app:flags:set', patch),
    },
    /** Open a https://github.com link in the person's browser. */
    openExternal: (url: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('app:open-external', url),
    /** The native menu talks to the window through these channels. */
    onMenu: (channel: string, callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on(String(channel), listener)
      return () => ipcRenderer.removeListener(String(channel), listener)
    },
  },
  workflows: { list: (before?: string) => ipcRenderer.invoke('workflows:list', before), save: (input: { name: string; cwd: string; steps: WorkflowStep[]; mode?: WorkflowMode }) => ipcRenderer.invoke('workflows:save', input), archive: (id: string, archived: boolean) => ipcRenderer.invoke('workflows:archive', id, archived), preview: (id: string) => ipcRenderer.invoke('workflows:preview', id), decide: (token: string, decision: 'allow' | 'deny') => ipcRenderer.invoke('workflows:decide', token, decision), cancel: () => ipcRenderer.invoke('workflows:cancel'), runs: (before?: string) => ipcRenderer.invoke('workflows:runs', before), readRun: (id: string) => ipcRenderer.invoke('workflows:read-run', id) },
  schedules: { list: () => ipcRenderer.invoke('schedules:list'), preview: (input: ScheduleInput) => ipcRenderer.invoke('schedules:preview', input), decide: (token: string, decision: 'allow' | 'deny') => ipcRenderer.invoke('schedules:decide', token, decision), pause: (id: string) => ipcRenderer.invoke('schedules:pause', id), inbox: (before?: string) => ipcRenderer.invoke('schedules:inbox', before), acknowledge: (id: string) => ipcRenderer.invoke('schedules:acknowledge', id) },
  commands: { saved: (before?: string) => ipcRenderer.invoke('commands:saved', before), save: (input: { name: string; command: string; cwd: string }) => ipcRenderer.invoke('commands:save', input), archiveSaved: (id: string, archived: boolean) => ipcRenderer.invoke('commands:archive-saved', id, archived), previewSaved: (id: string) => ipcRenderer.invoke('commands:preview-saved', id), context: () => ipcRenderer.invoke('commands:context'), preview: (request: ShellRequest) => ipcRenderer.invoke('commands:preview', request), decide: (token: string, decision: 'allow' | 'deny') => ipcRenderer.invoke('commands:decide', token, decision), cancel: () => ipcRenderer.invoke('commands:cancel'), history: (before?: string) => ipcRenderer.invoke('commands:history', before), read: (id: string) => ipcRenderer.invoke('commands:read', id), output: (id: string, stream: 'stdout' | 'stderr') => ipcRenderer.invoke('commands:output', id, stream) },
  projects: {
    attach: (projectId: string) => ipcRenderer.invoke('projects:attach', projectId),
    read: (): Promise<Project[]> => ipcRenderer.invoke('projects:read'),
    write: (projects: Project[], expected?: Project[]): Promise<{ ok: boolean; projects: Project[] }> =>
      ipcRenderer.invoke('projects:write', projects, expected),
    blank: (name: string): Promise<Project> => ipcRenderer.invoke('projects:new', name),
  },
  engine: {
    queue: { read: () => ipcRenderer.invoke('queue:read'), hold: (id: string) => ipcRenderer.invoke('queue:hold', id), enqueue: (prompt: string, conversation?: NativeConversation) => ipcRenderer.invoke('queue:enqueue', prompt, conversation), resume: (id: string, acknowledge?: boolean) => ipcRenderer.invoke('queue:resume', id, acknowledge), cancel: (id: string) => ipcRenderer.invoke('queue:cancel', id), history: (before?: string) => ipcRenderer.invoke('queue:history', before) },
    contextTarget: (input: NativeConversation): Promise<NativeContextTarget> => ipcRenderer.invoke('engine:context-target', input),
    chatSessions: (chatId: string): Promise<NativeSessionLink[]> => ipcRenderer.invoke('engine:chat-sessions', chatId),
    setWorkspace: (folder: string): Promise<{ ok: boolean; answer: string }> =>
      ipcRenderer.invoke('engine:workspace-set', folder),
    sessions: (): Promise<Array<{ workspace: string; sessionId: string }>> => ipcRenderer.invoke('engine:sessions'),
    boardRead: (): Promise<unknown> => ipcRenderer.invoke('sessions:board-read'),
    boardWrite: (board: unknown, expected: unknown): Promise<{ ok: boolean }> => ipcRenderer.invoke('sessions:board-write', board, expected),
    pickFiles: (): Promise<string[]> => ipcRenderer.invoke('sessions:pick-files'),
    forgetSession: (workspace: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('engine:sessions-forget', workspace),
    openFolder: (folder: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('app:open-folder', folder),
    checkpoints: {
    preview: (copy: string, original: string) => ipcRenderer.invoke('engine:checkpoint:preview', copy, original),
    decide: (token: string, decision: 'allow' | 'deny') => ipcRenderer.invoke('engine:checkpoint:decide', token, decision),
      inspect: (copy: string): Promise<{ ok: boolean; content?: string; clipped?: boolean; answer?: string }> => ipcRenderer.invoke('engine:checkpoint:inspect', copy),
      list: (): Promise<{ ok: boolean; checkpoints: Array<{ copy: string; original: string; at: string }> }> =>
        ipcRenderer.invoke('engine:checkpoints:list'),
      restore: (copy: string, original?: string): Promise<{ ok: boolean; answer: string }> =>
      ipcRenderer.invoke('engine:checkpoint:restore', copy, original),
    },
  },
  houseRules: {
    previewGlobal: (engine: 'claude-code' | 'agy') => ipcRenderer.invoke('rules:preview-global', engine),
    previewProject: (projectId: string, engine: 'claude-code' | 'agy') => ipcRenderer.invoke('rules:preview-project', projectId, engine),
    decide: (token: string, decision: 'allow' | 'deny') => ipcRenderer.invoke('rules:decide', token, decision),
    read: (): Promise<{ rules: HouseRules; defaults: HouseRules }> => ipcRenderer.invoke('houserules:read'),
    write: (rules: HouseRules): Promise<{ ok: boolean; written: string[] }> =>
      ipcRenderer.invoke('houserules:write', rules),
  },
  settings: {
    /** What the app has been told to do, as the main process holds it. */
    read: (): Promise<{
      vaultPath: string
      cloud: { baseUrl: string; model: string }
      permissions: Permissions
    }> => ipcRenderer.invoke('settings:read'),
    /**
     * Save a change. The main process decides whether it is possible and says
     * what happened; the renderer is told the result rather than assuming one.
     */
    update: (
      patch: { vaultPath?: string; cloud?: { baseUrl?: string; model?: string }; permissions?: Partial<Permissions> }
    ): Promise<{
      ok: boolean
      error?: string
      settings?: { vaultPath: string; cloud: { baseUrl: string; model: string }; permissions: Permissions }
      status?: { ok: boolean; available: boolean; vault: string; error?: string; counts?: { files: number; entities: number } }
    }> => ipcRenderer.invoke('settings:update', patch),
  },
  /**
   * Online providers. The key is handed over once and never comes back: what the
   * interface can ask is which providers are enabled, which models they offer,
   * and whether one of them answers — never the key itself.
   */
  cloud: {
    /** The providers and whether a key is saved for each. Never the key. */
    providers: (): Promise<CloudView> => ipcRenderer.invoke('cloud:providers'),
    /** Every model the saved keys can reach, with each provider's own problem. */
    models: (): Promise<CloudModelsAnswer> => ipcRenderer.invoke('cloud:models'),
    /** Save a key. It is sealed by the machine's keychain, or held for this run. */
    saveKey: (id: string, key: string): Promise<CloudView> =>
      ipcRenderer.invoke('cloud:save-key', id, key),
    /** Take a key away. Nothing else about that provider is touched. */
    clearKey: (id: string): Promise<CloudView> => ipcRenderer.invoke('cloud:clear-key', id),
    /** Ask one provider for its model list, which is what the Test button does. */
    test: (id: string): Promise<CloudTestAnswer> => ipcRenderer.invoke('cloud:test', id),
  },
  skills: {
    planCatalog: (name: string) => ipcRenderer.invoke('skills:plan-catalog', name),
    decideCatalog: (token: string, decision: 'allow' | 'deny') => ipcRenderer.invoke('skills:decide-catalog', token, decision),
    cancelCatalog: () => ipcRenderer.invoke('skills:cancel-catalog'),
    inventory: (engine: 'claude-code' | 'agy') => ipcRenderer.invoke('skills:inventory', engine),
    inspectInstalled: (engine: 'claude-code' | 'agy', id: string) => ipcRenderer.invoke('skills:inspect-installed', engine, id),
    previewCreate: (draft: SkillDraft) => ipcRenderer.invoke('skills:preview-create', draft),
    decideCreate: (token: string, decision: 'allow' | 'deny') => ipcRenderer.invoke('skills:decide-create', token, decision),
    /** Install one skill from the app's own catalog, into every engine. */
    installCatalog: (name: string): Promise<{ ok: boolean; answer: string; written?: string[] }> =>
      ipcRenderer.invoke('skills:install-catalog', name),
    /** The skills the engine folder really holds — the export list. */
    scan: (): Promise<Array<{ name: string; description: string; body: string; source: string }>> =>
      ipcRenderer.invoke('skills:scan'),
  },
  mods: {
    installFromFile: (): Promise<{ ok: boolean; answer: string; pack?: unknown; prompts?: Array<{ name: string; body: string }>; themes?: Array<{ name: string; appearance: Record<string, string>; css?: string }>; folder?: string }> =>
      ipcRenderer.invoke('mods:install-from-file'),
    list: (): Promise<Array<{ pack: unknown; folder: string; installedAt: string }>> => ipcRenderer.invoke('mods:list'),
    remove: (id: string): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('mods:remove', id),
    indexAdd: (kind: string, locator: string): Promise<{ ok: boolean; answer: string }> =>
      ipcRenderer.invoke('mods:index-add', { kind, locator }),
    indexList: (): Promise<Array<{ kind: 'folder' | 'url'; locator: string; addedAt: string }>> =>
      ipcRenderer.invoke('mods:index-list'),
    indexRemove: (locator: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('mods:index-remove', locator),
    indexBrowse: (kind: string, locator: string): Promise<unknown> =>
      ipcRenderer.invoke('mods:index-browse', { kind, locator }),
    indexInstall: (kind: string, locator: string, id: string): Promise<{ ok: boolean; answer: string; written?: string[]; folder?: string }> =>
      ipcRenderer.invoke('mods:index-install', { kind, locator, id }),
    exportPack: (payload: { name: string; description: string; author: string; skills: string[]; theme: { appearance: Record<string, string>; css?: string } | null }): Promise<{ ok: boolean; answer: string; folder?: string; index?: string }> =>
      ipcRenderer.invoke('mods:export', payload),
    installStarter: (): Promise<{ ok: boolean; answer: string; folder?: string; written?: string[] }> =>
      ipcRenderer.invoke('mods:install-starter'),
    communityIndex: (): Promise<{ ok: boolean; path?: string }> =>
      ipcRenderer.invoke('mods:community-index'),
  },
  mcp: {
    preview: (servers: unknown) => ipcRenderer.invoke('mcp:preview', servers),
    decide: (token: string, decision: 'allow' | 'deny') => ipcRenderer.invoke('mcp:decide', token, decision),
    inventory: (engine: 'claude-code' | 'agy') => ipcRenderer.invoke('mcp:inventory', engine),
    /** The one MCP server list, and which engine configs it was deployed to. */
    read: (): Promise<{ servers: Array<{ name: string; command?: string; args?: string[]; url?: string }>; problem: string }> =>
      ipcRenderer.invoke('mcp:read'),
    write: (
      servers: Array<{ name: string; command?: string; args?: string[]; url?: string }>,
    ): Promise<{ ok: boolean; written: string[]; answer: string }> => ipcRenderer.invoke('mcp:write', { servers }),
  },
  structure: {
    /** What a folder is, and exactly what a structure apply would add. */
    inspect: (
      root: string
    ): Promise<{ ok: boolean; kind?: string; present?: string[]; missing?: string[]; differing?: string[]; error?: string }> =>
      ipcRenderer.invoke('structure:inspect', root),
    /** Add every missing structure file; existing files are never rewritten. */
    apply: (
      root: string,
      options?: { refresh?: boolean }
    ): Promise<{ ok: boolean; kind?: string; written?: string[]; refreshed?: string[]; skipped?: string[]; differing?: string[]; error?: string }> =>
      ipcRenderer.invoke('structure:apply', root, options),
    /** Settle a conflict: keep mine, use the new one, keep both, or combine. */
    resolve: (root: string, original: string, added: string, action: 'mine' | 'new' | 'both' | 'combine'): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('structure:resolve', root, original, added, action),
    /** Every [[link]] in the vault, resolved and counted: dead and ambiguous reported. */
    linkCheck: (): Promise<{ files: number; checked: number; dead: Array<{ from: string; target: string }>; ambiguous: Array<{ from: string; target: string; matches: string[] }>; edges: Array<{ from: string; to: string }>; error?: string }> =>
      ipcRenderer.invoke('vault:link-check'),
  },
  vault: {
    /** The operating system's folder picker. null when the person closed it. */
    chooseFolder: (): Promise<string | null> => ipcRenderer.invoke('vault:choose-folder'),
    /** His default: Documents\OddBrain\Brain, created on this press. */
    useDefault: (): Promise<{ ok: boolean; path?: string; written?: string[]; conflicts?: Array<{ original: string; added: string }>; error?: string }> =>
      ipcRenderer.invoke('vault:use-default'),
    /** A finished turn, written into the vault as a handoff document. */
    saveHandoff: (name: string, markdown: string): Promise<{ ok: boolean; answer: string }> =>
      ipcRenderer.invoke('vault:save-handoff', { name, markdown }),
    /** A timestamped portable copy of the vault, written to the exports folder. */
    backup: (operation: 'create' | 'restore'): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('vault:backup', operation),
    exportCopy: (): Promise<{ ok: boolean; answer: string }> => ipcRenderer.invoke('vault:export-copy'),
    /** The open conversation, captured into the vault as a capsule. */
    captureChat: (title: string, markdown: string): Promise<{ ok: boolean; answer: string }> =>
      ipcRenderer.invoke('vault:capture-chat', { title, markdown }),
  },
  extension: {
    export: (destination: 'downloads' | 'choose'): Promise<{ ok: boolean; answer: string; path?: string }> => ipcRenderer.invoke('extension:export', destination),
    publishAppearance: (value: import('../shared/lib/extensionAppearance').ExtensionAppearance): Promise<{ ok: boolean }> => ipcRenderer.invoke('extension:appearance', value),
    /**
     * Whether the browser extension can reach this app, and at what address. A
     * port that is open is a fact the interface shows rather than something to
     * discover from an extension that quietly stopped working.
     */
    status: (): Promise<{ ok: boolean; listening: boolean; port: number; url: string; error: string }> =>
      ipcRenderer.invoke('extension:status'),
  },
  /**
   * The artifact library, on disk in this user's own app-data folder.
   *
   * Every call answers rather than throws: a library that cannot be read says
   * so in a sentence the screen can show, because an exception here would be a
   * blank grid with no explanation.
   */
  /** The quick-ask door: open the small window, or move its global hotkey. */
  quick: {
    open: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('quick:open'),
    shortcut: (enabled: boolean): Promise<{ ok: boolean; enabled: boolean }> => ipcRenderer.invoke('quick:shortcut', { enabled }),
  },

  /** An artifact outside the chat: its own window, or a PDF in the vault. */
  artifactWindow: {
    popout: (html: string, title: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('artifact:popout', { html, title }),
    savePdf: (html: string, name: string): Promise<{ ok: boolean; answer: string }> =>
      ipcRenderer.invoke('artifact:pdf', { html, name }),
  },

  artifacts: {
    trashList: (): Promise<{ ok: boolean; items: import('../main/artifacts/store').TrashItem[]; error?: string }> => ipcRenderer.invoke('artifacts:trash-list'),
    trashRestore: (key: string): Promise<ItemAnswer> => ipcRenderer.invoke('artifacts:trash-restore', key),
    list: (): Promise<ListAnswer> => ipcRenderer.invoke('artifacts:list'),
    /** One document. `version` is 1-based, the number the chips show. */
    read: (id: string, version?: number): Promise<ReadAnswer> => ipcRenderer.invoke('artifacts:read', id, version),
    /** Create, or append a version to an existing artifact. */
    save: (input: SaveInput): Promise<ItemAnswer> => ipcRenderer.invoke('artifacts:save', input),
    rename: (id: string, title: string): Promise<ItemAnswer> => ipcRenderer.invoke('artifacts:rename', id, title),
    duplicate: (id: string): Promise<ItemAnswer> => ipcRenderer.invoke('artifacts:duplicate', id),
    /** Put an older version back — by appending it, never by truncating. */
    restore: (id: string, version: number): Promise<ItemAnswer> => ipcRenderer.invoke('artifacts:restore', id, version),
    /** Take it out of the library; the folder moves to the library's trash. */
    remove: (id: string): Promise<RemoveAnswer> => ipcRenderer.invoke('artifacts:remove', id),
    /** Write artifacts found in saved conversations in, once each. */
    adopt: (records: AdoptInput[]): Promise<{ ok: true; adopted: number; skipped: number; refused: number }> =>
      ipcRenderer.invoke('artifacts:adopt', records),
    /** The operating system's file picker, for a page or a drawing to bring in. */
    import: (): Promise<{ ok: boolean; item?: unknown; error?: string; canceled?: boolean }> =>
      ipcRenderer.invoke('artifacts:import'),
  },
}

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('engineApi', engineApi)

export type Api = typeof api
