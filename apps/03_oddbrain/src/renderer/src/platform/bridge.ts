import type { WorkflowBridge } from '@shared/lib/workflows'
import type { ScheduleBridge } from '@shared/lib/schedules'
import type { CommandBridge } from '@shared/lib/commands'
import type { WorkQueueBridge } from '@shared/lib/workQueue'
import type { McpReview, NativeMcpInventory } from '@shared/lib/mcpReview'
import type { SkillDraft, SkillInventory, SkillFile, CatalogSkillReview } from '@shared/lib/installedSkills'
import type { NativeConversation, NativeSessionLink, NativeContextTarget } from '@shared/lib/nativeConversation'
import type { FileReview, FileDecision } from '@shared/lib/changeReview'
import type { TranscriptBridge } from '@shared/lib/transcripts'
import type { ChatStoreBridge } from '@shared/lib/chatStore'
import type { WorkingNotesBridge } from '@shared/lib/workingNotesStore'
import type { ReadTrustBridge } from '@shared/lib/readTrust'
import type { EngineSourceFile } from '@shared/lib/media'
import { unverifiedCapabilities, type EngineCapabilityReport } from '@shared/lib/engineCapabilities'
import type { ThinkingMode } from '@shared/lib/engine'
import type { MemoryBridge } from '@shared/lib/memoryWorkspace'
import type { MemoryObBridge } from '@shared/lib/memoryOb'
import type { ProcessingLedgerBridge } from '@shared/lib/processingLedger'
import type { AttachmentCenterBridge } from '@shared/lib/attachmentCenter'
import type { FolderAccessBridge } from '@shared/lib/folderAccess'
import { demoMemoryWorkspace } from './sampleMemory'
import { createBrainHostBridge } from './brainHost'
import { DEFAULT_MEDIA, type MediaBridge } from '@shared/lib/mediaBridge'
import { DEFAULT_VIDEO_STUDIO, type VideoStudioBridge } from '@shared/lib/videoStudio'
import type { MarketplaceBridge } from '@shared/lib/marketplace'
import { DEFAULT_AUTOMATION, normalizeAutomation, type AutomationBridge, type AutomationView } from '@shared/lib/automation'
/**
 * The one place the interface talks to the machine.
 *
 * In the desktop app, `window.api` is put there by the preload script, and every
 * method on it is a bridge to the main process — files, the vault, the models,
 * shell access. In a browser there is no preload script, so `window.api` is
 * simply absent, and that is the case this file exists for: the web preview
 * (see vite.web.config.ts) must render the real interface rather than a blank
 * page or a stack trace.
 *
 * Two rules, both taken straight from the project's no-warnings rule:
 *
 *   1. Nothing here throws at import time or at call time. Every method
 *      resolves. A capability that is missing is a value the UI can show as
 *      "not available here", never an exception in the console.
 *   2. Nothing here pretends to be real. `isDemo` is true in the browser, and
 *      the empty preview returns empty data or a capability refusal. The browser
 *      entry can install the labelled sample-workspace adapter separately;
 *      it never replaces a native preload or calls real services.
 */
import type { CloudModelsAnswer, CloudTestAnswer, CloudView } from '@shared/lib/providers'
import {
  DEFAULT_ENGINE,
  type ApprovalMode,
  type EngineAvailability,
  type EngineEvent,
  type EngineId,
  type EngineModelEntry,
  type EngineSettings,
} from '@shared/lib/engine'
import { DEFAULT_HOUSE_RULES, type HouseRules } from '@shared/lib/houseRules'
import type { Recipe } from '@shared/lib/recipes'
import { newProject, type Project } from '@shared/lib/projects'
import { DEFAULT_PERMISSIONS, type Permissions } from '@shared/lib/permissions'
import type {
  AdoptInput,
  ItemAnswer,
  ListAnswer,
  ReadAnswer,
  RemoveAnswer,
  SaveInput,
} from '../../../main/artifacts/store'

/** What the preload script exposes today. It grows as the main process does. */
export type DesktopBridge = {
  chats: ChatStoreBridge
  appData: {
    backup: (operation: 'create' | 'restore', rendererPreferences?: Record<string, string>) => Promise<{ ok: boolean; answer: string }>
    completeMemoryBackup: (operation: 'create' | 'restore', rendererPreferences?: Record<string, string>) => Promise<{ ok: boolean; answer: string }>
  }
  workingNotes: WorkingNotesBridge
  transcripts: TranscriptBridge
  media: MediaBridge
  videoStudio: VideoStudioBridge
  marketplace: MarketplaceBridge
  memoryWorkspace: MemoryBridge
  memoryOb: MemoryObBridge
  processing: ProcessingLedgerBridge
  attachmentCenter: AttachmentCenterBridge
  folderAccess: FolderAccessBridge
  automation: AutomationBridge
  extensionPair: {
    get: () => Promise<{ token: string }>
    rotate: () => Promise<{ ok: boolean; token: string }>
  }
  app: {
    claimLaunch?: () => Promise<boolean>
    previewHtml?: () => Promise<{ ok: boolean; html?: string; error?: string }>
    version: string
    platform: string
    /** Desktop only: open the vault folder in the file manager. */
    openVaultFolder?: () => Promise<{ ok: boolean }>
    flags?: {
      get: () => Promise<{ loginItem: boolean; warmRuntime: boolean; keepLoadedAlways: boolean }>
      set: (patch: { loginItem?: boolean; warmRuntime?: boolean; keepLoadedAlways?: boolean }) => Promise<{
        loginItem: boolean
        warmRuntime: boolean
        keepLoadedAlways: boolean
      }>
    }
    /** Desktop only: the machine's own suggestion for the owner's name. */
    whoami?: () => Promise<{ name: string }>
    /** Desktop only: open a github.com link in the person's browser. */
    openExternal?: (url: string) => Promise<{ ok: boolean }>
    /** Desktop only: the native menu's events (File > New chat, Go > screens). */
    onMenu?: (channel: string, callback: () => void) => () => void
  }
  houseRules: {
    previewGlobal: (engine: 'claude-code' | 'agy') => Promise<FileReview>
    previewProject: (projectId: string, engine: 'claude-code' | 'agy') => Promise<FileReview>
    decide: (token: string, decision: 'allow' | 'deny') => Promise<FileDecision>
    /** The rulebook as it stands; blanks already filled from the defaults. */
    read: () => Promise<{ rules: HouseRules; defaults: HouseRules }>
    /** Save app instructions; native file changes require a separate review. */
    write: (rules: HouseRules) => Promise<{ ok: boolean; written: string[] }>
  }
  workflows: WorkflowBridge
  schedules: ScheduleBridge
  commands: CommandBridge
  projects: {
    attach: (projectId: string) => Promise<import('@shared/lib/projects').ProjectReference[]>
    read: () => Promise<Project[]>
    write: (projects: Project[], expected?: Project[]) => Promise<{ ok: boolean; projects: Project[] }>
    blank: (name: string) => Promise<Project>
  }
  engine: {
    queue: WorkQueueBridge
    contextTarget: (input: NativeConversation) => Promise<NativeContextTarget>
    chatSessions: (chatId: string) => Promise<NativeSessionLink[]>
    /** "Work here": the owner points the engine at a folder explicitly. */
    setWorkspace: (folder: string) => Promise<{ ok: boolean; answer: string }>
    /** The resumable threads, per workspace. */
    sessions: () => Promise<Array<{ workspace: string; sessionId: string }>>
    boardRead: () => Promise<unknown>
    boardWrite: (board: unknown, expected: unknown) => Promise<{ ok: boolean }>
    pickFiles: () => Promise<string[]>
    forgetSession: (workspace: string) => Promise<{ ok: boolean }>
    openFolder: (folder: string) => Promise<{ ok: boolean }>
    checkpoints: {
      preview: (copy: string, original: string) => Promise<FileReview>
      decide: (token: string, decision: 'allow' | 'deny') => Promise<FileDecision>
      inspect: (copy: string) => Promise<{ ok: boolean; content?: string; clipped?: boolean; answer?: string }>
      list: () => Promise<{ ok: boolean; checkpoints: Array<{ copy: string; original: string; at: string }> }>
      restore: (copy: string, original?: string) => Promise<{ ok: boolean; answer: string }>
    }
  }
  settings: {
    /** What the app has been told to do. */
    read: () => Promise<{ vaultPath: string; cloud: { baseUrl: string; model: string }; permissions: Permissions }>
    /** Save a change; the main process decides and reports what happened. */
    update: (patch: {
      vaultPath?: string
      cloud?: { baseUrl?: string; model?: string }
      permissions?: Partial<Permissions>
    }) => Promise<{
      ok: boolean
      error?: string
      settings?: { vaultPath: string; cloud?: { baseUrl: string; model: string }; permissions?: Permissions }
      status?: {
        ok: boolean
        available: boolean
        vault: string
        error?: string
        counts?: { files: number; entities: number }
      }
    }>
  }
  skills: {
    planCatalog: (name: string) => Promise<CatalogSkillReview>
    decideCatalog: (token: string, decision: 'allow' | 'deny') => Promise<{ ok: boolean; answer: string }>
    cancelCatalog: () => Promise<void>
    inventory: (engine: 'claude-code' | 'agy') => Promise<SkillInventory>
    inspectInstalled: (engine: 'claude-code' | 'agy', id: string) => Promise<SkillFile & { content: string }>
    previewCreate: (draft: SkillDraft) => Promise<FileReview>
    decideCreate: (token: string, decision: 'allow' | 'deny') => Promise<FileDecision>
    /** Install one skill from the app's own catalog, into every engine. */
    installCatalog: (name: string) => Promise<{ ok: boolean; answer: string; written?: string[] }>
    scan: () => Promise<Array<{ name: string; description: string; body: string; source: string }>>
  }
  /** Mods, Phase 1: a pack is a folder with a manifest; install, list, remove. */
  mods: {
    installFromFile: () => Promise<{
      ok: boolean
      answer: string
      pack?: { id: string; name: string; version: string; author: string; description: string; license: string; contributes: { skills: string[]; prompts: string[]; themes: string[] } }
      prompts?: Array<{ name: string; body: string }>
      themes?: Array<{ name: string; appearance: Record<string, string>; css?: string }>
      folder?: string
    }>
    list: () => Promise<Array<{ pack: { id: string; name: string; version: string; author: string; description: string }; folder: string; installedAt: string }>>
    remove: (id: string) => Promise<{ ok: boolean; answer: string }>
    /** Phase 2: the index client — a store is an index file, not a service. */
    indexAdd: (kind: string, locator: string) => Promise<{ ok: boolean; answer: string }>
    indexList: () => Promise<Array<{ kind: 'folder' | 'url'; locator: string; addedAt: string }>>
    indexRemove: (locator: string) => Promise<{ ok: boolean }>
    indexBrowse: (kind: string, locator: string) => Promise<{
      ok: boolean
      problem?: string
      name?: string
      packs?: Array<{ id: string; name: string; version: string; author: string; description: string; permissions: Record<string, unknown>; checksum: string; source: string; verified: boolean; problem: string }>
    }>
    indexInstall: (kind: string, locator: string, id: string) => Promise<{ ok: boolean; answer: string; written?: string[]; folder?: string }>
    exportPack: (payload: { name: string; description: string; author: string; skills: string[]; theme: { appearance: Record<string, string>; css?: string } | null }) => Promise<{ ok: boolean; answer: string; folder?: string; index?: string }>
    installStarter: () => Promise<{ ok: boolean; answer: string; folder?: string; written?: string[] }>
    communityIndex?: () => Promise<{ ok: boolean; path?: string }>
  }
  /** The engine's tool servers (MCP). Browser control is one entry in this list. */
  mcp: {
    preview: (servers: unknown) => Promise<McpReview>
    decide: (token: string, decision: 'allow' | 'deny') => Promise<{ ok: boolean; answer: string }>
    inventory: (engine: 'claude-code' | 'agy') => Promise<NativeMcpInventory>
    read: () => Promise<{ servers: Array<{ name: string; command?: string; args?: string[]; url?: string }>; problem?: string }>
    write: (servers: Array<{ name: string; command?: string; args?: string[]; url?: string }>) => Promise<{ ok: boolean; written: string[]; answer: string }>
  }
  structure: {
    /** What a folder is, and exactly what a structure apply would add. */
    inspect: (root: string) => Promise<{ ok: boolean; kind?: string; present?: string[]; missing?: string[]; differing?: string[]; conflicts?: Array<{ original: string; added: string }>; error?: string }>
    /** Add every missing structure file; existing files are never rewritten. */
    apply: (
      root: string,
      options?: { refresh?: boolean }
    ) => Promise<{
      ok: boolean
      kind?: string
      written?: string[]
      refreshed?: string[]
      skipped?: string[]
      conflicts?: Array<{ original: string; added: string }>
      differing?: string[]
      error?: string
    }>
    /** Settle a conflict: keep mine, use the new one, keep both, or combine. */
    resolve: (root: string, original: string, added: string, action: 'mine' | 'new' | 'both' | 'combine') => Promise<{ ok: boolean; error?: string }>
    /** Every [[link]] in the vault, resolved and counted: dead and ambiguous reported. */
    linkCheck: () => Promise<{ files: number; checked: number; dead: Array<{ from: string; target: string }>; ambiguous: Array<{ from: string; target: string; matches: string[] }>; edges: Array<{ from: string; to: string }>; error?: string }>
  }
  vault: {
    /** The operating system's folder picker. null when the person closed it. */
    chooseFolder: () => Promise<string | null>
    /** His default: Documents\OddBrain\Brain, created on this press. */
    useDefault: () => Promise<{ ok: boolean; path?: string; written?: string[]; conflicts?: Array<{ original: string; added: string }>; error?: string }>
    /** A finished turn, written into the vault as a handoff document. */
    saveHandoff: (name: string, markdown: string) => Promise<{ ok: boolean; answer: string }>
    /** A timestamped portable copy of the vault, written to the exports folder. */
    backup: (operation: 'create' | 'restore') => Promise<{ ok: boolean; answer: string }>
    exportCopy: () => Promise<{ ok: boolean; answer: string }>
    /** The open conversation, captured into the vault as a capsule. */
    captureChat: (title: string, markdown: string) => Promise<{ ok: boolean; answer: string }>
  }
  /** Whether the browser extension can reach this app, and where. */
  extension: {
    export: (destination: 'downloads' | 'choose') => Promise<{ ok: boolean; answer: string; path?: string }>
    publishAppearance?: (value: import('@shared/lib/extensionAppearance').ExtensionAppearance) => Promise<{ ok: boolean }>
    status: () => Promise<{ ok: boolean; listening: boolean; port: number; url: string; error: string }>
  }
  /**
   * Online providers. In the desktop app these are questions for the main
   * process, which holds the keys; the interface is never handed one.
   */
  cloud: {
    /** The providers and whether a key is saved for each. Never the key. */
    providers: () => Promise<CloudView>
    /** Every model the saved keys can reach, with each provider's own problem. */
    models: () => Promise<CloudModelsAnswer>
    saveKey: (id: string, key: string) => Promise<CloudView>
    clearKey: (id: string) => Promise<CloudView>
    test: (id: string) => Promise<CloudTestAnswer>
  }
  /** The artifact library: the record of everything the app has made. */
  quick: {
    open: () => Promise<{ ok: boolean }>
    shortcut: (enabled: boolean) => Promise<{ ok: boolean; enabled: boolean }>
  }

  artifactWindow: {
    popout: (html: string, title: string) => Promise<{ ok: boolean }>
    savePdf: (html: string, name: string) => Promise<{ ok: boolean; answer: string }>
  }

  artifacts: {
    trashList: () => Promise<{ ok: boolean; items: import('../../../main/artifacts/store').TrashItem[]; error?: string }>
    trashRestore: (key: string) => Promise<ItemAnswer>
    list: () => Promise<ListAnswer>
    read: (id: string, version?: number) => Promise<ReadAnswer>
    save: (input: SaveInput) => Promise<ItemAnswer>
    rename: (id: string, title: string) => Promise<ItemAnswer>
    duplicate: (id: string) => Promise<ItemAnswer>
    restore: (id: string, version: number) => Promise<ItemAnswer>
    remove: (id: string) => Promise<RemoveAnswer>
    adopt: (records: AdoptInput[]) => Promise<{ ok: true; adopted: number; skipped: number; refused: number }>
    import: () => Promise<{ ok: boolean; item?: unknown; error?: string; canceled?: boolean }>
  }
}

declare global {
  interface Window {
    api?: DesktopBridge
  }
}

/**
 * True when the app is running inside the desktop shell. The interface uses this
 * to decide whether to offer things that need the machine at all.
 */
export const hasDesktopBridge = (): boolean =>
  typeof window !== 'undefined' && typeof window.api === 'object' && window.api !== null

/**
 * True when the local Brain Window server is behind the page: the same built
 * renderer, a real brain folder, no desktop shell. The host marks the page by
 * setting one flag before any application code runs.
 */
export const hasBrainHost = (): boolean =>
  typeof window !== 'undefined' && (window as unknown as { __ODDBRAIN_BRAIN_HOST__?: boolean }).__ODDBRAIN_BRAIN_HOST__ === true

/** Empty, and honest about it. See rule 2 above. */
let demoAutomationPreferences = { ...DEFAULT_AUTOMATION }
try { if (typeof localStorage !== 'undefined') demoAutomationPreferences = normalizeAutomation(JSON.parse(localStorage.getItem('oddbrain.automation-preview') || 'null')) } catch {}
const demoAutomationListeners = new Set<(view: AutomationView) => void>()
const demoAutomationView = (): AutomationView => ({ preferences: { ...demoAutomationPreferences }, current: null, reports: [], queued: 0, desktop: false })
const demoAutomation: AutomationBridge = {
  history: async () => ({ records: [], next: '', notice: 'Saved native review history is available in the desktop app.' }),
  saved: async () => { throw Error('Saved reviews require the desktop app.') },
  read: async () => demoAutomationView(),
  update: async patch => { demoAutomationPreferences = normalizeAutomation({ ...demoAutomationPreferences, ...patch }); try { localStorage.setItem('oddbrain.automation-preview', JSON.stringify(demoAutomationPreferences)) } catch {} const view = demoAutomationView(); for (const notify of demoAutomationListeners) notify(view); return { ok: true, view } },
  models: async () => ({ ok: false, models: [], error: 'Reviewer models are listed by the installed app.' }),
  review: async () => ({ ok: false, error: 'Report-only review uses the installed app and its model service. No review was sent from this preview.' }),
  cancel: async () => ({ ok: true }),
  onChanged: listener => { demoAutomationListeners.add(listener); return () => demoAutomationListeners.delete(listener) },
}
let previewMedia = { ...DEFAULT_MEDIA }
const unavailableMarket = async () => ({ ok: false as const, error: 'Marketplaces require the installed desktop app.' })
const demoBridge: DesktopBridge = {
  chats: {
    read: async () => ({ ok: false, error: 'Main-process conversation storage requires the installed app.' }),
    migrate: async () => ({ ok: false, error: 'Main-process conversation storage requires the installed app.' }),
    write: async () => ({ ok: false, error: 'Main-process conversation storage requires the installed app.' }),
    exportRecovery: async () => ({ ok: false, answer: 'Chat recovery export requires the installed app.' }),
    importRecovery: async () => ({ ok: false, answer: 'Chat recovery import requires the installed app.' }),
    openLocation: async () => ({ ok: false, answer: 'Chat storage folders require the installed app.' }),
  },
  appData: {
    backup: async () => ({ ok: false, answer: 'App-data backup requires the installed app.' }),
    completeMemoryBackup: async () => ({ ok: false, answer: 'Complete Memory Backup requires the installed app.' }),
  },
  workingNotes: {
    read: async () => ({ ok: false, current: null, revisions: [], answer: 'Working Notes storage requires the installed app.' }),
    save: async () => ({ ok: false, current: null, revisions: [], answer: 'Working Notes storage requires the installed app.' }),
    rejectProposal: async () => ({ ok: false, current: null, revisions: [], answer: 'Working Notes storage requires the installed app.' }),
    migrate: async () => ({ ok: false, current: null, revisions: [], answer: 'Working Notes storage requires the installed app.' }),
    fork: async () => ({ ok: false, current: null, revisions: [], answer: 'Working Notes branching requires the installed app.' }),
    exportRecovery: async () => ({ ok: false, answer: 'Working Notes recovery export requires the installed app.' }),
    importRecovery: async () => ({ ok: false, current: null, revisions: [], answer: 'Working Notes recovery import requires the installed app.' }),
  },
  media: {
    authorizeRecording: async () => ({ ok: false, name: 'Microphone', error: 'Provider recording requires the desktop app.' }), onCancelled: () => () => {},
    read: async () => ({ ...previewMedia }), update: async patch => (previewMedia = { ...previewMedia, ...patch, ffmpeg: '', ocrAdapter: '', ocrAdapterSha256: '', ocrAdapterLabel: '' }),
    chooseDecoder: async () => ({ ...previewMedia }), chooseOcrAdapter: async () => ({ ...previewMedia }),
    decode: async input => ({ ok: false, name: input.name, error: 'Native decoding and provider uploads require the desktop app. No file was sent.' }),
    decodeFile: async (_file, input) => ({ ok: false, name: input.name, error: 'Streamed selected-file processing requires the desktop app. No file was sent.' }),
    releaseSource: async () => {},
    dictate: async () => ({ ok: false, name: 'Dictation', error: 'Offline Windows dictation requires the desktop app.' }), cancel: async () => {},
  },
  videoStudio: {
    read: async () => ({ preferences: { ...DEFAULT_VIDEO_STUDIO }, kdenliveVersion: '', kdenliveReady: false, mcpConnected: false, mcpTools: [], nativeKdenlive: { compatible: false, identity: 'Not connected', protocol: '', referenceCommit: '', missingTools: [], reason: 'Native Kdenlive MCP requires the desktop app.' }, aiToolsUrl: '', projectReady: false, hasMcpToken: false, hasPixabayKey: false, keyEncryption: 'none', notice: 'Video Studio connections require the desktop app.' }),
    update: async () => ({ preferences: { ...DEFAULT_VIDEO_STUDIO }, kdenliveVersion: '', kdenliveReady: false, mcpConnected: false, mcpTools: [], nativeKdenlive: { compatible: false, identity: 'Not connected', protocol: '', referenceCommit: '', missingTools: [], reason: 'Native Kdenlive MCP requires the desktop app.' }, aiToolsUrl: '', projectReady: false, hasMcpToken: false, hasPixabayKey: false, keyEncryption: 'none', notice: 'Video settings require the desktop app.' }),
    chooseKdenlive: async () => ({ preferences: { ...DEFAULT_VIDEO_STUDIO }, kdenliveVersion: '', kdenliveReady: false, mcpConnected: false, mcpTools: [], nativeKdenlive: { compatible: false, identity: 'Not connected', protocol: '', referenceCommit: '', missingTools: [], reason: 'Native Kdenlive MCP requires the desktop app.' }, aiToolsUrl: '', projectReady: false, hasMcpToken: false, hasPixabayKey: false, keyEncryption: 'none', notice: 'Choosing Kdenlive requires the desktop app.' }),
    chooseProjectFolder: async () => ({ preferences: { ...DEFAULT_VIDEO_STUDIO }, kdenliveVersion: '', kdenliveReady: false, mcpConnected: false, mcpTools: [], nativeKdenlive: { compatible: false, identity: 'Not connected', protocol: '', referenceCommit: '', missingTools: [], reason: 'Native Kdenlive MCP requires the desktop app.' }, aiToolsUrl: '', projectReady: false, hasMcpToken: false, hasPixabayKey: false, keyEncryption: 'none', notice: 'Choosing a project folder requires the desktop app.' }),
    chooseYtDlp: async () => ({ preferences: { ...DEFAULT_VIDEO_STUDIO }, kdenliveVersion: '', kdenliveReady: false, mcpConnected: false, mcpTools: [], nativeKdenlive: { compatible: false, identity: 'Not connected', protocol: '', referenceCommit: '', missingTools: [], reason: 'Native Kdenlive MCP requires the desktop app.' }, aiToolsUrl: '', projectReady: false, hasMcpToken: false, hasPixabayKey: false, keyEncryption: 'none', notice: 'Choosing yt-dlp requires the desktop app.' }),
    saveSecret: async () => { throw Error('Credential storage requires the desktop app.') }, clearSecret: async () => { throw Error('Credential storage requires the desktop app.') },
    testKdenlive: async () => ({ preferences: { ...DEFAULT_VIDEO_STUDIO }, kdenliveVersion: '', kdenliveReady: false, mcpConnected: false, mcpTools: [], nativeKdenlive: { compatible: false, identity: 'Not connected', protocol: '', referenceCommit: '', missingTools: [], reason: 'Native Kdenlive MCP requires the desktop app.' }, aiToolsUrl: '', projectReady: false, hasMcpToken: false, hasPixabayKey: false, keyEncryption: 'none', notice: 'Kdenlive testing requires the desktop app.' }),
    openKdenlive: async () => ({ ok: false, answer: 'Opening Kdenlive requires the desktop app.' }),
    search: async () => ({ ok: false, assets: [], problems: ['Live Creative Library search requires the desktop app.'], notice: 'Nothing was searched.' }),
    preview: async token => ({ ok: false, token, error: 'Live previews require the desktop app.' }),
    prepareAsset: async () => ({ ok: false, error: 'Asset review requires the desktop app.' }), decideAsset: async () => ({ ok: false, answer: 'Asset installation requires the desktop app.' }),
    chooseLocalVideo: async () => ({ ok: false, name: '', bytes: 0, ocrAvailable: false, consequence: '', error: 'Local Video Studio intake requires the desktop app.' }),
    decideLocalVideo: async () => ({ ok: false, answer: 'Local Video Studio intake requires the desktop app.' }),
    preflightUrl: async url => ({ ok: false, url, provider: 'unknown', title: '', method: 'none', warnings: [], consequence: '', error: 'Video-link inspection requires the desktop app.' }), acquireUrl: async () => ({ ok: false, answer: 'Video acquisition requires the desktop app.' }),
    workspace: async () => ({ evidence: [], proposedPlan: null, creativeProposal: null, project: null, history: [], notice: 'Video workspace requires the desktop app.' }),
    captureKdenliveFrame: async position => ({ ok: false, position, error: 'Kdenlive frame capture requires the desktop app.' }),
    prepareKdenliveRender: async () => ({ ok: false, error: 'Kdenlive rendering requires the desktop app.' }),
    decideKdenliveRender: async () => ({ ok: false, answer: 'Kdenlive rendering requires the desktop app.' }),
    kdenliveRenderStatus: async () => ({ ok: false, jobs: [], answer: 'Kdenlive render status requires the desktop app.' }),
    prepareKdenlivePreviewInspection: async () => ({ ok: false, error: 'Preview inspection requires the desktop app.' }),
    decideKdenlivePreviewInspection: async () => ({ ok: false, answer: 'Preview inspection requires the desktop app.' }),
    expandEvidence: async () => ({ ok: false, answer: 'Question-driven evidence retrieval requires the desktop app.' }),
    readEvidenceFrame: async (id, at) => ({ ok: false, sourceId: id, at, error: 'Retained video frames require the desktop app.' }),
    retryEvidence: async () => ({ ok: false, answer: 'Durable video retries require the desktop app.' }),
    confirmEvidenceDescription: async () => ({ ok: false, answer: 'Evidence confirmation requires the desktop app.' }),
    prepareEditPlan: async () => ({ ok: false, error: 'Kdenlive plan review requires the desktop app.' }), decideEditPlan: async () => ({ ok: false, answer: 'Kdenlive plan review requires the desktop app.' }),
    prepareKdenliveAction: async () => ({ ok: false, error: 'Kdenlive actions require the desktop app.' }), decideKdenliveAction: async () => ({ ok: false, answer: 'Kdenlive actions require the desktop app.' }), stop: async () => ({ ok: true, answer: 'No desktop video transfer is running.' }),
    prepareDesignKit: async () => ({ ok: false, error: 'Local design-kit creation requires the desktop app.' }), decideDesignKit: async () => ({ ok: false, answer: 'Local design-kit creation requires the desktop app.' }),
  },
  transcripts: { raw: async () => ({ ok: false as const, error: 'Original transcripts require the desktop app.' }), image: async () => ({ ok: false as const, error: 'Retained transcript images require the desktop app.' }), list: async () => ({ ok: false, error: 'Native transcripts require the desktop app. Sample chats remain separate.' }), read: async () => ({ ok: false, error: 'Native transcripts require the desktop app.' }) },
  marketplace: { inspect: unavailableMarket, sources: async () => [], browse: unavailableMarket, probe: unavailableMarket, installed: unavailableMarket, plan: unavailableMarket, confirm: unavailableMarket, cancel: async () => {} },
  automation: demoAutomation,
  memoryWorkspace: demoMemoryWorkspace,
  memoryOb: {
    read: async () => ({ ok: false, error: 'Memory_OB requires the desktop app.' }),
    project: async () => ({ ok: false, error: 'Project memory requires the desktop app.' }),
    search: async () => ({ ok: false, error: 'Memory_OB search requires the desktop app.' }),
    goosePreview: async () => ({ ok: false, answer: 'Goose adapter setup requires the desktop app.' }),
    gooseDecide: async () => ({ ok: false, answer: 'Goose adapter setup requires the desktop app.' }),
  },
  processing: {
    read: async () => ({ ok: false, error: 'Durable processing jobs require the installed app.' }),
    resume: async () => ({ ok: false, error: 'Durable processing jobs require the installed app.' }),
    setLimits: async () => ({ ok: false, error: 'Durable processing budgets require the installed app.' }),
  },
  attachmentCenter: {
    read: async () => ({ ok: false, error: 'The Attachment Center requires the installed app.' }),
    previewDelete: async () => ({ ok: false, error: 'Private-copy deletion requires the installed app.' }),
    confirmDelete: async () => ({ ok: false, error: 'Private-copy deletion requires the installed app.' }),
  },
  folderAccess: {
    read: async () => ({ ok: false, error: 'Folder Access requires the installed app.' }),
    choose: async () => ({ ok: false, error: 'Folder Access requires the installed app.' }),
    revoke: async () => ({ ok: false, error: 'Folder Access requires the installed app.' }),
    list: async () => ({ ok: false, error: 'Folder Access requires the installed app.' }),
  },
  extensionPair: {
    get: async () => ({ token: '' }),
    rotate: async () => ({ ok: false, token: '' }),
  },
  quick: {
    open: () => Promise.resolve({ ok: false }),
    shortcut: () => Promise.resolve({ ok: false, enabled: false }),
  },
  artifactWindow: {
    popout: () => Promise.resolve({ ok: false }),
    savePdf: () => Promise.resolve({ ok: false, answer: 'Windows and PDFs are desktop work — this browser preview has no machine behind it.' }),
  },

  app: { version: 'web preview', platform: 'web' },
  settings: {
    read: async () => ({
      vaultPath: '',
      cloud: { baseUrl: '', model: '' },
      // No machine behind this window: nothing is granted, and saying otherwise
      // would be a switch that governs nothing.
      permissions: { ...DEFAULT_PERMISSIONS, browserCapture: false, keepConversations: false },
    }),
    update: async () => ({
      ok: false,
      error: 'Settings are part of the desktop app. This window is the interface only, so there is no folder to change.',
    }),
  },
  skills: {
    planCatalog: async () => { throw Error('Package installation review requires the desktop app.') },
    decideCatalog: async () => ({ ok: false, answer: 'Package installation requires the desktop app.' }),
    cancelCatalog: async () => {},
    inventory: async () => ({ entries: [], notices: ['Installed skill files are available in the desktop app, not this preview.'] }),
    inspectInstalled: async () => { throw Error('Inspect installed files in the desktop app.') },
    previewCreate: async () => { throw Error('Creating native skill files requires the desktop app. Nothing was written.') },
    decideCreate: async () => ({ ok: false, answer: 'Native skill files require the desktop app.' }),
    installCatalog: async () => ({ ok: false, answer: 'Installing skills needs the desktop app.' }),
    scan: async () => [],
  },
  mods: {
    installFromFile: async () => ({ ok: false, answer: 'Installing packs needs the desktop app — it is the one that talks to the engines.' }),
    list: async () => [],
    remove: async () => ({ ok: false, answer: 'Removing packs needs the desktop app.' }),
    indexAdd: async () => ({ ok: false, answer: 'Pack indexes need the desktop app.' }),
    indexList: async () => [],
    indexRemove: async () => ({ ok: false }),
    indexBrowse: async () => ({ ok: false, problem: 'Browsing a pack index needs the desktop app.' }),
    indexInstall: async () => ({ ok: false, answer: 'Installing from an index needs the desktop app.' }),
    exportPack: async () => ({ ok: false, answer: 'Exporting a pack needs the desktop app.' }),
    installStarter: async () => ({ ok: false, answer: 'Installing the starter pack needs the desktop app.' }),
    communityIndex: async () => ({ ok: false }),
  },
  mcp: {
    preview: async () => { throw Error('Native connector review requires the desktop app.') },
    decide: async () => ({ ok: false, answer: 'Native connector review requires the desktop app.' }),
    inventory: async () => ({ files: [], notices: ['Native configuration inspection requires the desktop app.'] }),
    read: async () => ({ servers: [], problem: '' }),
    write: async () => ({ ok: false, written: [], answer: 'Tool servers are written by the installed app.' }),
  },
  structure: {
    inspect: async () => ({ ok: false, error: 'Inspecting a structure needs the desktop app.' }),
    apply: async () => ({ ok: false, error: 'Writing a structure needs the desktop app.' }),
    resolve: async () => ({ ok: false, error: 'Settling a conflict needs the desktop app.' }),
    linkCheck: async () => ({ files: 0, checked: 0, dead: [], ambiguous: [], edges: [], error: 'The link check needs the desktop app.' }),
  },
  vault: { backup: async () => ({ ok: false, answer: 'Backup and restore require the desktop app. No files were copied.' }), chooseFolder: async () => null, useDefault: async () => ({ ok: false, error: 'Choosing the default vault needs the desktop app.' }), saveHandoff: async () => ({ ok: false, answer: 'Writing a handoff needs the desktop app.' }), exportCopy: async () => ({ ok: false, answer: 'Exporting needs the desktop app.' }), captureChat: async () => ({ ok: false, answer: 'Capturing needs the desktop app.' }) },
  // No socket is open here, and none can be: this is a page, not the app.
  extension: { export: async () => ({ ok: false, answer: 'Open the desktop app to export the bundled extension. No files were created.' }),
    status: async () => ({
      ok: false,
      listening: false,
      port: 8765,
      url: 'http://127.0.0.1:8765',
      error: 'The port the browser extension posts to belongs to the desktop app, not to this window.',
    }),
  },
  /**
   * No disk, no library. Every answer says that rather than showing an empty
   * grid that implies nothing was ever made.
   */
artifacts: {
    trashList: async () => ({ ok: false, items: [], error: 'Trash recovery uses the installed app’s library.' }),
    trashRestore: async () => ({ ok: false, error: 'Trash recovery uses the installed app’s library.' }),
    list: async (): Promise<ListAnswer> => ({
      ok: false,
      error: 'The artifact library is part of the desktop app: this window has no folder to keep documents in.',
    }),
    read: async (): Promise<ReadAnswer> => ({
      ok: false,
      error: 'The artifact library is part of the desktop app: this window has no folder to keep documents in.',
    }),
    save: async (): Promise<ItemAnswer> => ({
      ok: false,
      error: 'Documents are saved by the desktop app, which has somewhere to put them.',
    }),
    rename: async (): Promise<ItemAnswer> => ({ ok: false, error: 'There is no library in this window to rename in.' }),
    duplicate: async (): Promise<ItemAnswer> => ({ ok: false, error: 'There is no library in this window to copy in.' }),
    restore: async (): Promise<ItemAnswer> => ({ ok: false, error: 'There is no library in this window to restore in.' }),
    remove: async (): Promise<RemoveAnswer> => ({ ok: false, error: 'There is no library in this window to take anything out of.' }),
    adopt: async () => ({ ok: true as const, adopted: 0, skipped: 0, refused: 0 }),
    import: async () => ({ ok: false, error: 'Importing needs the desktop app: the file picker belongs to it.', canceled: false }),
  },
  /**
   * No keychain, no main process, no key: every answer says that rather than
   * pretending a provider was reached.
   */
  cloud: {
    providers: async (): Promise<CloudView> => ({
      ok: false,
      error: 'Keys are kept by the machine’s own keychain, in the desktop app.',
      encryption: 'none',
      providers: [],
    }),
    models: async (): Promise<CloudModelsAnswer> => ({
      ok: false,
      error: 'There is no main process behind this window, so no provider can be asked for its models.',
      models: [],
      problems: [],
    }),
    saveKey: async (): Promise<CloudView> => ({
      ok: false,
      error: 'A key is kept by the desktop app, where the keychain is.',
      encryption: 'none',
      providers: [],
    }),
    clearKey: async (): Promise<CloudView> => ({
      ok: false,
      error: 'There is no saved key in this window.',
      encryption: 'none',
      providers: [],
    }),
    test: async (): Promise<CloudTestAnswer> => ({
      ok: false,
      error: 'Testing a key needs the desktop app: this window is the interface only.',
    }),
  },
  houseRules: {
    previewGlobal: async () => { throw Error('Native rule files require the desktop app.') },
    previewProject: async () => { throw Error('Native rule files require the desktop app.') },
    decide: async () => ({ ok: false, answer: 'Native rule files require the desktop app.' }),
    read: async () => ({ rules: { ...DEFAULT_HOUSE_RULES }, defaults: { ...DEFAULT_HOUSE_RULES } }),
    write: async () => ({
      ok: false,
      written: [],
    }),
  },
  workflows: { list: async () => ({ items: [], next: '', notice: 'Workflow files require the desktop app.' }), save: async () => { throw Error('Saving workflows requires the desktop app.') }, archive: async () => { throw Error('Workflow files require the desktop app.') }, preview: async () => { throw Error('Workflow execution requires the desktop app.') }, decide: async () => { throw Error('Workflow execution requires the desktop app.') }, cancel: async () => ({ requested: false, answer: 'No workflow runs in this preview.' }), runs: async () => ({ records: [], next: '', notice: 'Workflow history requires the desktop app.' }), readRun: async () => { throw Error('Workflow history requires the desktop app.') } },
  schedules: { list: async () => ({ items: [], notice: 'Schedules require the running desktop app and OS-protected approval storage.' }), preview: async () => { throw Error('Recurring command approval requires the desktop app.') }, decide: async () => { throw Error('Schedules cannot run in a browser preview.') }, pause: async () => { throw Error('Schedules require the desktop app.') }, inbox: async () => ({ items: [], next: '', notice: 'The scheduled-work inbox requires the desktop app.' }), acknowledge: async () => { throw Error('The scheduled-work inbox requires the desktop app.') } },
  commands: { saved: async () => ({ items: [], next: '', notice: 'Saved OS commands require the desktop app.' }), save: async () => { throw Error('Saving OS commands requires the desktop app.') }, archiveSaved: async () => { throw Error('Saved OS commands require the desktop app.') }, previewSaved: async () => { throw Error('Saved OS commands require the desktop app.') }, context: async () => ({ cwd: '', allowed: false, explanation: 'OS command execution requires the desktop app. This browser preview cannot run commands.', activeId: null }), preview: async () => { throw Error('OS command execution requires the desktop app. Nothing was run.') }, decide: async () => { throw Error('OS command execution requires the desktop app.') }, cancel: async () => ({ requested: false, answer: 'No app command is running in this preview.' }), history: async () => ({ records: [], next: '', notice: 'Command records are available in the desktop app.' }), read: async () => { throw Error('Command records require the desktop app.') }, output: async () => { throw Error('Command output requires the desktop app.') } },
  projects: {
    attach: async () => { throw Error('Choose project references in the desktop app. Nothing was read.') },
    read: async () => [],
    write: async (projects: Project[]) => ({ ok: false, projects }),
    blank: async (name: string) => newProject(name),
  },
  engine: {
    queue: { read: async () => [], hold: async () => {}, enqueue: async () => { throw Error('A durable work queue requires the desktop app. Your draft was not queued.') }, resume: async () => { throw Error('Saved tasks require the desktop app.') }, cancel: async () => { throw Error('Saved tasks require the desktop app.') }, history: async () => ({ items: [], next: '' }) },
    contextTarget: async () => ({ workspace: '', route: '', resume: false }),
    chatSessions: async () => [],
    setWorkspace: async () => ({ ok: false, answer: 'Choosing a workspace needs the desktop app.' }),
    sessions: async () => [],
    boardRead: async () => ({ continuing: {}, done: [] }),
    boardWrite: async () => ({ ok: false }),
    pickFiles: async () => [],
    forgetSession: async () => ({ ok: false }),
    openFolder: async () => ({ ok: false }),
    checkpoints: {
      preview: async () => { throw Error('Reviewed restores require the desktop app. No files were changed.') },
      decide: async () => ({ ok: false, answer: 'Reviewed restores require the desktop app.' }),
      inspect: async () => ({ ok: false, answer: 'Snapshots live in the installed app.' }),
      list: async () => ({ ok: true, checkpoints: [] }),
      restore: async () => ({ ok: false, answer: 'Checkpoints live in the desktop app.' }),
    },
  },
}

export const bridge: DesktopBridge = hasDesktopBridge() ? (window.api as DesktopBridge) : hasBrainHost() ? createBrainHostBridge(demoBridge) : demoBridge

/**
 * The engine bridge, exactly as the preload exposes it. The browser preview has
 * no engine — there is no machine behind the window — so its answers are honest
 * refusals, the same rule every other demo answer here follows.
 */
export type EngineBridge = {
  read: () => Promise<{ engine: EngineSettings; running: boolean; history: EngineEvent[]; lastSequence?: number; active?: { transcriptId: string; chatId?: string; prompt: string }; busy?: boolean }>
  pick: (id: EngineId) => Promise<{ ok: boolean; answer: string }>
  models: () => Promise<{ ok: boolean; models: EngineModelEntry[]; error?: string }>
  detect: (fresh?: boolean) => Promise<EngineAvailability[]>
  /** Point the app at the exe yourself (Connectors). */
  pickBinary: (id: 'claude-code' | 'agy') => Promise<{ ok: boolean; answer: string; path?: string }>
  clearBinary: (id: 'claude-code' | 'agy') => Promise<{ ok: boolean; answer: string }>
  binaryOverride: (id: 'claude-code' | 'agy') => Promise<{ path: string }>
  /** The engine's own sign-in state, asked from its CLI. */
  authStatus: (id?: 'claude-code' | 'agy') => Promise<{ ok: boolean; loggedIn: boolean; method: string; provider: string; answer: string }>
  /** Open the engine's own login in a terminal; nothing is read back. */
  openLogin: () => Promise<{ ok: boolean; answer: string }>
  restart: () => Promise<{ ok: boolean; answer: string }>
  /** The Ollama answering on the door, and whether it can serve Claude Code. */
  ollamaVersion: () => Promise<{ ok: boolean; version: string; compatible: boolean; answer: string }>
  pull: (name: string) => Promise<{ ok: boolean; answer: string }>
  deleteModel: (name: string) => Promise<{ ok: boolean; answer: string }>
  /** Pull progress ticks; returns the unsubscribe. */
  onPullEvent: (listener: (tick: unknown) => void) => () => void
  readHouseRules: () => Promise<{ rules: HouseRules; defaults: HouseRules }>
  writeHouseRules: (rules: HouseRules) => Promise<{ ok: boolean; written: string[] }>
  setModel: (model: string, provider?: 'anthropic' | 'native', expectedEngine?: EngineId) => Promise<{ ok: boolean; answer: string }>
  setApproval: (mode: ApprovalMode) => Promise<{ ok: boolean; answer: string }>
  capabilities: () => Promise<EngineCapabilityReport>
  setThinking: (mode: ThinkingMode, target: string) => Promise<{ ok: boolean; answer: string }>
  memory: {
    chooseFolder?: () => Promise<{ ok: boolean; answer: string; folder?: string; canceled?: boolean }>
    defaultFolder?: () => Promise<{ ok: boolean; answer: string }>
    list: () => Promise<{ ok: boolean; answer?: string; folder?: string; files?: Array<{ name: string; path: string; updated: string; content: string; clipped: boolean }> }>
    listTrash: () => Promise<{ ok: boolean; answer?: string; folder?: string; files?: Array<{ id: string; name: string; path: string; trashedAt: string; updated: string; content: string; clipped: boolean }> }>
    remove: (name: string, expectedFolder?: string) => Promise<{ ok: boolean; answer: string }>
    restore: (id: string, expectedFolder?: string) => Promise<{ ok: boolean; answer: string }>
  }
  journal: {
    list: () => Promise<{ ok: boolean; entries: Array<{ at: string; prompt: string; answer: string; sessionId: string | null; usage: string; workspace: string }> }>
    append: (entry: { at: string; prompt: string; answer: string; sessionId: string | null; usage: string; workspace: string }) => Promise<{ ok: boolean; answer: string }>
    clear: () => Promise<{ ok: boolean; answer: string }>
  }
  pickWorkspace: () => Promise<{ ok: boolean; answer: string }>
  send: (prompt: string, cwd: string, pictures?: Array<{ mime: string; data: string }>, conversation?: NativeConversation, queuedId?: string, originalFiles?: EngineSourceFile[]) => Promise<{ ok: boolean; answer: string; transcriptId?: string }>
  checkpoints: {
    preview: (copy: string, original: string) => Promise<FileReview>
    decide: (token: string, decision: 'allow' | 'deny') => Promise<FileDecision>
    list: () => Promise<{ ok: boolean; checkpoints: Array<{ copy: string; original: string; at: string }> }>
    restore: (copy: string, original?: string) => Promise<{ ok: boolean; answer: string }>
  }
  watch: {
    start: (folder: string) => Promise<{ ok: boolean; answer: string }>
    stop: () => Promise<{ ok: boolean; answer: string }>
    status: () => Promise<{ folder: string; active: boolean }>
    onEvent: (listener: (tick: { folder: string; names: string[]; at: number }) => void) => () => void
  }
  hooks: {
    list: () => Promise<{ ok: boolean; hooks: Array<{ id: string; name: string; event: string; command: string }> }>
    save: (hook: unknown) => Promise<{ ok: boolean; answer: string }>
    remove: (id: string) => Promise<{ ok: boolean; answer: string }>
    test: (command: string) => Promise<{ ok: boolean; answer: string }>
  }
  battle: {
    record: (entry: { prompt: string; winner: string; loser: string; tie: boolean; blind: boolean }) => Promise<{ ok: boolean; answer: string }>
    ledger: () => Promise<{ ok: boolean; entries: Array<{ prompt: string; winner: string; loser: string; tie: boolean; at: string }> }>
  }
  repoMap: () => Promise<{ ok: boolean; answer?: string; map?: string; files?: number; dirs?: number; truncated?: boolean; root?: string }>
  compact: {
    save: (input: { brief: string; workspace: string; at: string }) => Promise<{ ok: boolean; answer: string; file?: string }>
  }
  fresh: () => Promise<{ ok: boolean; answer: string }>
  recipes: {
    list: () => Promise<{ ok: boolean; recipes: Recipe[]; broken: Array<{ file: string; answer: string }> }>
    save: (recipe: unknown) => Promise<{ ok: boolean; answer: string }>
    remove: (name: string) => Promise<{ ok: boolean; answer: string }>
  }
  downloads: {
    start: (engine: string) => Promise<{ ok: boolean; answer: string }>
    status: () => Promise<Record<string, { engine: string; endpoint: string; sha256: string; at: string } | undefined>>
    run: (engine: string) => Promise<{ ok: boolean; answer: string; command?: string[] }>
    execute: (engine: string) => Promise<{ ok: boolean; answer: string }>
    remove: (engine: string) => Promise<{ ok: boolean; answer: string }>
    serveStart: () => Promise<{ ok: boolean; answer: string }>
    serveStop: () => Promise<{ ok: boolean; answer: string }>
    serveStatus: () => Promise<{ ok: boolean; answer: string; running: boolean }>
    onEvent: (listener: (tick: { engine: string; got: number; total: number | null; phase: string; answer?: string }) => void) => () => void
  }
  extensionPair: {
    get: () => Promise<{ token: string }>
    rotate: () => Promise<{ ok: boolean; token: string }>
  }
  readTrust: ReadTrustBridge
  answer: (requestId: string, allow: boolean) => Promise<{ ok: boolean }>
  stop: () => Promise<{ ok: boolean; answer?: string }>
  onEvent: (listener: (event: EngineEvent) => void) => () => void
}

const demoEngineBridge: EngineBridge = {
  read: async () => ({ engine: { ...DEFAULT_ENGINE }, running: false, history: [] }),
  pick: async () => ({ ok: false, answer: 'Engines are chosen in the desktop app.' }),
  models: async () => ({
    ok: false,
    models: [],
    error: 'Engine brains are listed in the desktop app: this window is the interface only.',
  }),
  detect: async () => [],
  pickBinary: async () => ({ ok: false, answer: 'Pointing at a binary needs the desktop app.' }),
  clearBinary: async () => ({ ok: false, answer: 'The desktop app manages the binary override.' }),
  binaryOverride: async () => ({ path: '' }),
  authStatus: async () => ({ ok: false, loggedIn: false, method: '', provider: '', answer: 'Sign-in is checked by the installed app.' }),
  restart: async () => ({ ok: false, answer: 'Connection restart requires the desktop app. No process was restarted.' }),
  openLogin: async () => ({ ok: false, answer: 'Signing in needs the installed app.' }),
  ollamaVersion: async () => ({ ok: false, version: '', compatible: false, answer: 'The installed app checks the local runtime.' }),
  pull: async () => ({ ok: false, answer: 'Pulling brains needs the desktop app.' }),
  deleteModel: async () => ({ ok: false, answer: 'Removing brains needs the desktop app.' }),
  onPullEvent: () => () => undefined,
  readHouseRules: async () => ({ rules: { ...DEFAULT_HOUSE_RULES }, defaults: { ...DEFAULT_HOUSE_RULES } }),
  writeHouseRules: async () => ({
    ok: false,
    written: [],
  }),
  setModel: async () => ({ ok: false, answer: 'Brains are chosen in the desktop app.' }),
  setApproval: async () => ({ ok: false, answer: 'The throttle lives in the desktop app.' }),
  pickWorkspace: async () => ({
    ok: false,
    answer: 'Choosing a folder needs the desktop app: this window is the interface only.',
  }),
  send: async () => ({
    ok: false,
    answer: 'The engine works in the desktop app: this window is the interface only.',
  }),
  readTrust: {
    list: async () => ({ ok: false, error: 'Read approvals are enforced by the installed app.' }),
    approve: async () => ({ ok: false, answer: 'Read approvals require the installed app.' }),
    revoke: async () => ({ ok: false, answer: 'Read approvals require the installed app.' }),
    migrateLegacy: async () => ({ ok: false, answer: 'Read approvals require the installed app.' }),
    onChanged: () => () => undefined,
  },
  answer: async () => ({ ok: false }),
  capabilities: async () => unverifiedCapabilities(DEFAULT_ENGINE, 'Model capabilities need the desktop app. No engine is connected in this preview.'),
  setThinking: async () => ({ ok: false, answer: 'Thinking lives in the desktop app.' }),
  memory: {
    chooseFolder: async () => ({ ok: false, answer: 'Choosing a memory folder uses the installed app.' }),
    defaultFolder: async () => ({ ok: false, answer: 'Memory locations are saved by the installed app.' }),
    list: async () => ({ ok: true, files: [] }),
    listTrash: async () => ({ ok: true, files: [] }),
    remove: async () => ({ ok: false, answer: 'Memories live in the desktop app.' }),
    restore: async () => ({ ok: false, answer: 'Recoverable memories live in the desktop app.' }),
  },
  journal: {
    list: async () => ({ ok: true, entries: [] }),
    append: async () => ({ ok: false, answer: 'The record lives in the desktop app.' }),
    clear: async () => ({ ok: false, answer: 'The record lives in the desktop app.' }),
  },
  checkpoints: {
    preview: async () => { throw Error('Reviewed restores require the desktop app. No files were changed.') },
    decide: async () => ({ ok: false, answer: 'Reviewed restores require the desktop app.' }),
    list: async () => ({ ok: true, checkpoints: [] }),
    restore: async () => ({ ok: false, answer: 'Checkpoints live in the desktop app.' }),
  },
  watch: {
    start: async () => ({ ok: false, answer: 'Watching lives in the desktop app.' }),
    stop: async () => ({ ok: false, answer: 'Watching lives in the desktop app.' }),
    status: async () => ({ folder: '', active: false }),
    onEvent: () => () => undefined,
  },
  hooks: {
    list: async () => ({ ok: true, hooks: [] }),
    save: async () => ({ ok: false, answer: 'Hooks live in the desktop app.' }),
    remove: async () => ({ ok: false, answer: 'Hooks live in the desktop app.' }),
    test: async () => ({ ok: false, answer: 'Hooks run in the desktop app.' }),
  },
  battle: {
    record: async () => ({ ok: false, answer: 'The tally lives in the desktop app.' }),
    ledger: async () => ({ ok: true, entries: [] }),
  },
  repoMap: async () => ({ ok: false, answer: 'The map is drawn in the desktop app.' }),
  compact: {
    save: async () => ({ ok: false, answer: 'Briefs live in the desktop app.' }),
  },
  fresh: async () => ({ ok: false, answer: 'Sessions live in the desktop app.' }),
  recipes: {
    list: async () => ({ ok: true, recipes: [], broken: [] }),
    save: async () => ({ ok: false, answer: 'Recipes live in the desktop app.' }),
    remove: async () => ({ ok: false, answer: 'Recipes live in the desktop app.' }),
  },
  downloads: {
    start: async () => ({ ok: false, answer: 'Downloads live in the desktop app.' }),
    status: async () => ({}),
    run: async () => ({ ok: false, answer: 'Installers live in the desktop app.' }),
    execute: async () => ({ ok: false, answer: 'Installers run in the desktop app.' }),
    remove: async () => ({ ok: false, answer: 'Downloads live in the desktop app.' }),
    serveStart: async () => ({ ok: false, answer: 'The runtime starts in the desktop app.' }),
    serveStop: async () => ({ ok: false, answer: 'The runtime stops in the desktop app.' }),
    serveStatus: async () => ({ ok: true, running: false, answer: 'The desktop app knows the runtime state.' }),
    onEvent: () => () => undefined,
  },
  extensionPair: {
    get: async () => ({ token: '' }),
    rotate: async () => ({ ok: false, token: '' }),
  },
  stop: async () => ({ ok: false }),
  onEvent: () => () => undefined,
}

/** The real engine bridge when there is one, the honest refusal otherwise. */
export const getEngineApi = (): EngineBridge => {
  if (!hasDesktopBridge()) return demoEngineBridge
  const candidate = (window as unknown as { engineApi?: EngineBridge }).engineApi
  return candidate ?? demoEngineBridge
}

/** True in the browser preview, where there is no main process behind the UI. */
export const isDemo = !hasDesktopBridge() && !hasBrainHost()

/** The preload's operational service, with an honest browser-only fallback. */
export const getAutomationApi = (): AutomationBridge => {
  if (typeof window !== 'undefined') { const candidate = (window as unknown as { api?: { automation?: AutomationBridge } }).api?.automation; if (candidate) return candidate }
  return demoAutomation
}

export const getMemoryWorkspaceApi = (): MemoryBridge => window.api?.memoryWorkspace || demoMemoryWorkspace
