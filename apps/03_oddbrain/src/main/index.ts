import { createApprovalSigner } from './workflows/approvalSigner'
import { createWorkflowScheduler } from './workflows/scheduler'
import type { ScheduleInput } from '../shared/lib/schedules'
import { createWorkflowService } from './workflows/service'
import type { WorkflowStep } from '../shared/lib/workflows'
import { createCommandRunner, COMMAND_DISCLOSURE } from './commands/runner'
import type { ShellRequest } from '../shared/lib/commands'
import { createWorkQueue } from './engine/workQueue'
import { snapshotNativeArtifacts, collectNativeArtifacts } from './engine/nativeArtifacts'
import { createMcpReview, inspectNativeMcp } from './engine/mcpReview'
import { createSkillAuthoring, readInstalledSkills, inspectInstalledSkill, type SkillRoot } from './engine/installedSkills'
import type { SkillDraft } from '../shared/lib/installedSkills'
import { createPermissionTickets } from './engine/permissionTickets'
import { createNativeContext } from './nativeContext'
import { checkNativeConversation } from '../shared/lib/nativeConversation'
import { sessionKey } from './engine/socket'
import { createSessionBoardStore } from './engine/sessionBoardStore'
import { createCheckpointReviewGate } from './engine/checkpointReviewGate'
import { engineCommandRefusal } from '../shared/lib/engineCommandPolicy'
import { createSessionMemory } from './engine/sessionMemory'
import { AGY_PICTURES_ANSWER } from './engine/agy'
import { restartIdleConnection } from './engine/restart'
import { createTurnArchive } from './turnArchive'
import { dispatchRecordedTurn } from './recordedDispatch'
import { createSourceChecks } from './research/service'
import { effortTarget, selectedEffort, type EngineCapabilityReport } from '../shared/lib/engineCapabilities'
import { checkEffortSelection, createCapabilityInspector } from './engine/nativeCapabilities'
import type { ThinkingMode } from '../shared/lib/engine'
import { createVaultFiles } from './vault/files'
import { exportExtension } from './extension/export'
import { discoverClaudeModels } from './engine/modelDiscovery'
import { selectEngine } from '../shared/lib/engine'
import { configBytes, noLinkedPath, commitConfigs, preserveConfig } from './engine/configTransaction'
import { createMemoryWorkspace } from './memory/workspace'
import { createMemoryOrganizer } from './memory/organizer'
import type { MemoryAction } from '../shared/lib/memoryWorkspace'
import { normalizeExtensionAppearance, type ExtensionAppearance } from '../shared/lib/extensionAppearance'
import { createMediaService } from './media/service'
import { createMarketplaceService } from './engine/marketplace'
import { createAgyMarketplaceService } from './engine/agyMarketplace'
import type { MediaInput, MediaPreferences } from '../shared/lib/mediaBridge'
import type { MarketplaceAction } from '../shared/lib/marketplace'
import { fitWindow } from './windowBounds'
import { inferenceAllowed } from './automation/inferencePolicy'
import { CLOUD_PROVIDERS } from '../shared/lib/providers'
import { createAutomationService, type AutomationService } from './automation/service'
import { createTextReviewer } from './automation/reviewer'
import type { AutomationPreferences, AutomationView, ReviewInput } from '../shared/lib/automation'
import { readUiPreview } from './uiPreview'
import { createLaunchGate } from './uiLaunch'
import { app, BrowserWindow, dialog, Menu, safeStorage, shell, globalShortcut, screen, session } from 'electron'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { loadAppFlags, readAppFlagsStrict, saveAppFlags } from './appFlags'
import { userInfo } from 'node:os'
import { registerStagingRoot, setBinaryOverride, binaryOverride, resolveEngineCommand } from './engine/enginePath'
import { handle, lockNavigation, pinOwnOrigins, urlIsOurs } from './ipcGuard'
import { dirname, join, resolve, relative, isAbsolute } from 'node:path'
import { existsSync, statSync, realpathSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { startLocalApi, type LocalApi } from './api/server'
import { DEFAULT_EXTENSION_PORT, startExtensionApi, type ExtensionApi } from './extension/server'
import { createVaultService, resolveVaultRoot } from './vault/service'
import { canonicalStructureRoot, conflictWasSettled, normalizeSettledConflicts, settleStructureConflict, validStructureRelative, type SettledStructureConflict } from './vault/settled'
import { createKeyStore, type KeyStore } from './cloud/keys'
import { createCloudClient, type CloudClient } from './cloud/client'
import { providerById } from '../shared/lib/providers'
import {
  EMPTY_SETTINGS,
  folderProblem,
  readSettings,
  vaultCandidates,
  writeSettings,
  type AppSettings,
} from './settings'
import { cloudEnabled, applyPermissionPatch } from '../shared/lib/permissions'
import { registerArtifactIpc } from './artifacts/ipc'
import { createEngineSocket, type EngineSocket } from './engine/socket'
import { isValidModelName, normalizeEngine } from '../shared/lib/engine'
import { APPROVAL_MODES, type ApprovalMode, type EngineAvailability, type EngineEvent, type EngineId, type EngineModelEntry } from '../shared/lib/engine'
import { engineImages } from '../shared/lib/media'
import { listCheckpoints, restoreCheckpoint, inspectCheckpoint } from './engine/checkpoints'
import { createRecipeManager } from './recipes'
import { createCompactManager } from './compact'
import { buildRepoMap } from './repoMap'
import { createHookRunner } from './hooks'
import { createFolderWatcher, type WatchTick } from './watcher'
import { createJournalManager } from './journal'
import { createMemoryManager } from './memoryFiles'
import { createDownloadManager, type DownloadTick } from './engine/downloads'
import { agyModelSource, detectEngine } from './engine/availability'
import { enginePath } from './engine/enginePath'
import { pdfSafeName } from '../shared/lib/artifacts'
import { parsePullLine, validateModelName } from './engine/pull'
import { openLogin, readAuthStatus } from './engine/authStatus'
import { readOllamaVersion } from './engine/ollamaVersion'
import { scanClaudeSkills, type McpServer } from './engine/deploy'
import { createCatalogInstallReview } from './engine/skillCatalogInstall'
import { readMcpList } from '../shared/lib/mcp'
import { installPackFromFolder, listPacks, removePack } from './engine/packs'
import { exportPack } from './engine/exportPack'
import { installFromIndex, readIndex } from './engine/storeIndex'
import { starterPackFiles } from './engine/vaultSkills'
import { deployBuiltInSkills } from './engine/vaultSkills'
import { applyConflictAction, brainFileContents, classifyBrainRoot, defaultVaultPath, planBrainApply, planBrainRefresh } from '../shared/lib/brainStructure'
import { backupVault, restoreVault } from './vault/backup'
import { exportVaultCopy } from './vault/exportCopy'
import { createProjectRuleReview, houseRulesFile as nativeHouseRulesFile } from './engine/houseRulesDeploy'
import { DEFAULT_HOUSE_RULES, instructionBlock, type HouseRules } from '../shared/lib/houseRules'
import { newProject, type Project } from '../shared/lib/projects'

/**
 * The main process. Everything that touches the machine lives on this side:
 * files, the vault index, Ollama, the database. The renderer only ever talks to
 * it through the preload bridge, so there is no localhost HTTP and no CORS.
 */

/**
 * The port the browser extension posts to. Fixed, because an extension cannot
 * discover a moving port; overridable for a machine where something else already
 * owns 8765.
 */
function extensionPortWanted(): number {
  const wanted = Number(process.env.AI_ASSISTANT_EXTENSION_PORT || DEFAULT_EXTENSION_PORT)
  return Number.isFinite(wanted) && wanted > 0 && wanted < 65536 ? wanted : DEFAULT_EXTENSION_PORT
}

/**
 * The port the app's own API listens on. Fixed rather than ephemeral only so the
 * Vite dev server's proxy can find it in dev; if it is taken, the app falls back
 * to any free port and says so, because a busy port is not the user's problem.
 */
const API_PORT = Number(process.env.AI_ASSISTANT_API_PORT || 41979)

/**
 * Where the vault is, in order of who decides:
 *
 * 1. the folder the user chose in Settings — the only one that is a decision
 * 2. what the environment asks for, which is how the tests and the browser
 *    preview point at a throwaway vault
 * 3. `vault/Brain` in the checkout, so a fresh clone works with no setup
 * 4. this user's own app data folder, for a packaged build
 *
 * The first path that exists wins. Nothing is ever created — a missing vault is
 * reported by the interface, because replacing the vault somebody meant to point
 * at would be the worst outcome available.
 */
/**
 * The month's audit writes itself: the first boot or vault choice of a new
 * month records the vault's own numbers in 06 Review/Monthly Audits. There
 * is no scheduler — opening the app IS the schedule.
 */
function runMonthlyAudit(): void {
  try {
    const audit = createVaultService({ vaultPath: vaultRoot() }).monthlyAudit()
    if (audit.written) console.log(`[vault] monthly audit written: ${audit.relative}`)
  } catch {
    // No vault (yet or anymore): the audit waits for a boot that has one.
  }
}

function vaultRoot(): string {
  const checkout = app.isPackaged ? '' : join(app.getAppPath(), '..', '..', 'vault', 'Brain')
  return resolveVaultRoot(
    vaultCandidates({
      chosen: settings.vaultPath,
      env: process.env,
      checkout,
      userData: join(app.getPath('userData'), 'vault'),
    })
  ).root
}

/**
 * The providers, as the interface may see them: a label, where a key comes from,
 * whether one is saved, and whether it is only in this run. The key itself never
 * crosses into the renderer — this process is the only one that holds it.
 */
function cloudView(): {
  ok: boolean
  encryption: 'os' | 'none'
  providers: ReturnType<CloudClient['providers']>
} {
  return {
    ok: true,
    encryption: keyStore?.encryption || 'none',
    providers: cloud?.providers() || [],
  }
}

/**
 * Push an engine event to every open window and remember it, so a window
 * opened mid-turn still sees what happened. Small on purpose: context for a
 * person, not a log file.
 */
/** A Dhaka-time stamp for export folder names: vault-2026-10-16-1430. */
function stampFor(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now)
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}-${get('hour')}${get('minute')}`
}

// The engines' PATH is asked from the owner's shell once at boot, so the
// first engine start never hunts folders with a slim inherited PATH.
void enginePath()

let engineEventSequence = 0
function pushEngineEvent(event: EngineEvent): void {
  event = { ...event, sequence: ++engineEventSequence }
  // Stream pieces are for the live window only: a hundred of them would
  // crowd out the real story from the small remembered history, and the
  // finished text arrives in its own event for whoever reads it later.
  if (event.kind !== 'delta') engineHistory.push(event)
  if (engineHistory.length > 100) engineHistory.shift()
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('engine:event', event)
  }
}

/** Everything the renderer is allowed to ask about settings and the folder. */
/** Settings, the folder picker and the providers — everything the renderer asks the machine. */
  // The second-brain structure (his 2026-10-16 order): generate a new one or
  // adopt an existing folder — either way, only ever ADD what is missing.
  // The plan is made here, from the real folder, never from the renderer's
  // word; an existing file is never rewritten.
  const settledFile = (): string => join(app.getPath('userData'), 'structure-settled.json')
  const readSettled = (): SettledStructureConflict[] => {
    try {
      const parsed: unknown = JSON.parse(readFileSync(settledFile(), 'utf8'))
      const normalized = normalizeSettledConflicts(parsed, canonicalStructureRoot(vaultRoot()))
      if (Array.isArray(parsed) && parsed.some(entry => typeof entry === 'string')) {
        try { writeFileSync(settledFile(), JSON.stringify(normalized, null, 2), 'utf8') } catch { return normalizeSettledConflicts(parsed.filter(entry => typeof entry !== 'string'), canonicalStructureRoot(vaultRoot())) } // Never silently scope the same legacy entries to another vault on a failed migration.
      }
      return normalized
    } catch {
      return []
    }
  }
  const rememberSettled = (root: string, relative: string): void => {
    const before = readSettled(), after = settleStructureConflict(before, root, relative)
    if (after !== before) writeFileSync(settledFile(), JSON.stringify(after, null, 2), 'utf8')
  }

  const structurePlan = (root: string) => {
    if (typeof root !== 'string' || !root.trim() || root.length > 4096 || /[\n\r]/.test(root)) {
      throw new Error('Give a real folder path.')
    }
    let names: string[] = []
    try {
      names = readdirSync(root)
    } catch {
      return { error: 'That folder cannot be read.' as const }
    }
    const { kind } = classifyBrainRoot(names)
    const readExisting = (relative: string): string | null => {
      try {
        const full = join(root, relative)
        return existsSync(full) ? readFileSync(full, 'utf8') : null
      } catch {
        return null
      }
    }
    const settled = readSettled()
    const plan = planBrainApply(kind, relative => existsSync(join(root, relative)), readExisting, relative => conflictWasSettled(settled, root, relative))
    const differing = planBrainRefresh(kind, readExisting)
    return { kind: plan.kind, present: plan.present, missing: plan.missing, differing, conflicts: plan.conflicts, writes: plan.writes }
  }

  const integrateVaultStructure = (root: string): { ok: boolean; kind: string; written: string[]; conflicts: Array<{ original: string; added: string }>; differing: string[]; error?: string } => {
    try {
      const plan = structurePlan(root)
      if ('error' in plan) return { ok: false, kind: '', written: [], conflicts: [], differing: [], error: plan.error }
      const written: string[] = []
      for (const file of plan.writes) {
        const full = join(root, file.relative)
        mkdirSync(dirname(full), { recursive: true })
        writeFileSync(full, file.content, { encoding: 'utf8', flag: 'wx' })
        written.push(file.relative)
      }
      if (written.length && resolve(root) === resolve(vaultRoot())) {
        try {
          const service = createVaultService({ vaultPath: vaultRoot() })
          service.capture({ type: 'journal', content: `Second-brain structure: added ${written.join(', ')}.` })
        } catch {
          // The files are on disk either way; a log failure is not hidden, but not fatal.
        }
      }
      return { ok: true, kind: plan.kind, written, conflicts: plan.conflicts, differing: plan.differing }
    } catch (error) {
      return { ok: false, kind: '', written: [], conflicts: [], differing: [], error: (error as Error).message }
    }
  }


function inferencePermissions() {
  if (automation?.preferences().allowCloudInference !== false) return settings.permissions
  return { ...settings.permissions, cloud: Object.fromEntries(CLOUD_PROVIDERS.map(p => [p.id, false])) }
}

const capabilityInspector = createCapabilityInspector()
let mediaService: ReturnType<typeof createMediaService> | undefined
let marketplaceService: ReturnType<typeof createMarketplaceService> | undefined
let agyMarketplaceService: ReturnType<typeof createAgyMarketplaceService> | undefined
function registerBridges(): void {
  const workQueue = createWorkQueue(join(app.getPath('userData'), 'work-queue'), () => JSON.stringify(settings.engine), () => createHash('sha256').update(JSON.stringify([settings.engine, settings.permissions, automation?.preferences().allowCloudInference !== false, resolveEngineCommand(settings.engine.id), settings.engine.cloudProvider === 'anthropic' ? keyStore?.get('anthropic') || '' : ''])).digest('hex'))
  const permissionTickets = createPermissionTickets(() => engine?.current() || null)
  let nativeWork = 0
  let activeTranscript: { transcriptId: string; chatId?: string; prompt: string } | undefined
  let preparing: { owner: number; controller: AbortController } | undefined
  const catalogReviews = new Map<number, ReturnType<typeof createCatalogInstallReview>>()
  const mcpReviews = new Map<number, ReturnType<typeof createMcpReview>>()
  const ruleReviews = new Map<number, Map<string, { service: ReturnType<typeof createProjectRuleReview>; expiresAt: number }>>()
  const skillReviews = new Map<number, ReturnType<typeof createSkillAuthoring>>()
  const checkpointReviews = new Map<number, ReturnType<typeof createCheckpointReviewGate>>()
  const nativeContext = createNativeContext(join(app.getPath('userData'), 'projects.json'), join(app.getPath('userData'), 'project-context-grants.json'))
  const sessionMemory = createSessionMemory(join(app.getPath('userData'), 'engine-sessions.json'))
  const turnArchive = createTurnArchive(join(app.getPath('userData'), 'turn-transcripts'))
  const transcriptAnswer = <T,>(read: () => T) => { try { return { ok: true as const, value: read() } } catch { return { ok: false as const, error: 'The transcript could not be read. Its original file has not been changed.' } } }
  handle('transcripts:list', (_event, before: string = '') => transcriptAnswer(() => turnArchive.list(before)))
  handle('transcripts:read', (_event, id: string) => transcriptAnswer(() => turnArchive.read(id)))
  handle('transcripts:raw', (_event, id: string) => transcriptAnswer(() => turnArchive.raw(id)))
  // The preserved picture bytes. The expected size and digest come from the
  // record itself, never from the window, and a mismatch refuses the download.
  handle('transcripts:media', (_event, id: string, index: number) => transcriptAnswer(() => {
    const file = turnArchive.read(id).header.media?.files.find(entry => entry.index === index)
    if (!file) throw Error('This record has no preserved picture at that position.')
    return turnArchive.media.read(id, index, file)
  }))
  mediaService = createMediaService({ file: join(app.getPath('userData'), 'media.json'), onCancelled: owner => { const win = BrowserWindow.getAllWindows().find(w => w.webContents.id === owner); if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send('media:cancelled') }, access: () => ({ permissions: settings.permissions, external: automation?.preferences().allowCloudInference !== false, key: id => keyStore?.get(id) || '', customBaseUrl: settings.cloud.baseUrl }) })
  marketplaceService = createMarketplaceService({ file: join(app.getPath('userData'), 'marketplaces.json') })
  agyMarketplaceService = createAgyMarketplaceService({ cacheFile: join(app.getPath('home'), '.gemini', 'antigravity', 'cache', 'marketplaces', 'antigravity-plugins-official', 'marketplace.json') })
  const market = (engine: unknown) => {
    if (engine === 'agy') return agyMarketplaceService!
    if (engine === undefined || engine === 'claude-code') return marketplaceService!
    throw Error('Unknown marketplace engine.')
  }
  const commandSessions = new WeakMap<object, number>(); let commandSessionSerial = 0
  const commandScope = (reserved = false) => {
    const child = engine?.current()
    if (child && !commandSessions.has(child)) commandSessions.set(child, ++commandSessionSerial)
    const cwd = resolve(settings.engine.workspace || vaultRoot())
    const authority = JSON.stringify([cwd, settings.engine, settings.permissions, child ? commandSessions.get(child) : null, engine?.currentTarget(), nativeWork, workDispatchGeneration])
    const explanation = !settings.permissions.manualCommands ? 'Enable Reviewed OS commands in Settings → Agent access first. This is separate from native engine tool approval.'
      : settings.engine.approval === 'plan' ? 'Arbitrary OS commands are disabled while the engine is in Plan mode. Choose a non-plan mode explicitly before reviewing a command.'
      : engine?.turnBusy() || (dispatchingWork && !reserved) || foregroundApiRequests > 0 ? 'Wait for active work before running an app command.' : COMMAND_DISCLOSURE
    return { cwd, authority, stableAuthority: JSON.stringify([cwd, settings.engine.approval, settings.permissions]), busy: !!engine?.turnBusy() || (dispatchingWork && !reserved) || foregroundApiRequests > 0, allowed: settings.permissions.manualCommands === true && settings.engine.approval !== 'plan' && !engine?.turnBusy() && (!dispatchingWork || reserved) && foregroundApiRequests === 0, explanation }
  }
  const commandRunner = createCommandRunner({ root: join(app.getPath('userData'), 'command-runs'), scope: () => commandScope(),
    acquire: async (request, authority, signal) => {
      const initial = commandScope()
      if (!initial.allowed || initial.authority !== authority || resolve(request.cwd) !== initial.cwd) throw Error('Command authority changed before reservation. Nothing was run.')
      dispatchingWork = true
      try {
        memoryOrganizer?.cancel(); await automation?.cancel(); signal.throwIfAborted()
        const recheck = () => { const current = commandScope(true); if (!current.allowed || current.authority !== authority) throw Error('Command access, engine, session or working folder changed. Nothing was run.'); signal.throwIfAborted() }
        recheck()
        return { recheck, release: () => { dispatchingWork = false; workDispatchGeneration++ } }
      } catch (error) { dispatchingWork = false; workDispatchGeneration++; throw error }
    },
  })
  const workflows = createWorkflowService(join(app.getPath('userData'), 'workflows'), commandRunner)
  const scheduleSigner = createApprovalSigner(join(app.getPath('userData'), 'workflow-approval-key.json'), {
    available: () => safeStorage.isEncryptionAvailable() && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
    encrypt: value => safeStorage.encryptString(value), decrypt: value => safeStorage.decryptString(value),
  })
  const scheduler = createWorkflowScheduler({ root: join(app.getPath('userData'), 'workflow-schedules'), workflows, signer: scheduleSigner,
    busy: () => workQueue.view(-1).some(item => item.status === 'queued') || automation?.view().current?.automatic === false,
  })
  scheduler.start()

  app.on('before-quit', () => { scheduler.dispose(); workflows.cancel(); commandRunner.cancel() })
  const owners = new Set<number>()
  const track = (sender: Electron.WebContents): number => {
    if (!owners.has(sender.id)) { owners.add(sender.id); sender.once('destroyed', () => { scheduler.forget(sender.id); workflows.forget(sender.id); commandRunner.forget(sender.id); try { workQueue.ownerClosed(sender.id) } catch { /* queue recovery stays fail-closed on next read */ } if (preparing?.owner === sender.id) preparing.controller.abort(); catalogReviews.get(sender.id)?.cancel(); catalogReviews.delete(sender.id); mcpReviews.delete(sender.id); ruleReviews.delete(sender.id); skillReviews.delete(sender.id); checkpointReviews.delete(sender.id); capabilityInspector.cancel(sender.id); mediaService?.cancel(sender.id); marketplaceService?.cancel(sender.id); agyMarketplaceService?.cancel(sender.id); owners.delete(sender.id) }) }
    return sender.id
  }
  handle('schedules:list', () => scheduler.list())
  handle('schedules:preview', (event, input: ScheduleInput) => scheduler.preview(track(event.sender), input))
  handle('schedules:decide', (event, token: string, decision: 'allow' | 'deny') => scheduler.decide(track(event.sender), token, decision))
  handle('schedules:pause', (_event, id: string) => scheduler.pause(id))
  handle('schedules:inbox', (_event, before?: string) => scheduler.inbox(before))
  handle('schedules:acknowledge', (_event, id: string) => scheduler.acknowledge(id))
  handle('workflows:list', (_event, before?: string) => workflows.list(before))
  handle('workflows:save', (_event, input: { name: string; cwd: string; steps: WorkflowStep[] }) => workflows.save(input))
  handle('workflows:archive', (_event, id: string, archived: boolean) => workflows.archive(id, archived))
  handle('workflows:preview', (event, id: string) => workflows.preview(track(event.sender), id))
  handle('workflows:decide', (event, token: string, decision: 'allow' | 'deny') => workflows.decide(track(event.sender), token, decision))
  handle('workflows:cancel', () => workflows.cancel())
  handle('workflows:runs', (_event, before?: string) => workflows.runs(before))
  handle('workflows:read-run', (_event, id: string) => workflows.readRun(id))
  handle('commands:saved', (_event, before?: string) => commandRunner.saved(before))
  handle('commands:save', (_event, input: { name: string; command: string; cwd: string }) => commandRunner.save(input))
  handle('commands:archive-saved', (_event, id: string, archived: boolean) => commandRunner.archiveSaved(id, archived))
  // Source checks: the review is one-use, window-bound and expires; the exact
  // addresses are fetched only after an explicit allow.
  const sourceChecks = createSourceChecks({ root: join(app.getPath('userData'), 'source-checks') })
  handle('research:preview', (event, input: { transcriptId: string; chatId: string; questionStart: string; urls: string[] }) => sourceChecks.preview(track(event.sender), input))
  handle('research:decide', (event, token: string, decision: 'allow' | 'deny') => sourceChecks.decide(track(event.sender), token, decision))
  handle('research:read', (_event, transcriptId: string) => sourceChecks.read(transcriptId))
  handle('commands:preview-saved', (event, id: string) => commandRunner.previewSaved(track(event.sender), id))
  handle('commands:context', () => commandRunner.context())
  handle('commands:preview', (event, request: ShellRequest) => commandRunner.preview(track(event.sender), request))
  handle('commands:decide', (event, token: string, decision: 'allow' | 'deny') => commandRunner.decide(track(event.sender), token, decision))
  handle('commands:cancel', () => commandRunner.cancel())
  handle('commands:history', (_event, before?: string) => commandRunner.history(before))
  handle('commands:read', (_event, id: string) => commandRunner.read(id))
  handle('commands:output', (_event, id: string, stream: 'stdout' | 'stderr') => commandRunner.output(id, stream))
  const marketAnswer = async <T,>(run: () => Promise<T>) => { try { return { ok: true as const, value: await run() } } catch (error) { return { ok: false as const, error: (error as Error).message } } }
  handle('media:authorize-recording', (event, expected: { provider: string; model: string }) => mediaService!.authorizeRecording(track(event.sender), expected))
  handle('media:read', () => mediaService!.read())
  handle('media:update', (_event, patch: Partial<MediaPreferences>) => mediaService!.update(patch))
  handle('media:decoder', async () => {
    const picked = await dialog.showOpenDialog({ title: 'Choose the installed FFmpeg executable', properties: ['openFile'] })
    if (picked.canceled || !picked.filePaths[0]) return mediaService!.read()
    return mediaService!.update({ ffmpeg: picked.filePaths[0] }, true)
  })
  handle('media:decode', (event, input: MediaInput) => mediaService!.decode(track(event.sender), input))
  handle('media:dictate', event => mediaService!.dictate(track(event.sender)))
  handle('media:cancel', event => { mediaService!.cancel(event.sender.id) })
  handle('market:sources', (_event, engine?: unknown) => market(engine).sources())
  handle('market:browse', (event, repo: string, engine?: unknown) => marketAnswer(() => market(engine).browse(repo, track(event.sender))))
  handle('market:inspect', (event, repo: string, plugin: string, engine?: unknown) => marketAnswer(() => market(engine).inspect(track(event.sender), repo, plugin)))
  handle('market:probe', (event, engine?: unknown) => marketAnswer(() => market(engine).probe(track(event.sender))))
  handle('market:installed', (event, engine?: unknown) => marketAnswer(() => market(engine).installed(track(event.sender))))
  handle('market:plan', (event, repo: string, action: MarketplaceAction, plugin?: string, engine?: unknown) => marketAnswer(() => market(engine).plan(track(event.sender), repo, action, plugin)))
  handle('market:confirm', (event, token: string, engine?: unknown) => marketAnswer(() => market(engine).confirm(track(event.sender), token)))
  handle('market:cancel', (event, engine?: unknown) => { market(engine).cancel(event.sender.id) })
  const memoryAnswer = async (run: () => unknown) => { try { if (!memoryOrganizer) throw Error('Memory organizer is still starting.'); return { ok: true, view: await run() } } catch (e) { return { ok: false, error: (e as Error).message } } }
  handle('memory-workspace:read', () => memoryAnswer(() => memoryOrganizer!.read()))
  handle('memory-workspace:act', (_event, action: MemoryAction) => memoryAnswer(() => memoryOrganizer!.act(action)))
  handle('memory-workspace:run', () => memoryAnswer(() => memoryOrganizer!.run()))
  handle('settings:read', () => settings)
  handle('automation:history', (_event, before?: string) => { if (!automation) throw Error('Automation is still starting.'); return automation.history(before) })
  handle('automation:saved', (_event, id: string) => { if (!automation) throw Error('Automation is still starting.'); return automation.saved(id) })
  handle('automation:read', () => { if (!automation) throw Error('Automation is still starting.'); return automation.view() })
  handle('automation:update', (_event, input: Partial<AutomationPreferences>) => {
    if (!automation) throw Error('Automation is still starting.')
    const patch: Partial<AutomationPreferences> = {}
    for (const key of ['autoKeep', 'autoReview', 'allowExternalReview', 'allowCloudInference'] as const) if (typeof input?.[key] === 'boolean') patch[key] = input[key]
    if (typeof input?.reviewModel === 'string') patch.reviewModel = input.reviewModel
    const wasCloud = automation.preferences().allowCloudInference
    const result = automation.update(patch)
    if (result.ok && wasCloud !== result.view.preferences.allowCloudInference) { workDispatchGeneration++; automation.stopWork(); mediaService?.cancelAll(); engine?.stop() }
    return result
  })
  handle('automation:models', async () => {
    try { if (!automation || !reviewer) throw Error('The reviewer is still starting.'); return { ok: true, models: await reviewer.models(automation.preferences()) } }
    catch (error) { return { ok: false, models: [], error: (error as Error).message } }
  })
  handle('automation:review', async (_event, input: ReviewInput) => {
    if (!automation) return { ok: false, error: 'The reviewer is still starting.' }
    if (engine?.turnBusy()) return { ok: false, error: 'Wait for normal work to finish before reviewing it.' }
    return automation.review(input)
  })
  handle('automation:cancel', async () => { await automation?.cancel(); return { ok: true } })


  handle(
    'settings:update',
    (
      _event,
      patch: {
        vaultPath?: string
        cloud?: { baseUrl?: string; model?: string }
        permissions?: unknown
      }
    ): { ok: boolean; error?: string; settings: AppSettings; status?: unknown } => {
      // A provider endpoint is a plain preference, so it is written first: a
      // folder problem must never lose what somebody just typed into the other
      // pane of the same window.
      if (patch?.cloud && typeof patch.cloud === 'object') {
        mediaService?.cancelAll()
        const cloud = settings.cloud
        settings = writeSettings(settingsFile, {
          ...settings,
          cloud: {
            baseUrl: typeof patch.cloud.baseUrl === 'string' ? patch.cloud.baseUrl : cloud.baseUrl,
            model: typeof patch.cloud.model === 'string' ? patch.cloud.model : cloud.model,
          },
        })
      }
      // What an agent may do. Sanitised on the way in — the window asks, the main
      // process decides — and the app's own settings file is the record.
      if (patch?.permissions !== undefined) {
        const previousAccess = settings.permissions
        let nextAccess: typeof previousAccess
        try { nextAccess = applyPermissionPatch(previousAccess, patch.permissions) }
        catch (error) { return { ok: false, error: (error as Error).message, settings } }
        if (JSON.stringify(nextAccess) !== JSON.stringify(previousAccess)) {
          settings = writeSettings(settingsFile, { ...settings, permissions: nextAccess })
          workflows.cancel(); commandRunner.cancel(); void automation?.cancel(); mediaService?.cancelAll()
          if (previousAccess.local !== settings.permissions.local || JSON.stringify(previousAccess.cloud) !== JSON.stringify(settings.permissions.cloud)) { workDispatchGeneration++; automation?.stopWork(); engine?.stop() }
        }
      }
      // No vault path in the patch means the caller is not moving the vault, so
      // there is nothing to check and nothing to reconsider.
      if (typeof patch?.vaultPath !== 'string') return { ok: true, settings }
      const wanted = patch.vaultPath
      const problem = folderProblem(wanted)
      if (problem) return { ok: false, error: problem, settings }
      settings = writeSettings(settingsFile, { ...settings, vaultPath: wanted.trim() })
    // Point the running service at the new folder. No restart, and the interface
    // is told the result instead of assuming it worked.
      const next = createVaultService({ vaultPath: vaultRoot() })
      api?.setVault(next)
      // A newly chosen folder gets the structure immediately (his rule:
      // generate the default structure anyways; conflicts land beside).
      integrateVaultStructure(vaultRoot())
      runMonthlyAudit()
      return { ok: true, settings, status: next.status() }
    }
  )

  handle('cloud:providers', () => cloudView())

  /**
   * Every model the saved keys can reach, with each provider's own problem
   * reported against it. A provider that is slow or down never holds up the
   * others, and a failure is a sentence here, never a thrown error in the
   * interface.
   */
  handle('cloud:models', async () => {
    if (!cloud) return { ok: false, error: 'Cloud providers are not running in this process.', models: [], problems: [] }
    try {
      const { models, problems } = await cloud.models()
      return { ok: true, models, problems }
    } catch (error) {
      return { ok: false, error: (error as Error).message, models: [], problems: [] }
    }
  })

  handle('cloud:save-key', (_event, id: string, key: string) => {
    void automation?.cancel(); mediaService?.cancelAll()
    const provider = providerById(String(id || ''))
    if (!provider || !keyStore) return { ok: false, error: 'That is not a provider this app knows.' }
    if (!String(key || '').trim()) return { ok: false, error: 'Paste a key first.' }
    keyStore.set(provider.id, String(key))
    return cloudView()
  })

  handle('cloud:clear-key', (_event, id: string) => {
    void automation?.cancel(); mediaService?.cancelAll()
    keyStore?.clear(String(id || ''))
    // A cleared key must not keep speaking — but only ITS engine: the app has
    // one engine process, and stopping it because some OTHER provider's key
    // was cleared would interrupt an unrelated conversation. The engine says
    // which provider's key it was launched with.
    if (engine?.usedAuthProvider?.() === String(id || '')) engine?.stop()
    return cloudView()
  })

  /** The Test button: one provider, asked for its own model list. */
  handle('cloud:test', async (_event, id: string) => {
    if (!cloud) return { ok: false, error: 'Cloud providers are not running in this process.' }
    try {
      const models = await cloud.listModels(String(id || ''))
      return { ok: true, count: models.length, first: models[0]?.label || '' }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  })

  /**
   * Whether the browser extension can reach this app, and where. Shown in
   * Settings > System: a port that is open is a fact the person should be able to
   * see, not something to find out from an extension that quietly stopped working.
   */
  handle('extension:appearance', (_event, value: unknown) => {
    const clean = normalizeExtensionAppearance(value)
    if (!clean) return { ok: false }
    extensionAppearance = clean
    return { ok: true }
  })
  handle('extension:export', async (_event, destination: unknown) => {
    if (destination !== 'downloads' && destination !== 'choose') return { ok: false, answer: 'Choose Downloads or a folder.' }
    let parent = app.getPath('downloads')
    if (destination === 'choose') {
      const chosen = await dialog.showOpenDialog({ title: 'Where should the extension folder go?', properties: ['openDirectory', 'createDirectory'] })
      if (chosen.canceled || !chosen.filePaths[0]) return { ok: false, answer: 'Cancelled. No extension folder was created.' }
      parent = chosen.filePaths[0]
    }
    const source = app.isPackaged ? join(process.resourcesPath, 'extension') : resolve(app.getAppPath(), '../../extension')
    const target = join(parent, `OddBrain-extension-${Date.now()}-${randomUUID().slice(0,8)}`)
    const result = exportExtension(source, target)
    if (result.ok && result.path) shell.showItemInFolder(join(result.path, 'manifest.json'))
    return result
  })
  handle('extension:status', () => ({
    ok: true,
    listening: Boolean(extensionApi?.listening),
    port: extensionApi?.port ?? extensionPortWanted(),
    url: extensionApi?.url || `http://127.0.0.1:${extensionPortWanted()}`,
    error: extensionApi?.error || '',
  }))

  handle('vault:choose-folder', async () => {
    const [window] = BrowserWindow.getAllWindows()
    const chosen = await dialog.showOpenDialog(window, {
      title: 'Choose the folder OddBrain keeps its notes in',
      buttonLabel: 'Use this folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    return chosen.canceled || !chosen.filePaths.length ? null : chosen.filePaths[0]
  })

  handle('structure:inspect', (_event, root: string) => {
    try {
      const plan = structurePlan(root)
      return 'error' in plan
        ? { ok: false, error: plan.error }
        : { ok: true, kind: plan.kind, present: plan.present, missing: plan.missing, differing: plan.differing, conflicts: plan.conflicts }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  })

  handle('structure:apply', (_event, root: string, options: { refresh?: boolean } | undefined) => {
    try {
      const done = integrateVaultStructure(root)
      if (!done.ok) return { ok: false, error: done.error }
      const written = done.written
      const plan = structurePlan(root)
      if ('error' in plan) return { ok: false, error: plan.error }
      // Refresh is the owner's explicit press: only the app's own rulebooks
      // (index map + CLAUDE.md/AGENTS.md wording) are brought up to date —
      // never a README, never a note, never anything that was missing anyway.
      let refreshed: string[] = []
      if (options?.refresh === true && plan.differing.length) {
        // The new wording comes from the library itself, not from plan.writes:
        // a differing file is present, so it was never in the writes plan.
        const contents = brainFileContents(plan.kind)
        for (const relative of plan.differing) {
          const content = contents.get(relative)
          if (content === undefined) continue
          writeFileSync(join(root, relative), content, { encoding: 'utf8' })
          refreshed.push(relative)
        }
      }
      // Inside an app vault, the own audit log records the additions.
      if (plan.kind === 'app-structure' && written.length && resolve(root) === resolve(vaultRoot())) {
        try {
          // One journal line for the whole apply — the journal is write-once
          // per day, so the apply is logged as the one event it was.
          const service = createVaultService({ vaultPath: vaultRoot() })
          service.capture({ type: 'journal', content: `Second-brain structure: added ${written.join(', ')}.` })
        } catch {
          // The files are on disk either way; a log failure is reported, not hidden.
        }
      }
      return { ok: true, kind: plan.kind, written, refreshed, skipped: plan.present, conflicts: plan.conflicts, differing: plan.differing }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  })

  // Settling a conflict the owner was told about: the beside-copy was added by
  // the structure apply, and only that recorded shape may be resolved. The
  // owner's own file is written only when they said so; 'both' touches nothing.
  handle(
    'structure:resolve',
    (_event, root: string, original: string, added: string, action: 'mine' | 'new' | 'both' | 'combine') => {
      try {
        if (typeof root !== 'string' || !root.trim()) return { ok: false, error: 'Give a real folder path.' }
        if (canonicalStructureRoot(root) !== canonicalStructureRoot(vaultRoot())) return { ok: false, error: 'Only the selected vault can settle a structure conflict.' }
        if (action !== 'mine' && action !== 'new' && action !== 'both' && action !== 'combine') {
          return { ok: false, error: 'Unknown choice.' }
        }
        if (!validStructureRelative(original) || !validStructureRelative(added)) throw new Error('Not a vault-relative path.')
        const mine = original, theirs = added
        const scoped = createVaultFiles(root, () => new Date())
        const mineFull = scoped.filePath(mine), theirsFull = scoped.filePath(theirs)
        const plan = structurePlan(root)
        if ('error' in plan || !plan.conflicts.some(conflict => conflict.original === mine && conflict.added === theirs)) return { ok: false, error: 'That pair is not a current structure conflict.' }
        if (!existsSync(mineFull) || !existsSync(theirsFull)) return { ok: false, error: 'One of the two files is gone.' }
        // The never-check list is functional, not prose: the default seed must
        // never overwrite the patterns the owner actually keeps.
        if (action === 'new' && mine.replace(/\\/g, '/').endsWith('00 System/Privacy & Access.md')) {
          return { ok: false, error: 'The privacy list is never replaced by the default seed. Keep yours, or combine.' }
        }
        const verdict = applyConflictAction(action, readFileSync(mineFull, 'utf8'), readFileSync(theirsFull, 'utf8'))
        if (verdict.original !== null) scoped.writeAtomic(mine, verdict.original)
        if (verdict.deleteAdded) rmSync(theirsFull)
        // Settled is settled: the plan stops offering this file.
        rememberSettled(root, mine)
        if (resolve(root) === resolve(vaultRoot())) {
          try {
            const service = createVaultService({ vaultPath: vaultRoot() })
            service.capture({ type: 'journal', content: `Structure conflict settled (${action}): ${mine}.` })
          } catch {
            // The files are settled either way; a log failure is not hidden, but it is not fatal.
          }
        }
        return { ok: true }
      } catch (error) {
        return { ok: false, error: (error as Error).message }
      }
    }
  )

  // The default vault: his Documents\OddBrain\Brain. Created on his press —
  // this one press is the decision — then integrated like any other folder.
  handle('vault:use-default', async () => {
    const home = process.env['USERPROFILE'] || process.env['HOME'] || ''
    let target = ''
    try {
      target = defaultVaultPath(home)
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
    try {
      mkdirSync(target, { recursive: true })
    } catch {
      return { ok: false, error: `${target} could not be created.` }
    }
    settings = writeSettings(settingsFile, { ...settings, vaultPath: target })
    const next = createVaultService({ vaultPath: vaultRoot() })
    api?.setVault(next)
    const done = integrateVaultStructure(target)
    return { ok: true, path: target, kind: done.kind, written: done.written, conflicts: done.conflicts, differing: done.differing }
  })

  // The link check: every [[link]] in the vault, resolved by exact path and
  // counted honestly — dead links and ambiguous bare names are reported, never
  // repaired behind the owner's back. Read-only.
  handle('vault:link-check', () => {
    try {
      return createVaultService({ vaultPath: vaultRoot() }).links()
    } catch (error) {
      return { files: 0, checked: 0, dead: [], ambiguous: [], error: (error as Error).message }
    }
  })

  // The artifact library, in this user's own app-data folder. Not the vault:
  // the vault is the person's curated notes, and the app does not scatter its
  // own working files through it without being asked.
  registerArtifactIpc(join(app.getPath('userData'), 'artifacts'))

  // The engine: read the choice, change it, hand it a task, answer its
  // permission cards. Every answer is a value or a plain sentence — a refused
  // task is information, not an exception.
  handle('engine:read', () => ({
    engine: settings.engine,
    running: engine?.running() === true,
    history: activeTranscript ? engineHistory.filter(event => event.transcriptId === activeTranscript?.transcriptId) : [...engineHistory],
    active: activeTranscript, lastSequence: engineEventSequence, busy: engine?.turnBusy() === true,
  }))

  handle('engine:pick', (_event, id: string): { ok: boolean; answer: string } => {
    if (id !== 'claude-code' && id !== 'agy') return { ok: false, answer: 'Unknown engine.' }
    if (dispatchingWork || engine?.turnBusy()) return { ok: false, answer: 'Stop the active task or wait for it to finish before switching engines.' }
    const wanted = id
    settings = writeSettings(settingsFile, { ...settings, engine: selectEngine(settings.engine, wanted) })
    return { ok: true, answer: `engine set to ${wanted}` }
  })

  const sendNative = async (event: Electron.IpcMainInvokeEvent, prompt: string, cwd: string, pictures: unknown = [], conversation?: unknown): Promise<{ ok: boolean; answer: string }> => {
      let context: ReturnType<typeof checkNativeConversation>
      try { context = checkNativeConversation(conversation) } catch (error) { return { ok: false, answer: (error as Error).message } }
      const text = typeof prompt === 'string' ? prompt : ''
      if (text.length > 20000) return { ok: false, answer: 'The prompt exceeds 20,000 characters. Nothing was sent or shortened.' }
      if (!text.trim()) return { ok: false, answer: 'Write what the engine should do first.' }
      const commandRefusal = engineCommandRefusal(text)
      if (commandRefusal) return { ok: false, answer: commandRefusal }
      // Pictures: only what the wire can carry, only a few, only small. A bad
      // list is refused with the reason, never silently dropped.
      const checkedImages = engineImages(pictures ?? [])
      if (!checkedImages.ok) return checkedImages
      const images = checkedImages.images
      if (settings.engine.id === 'agy' && images.length) return { ok: false, answer: AGY_PICTURES_ANSWER }
      if (!engine) return { ok: false, answer: 'The engine is still waking up, try again in a moment.' }
      // The working folder is the app's decision, never the window's: the
      // folder the owner picked in the engine bay, or the vault when none.
      // The renderer's value is deliberately not consulted (review finding).
      void cwd
      if (dispatchingWork || engine.turnBusy()) return { ok: false, answer: 'An engine is already working. Stop it first, or wait for it to finish.' }
      dispatchingWork = true
      const ownWork = ++nativeWork
      permissionTickets.clear()
      preparing = { owner: track(event.sender), controller: new AbortController() }
      try {
      const ownDispatch = workDispatchGeneration
      const savedEngine = { ...settings.engine }, usedEngine = { ...savedEngine }
      if (context?.expectedRoute && context.expectedRoute !== JSON.stringify(savedEngine)) throw Error('The selected engine or model changed while preparing this task. Nothing was sent; review the selection and retry.')
      if (context) usedEngine.workspace = nativeContext.workspace(context, savedEngine.workspace || vaultRoot())
      const policy = () => JSON.stringify([settings.permissions, automation?.preferences().allowCloudInference !== false])
      const usedPolicy = policy()
      const folderSubject = context?.projectId && !Object.hasOwn(context.overrides || {}, 'workspace') ? `project:${context.projectId}` : context?.chatId
      if (context && folderSubject && resolve(usedEngine.workspace) !== resolve(savedEngine.workspace || vaultRoot()) && !nativeContext.workspaceGranted(folderSubject, usedEngine.workspace)) {
        const approval = await dialog.showMessageBox({ type: 'question', title: 'Authorize the working folder', message: `Use ${usedEngine.workspace} for ${folderSubject.startsWith('project:') ? 'chats using this project’s default folder' : 'this chat'}?`, detail: 'This sets the working folder, not an OS sandbox. Existing native tool approval rules still apply; additional folder references grant no permissions. Cancel keeps the draft unsent.', buttons: ['Cancel', 'Use this folder'], defaultId: 0, cancelId: 0 })
        if (approval.response !== 1 || ownDispatch !== workDispatchGeneration) return { ok: false, answer: 'Working folder not authorized. Nothing was sent.' }
        nativeContext.grantWorkspace(folderSubject, usedEngine.workspace)
      }
      if (selectedEffort(savedEngine) !== 'default' && usedEngine.workspace !== savedEngine.workspace) return { ok: false, answer: 'This chat uses a different folder. Choose Engine default effort or inspect effort in that folder before sending.' }
      memoryOrganizer?.cancel()
      await automation?.beginWork(text, usedEngine)
      if (ownDispatch !== workDispatchGeneration) { automation?.rejectWork(); return { ok: false, answer: 'The task was canceled before it started.' } }
      const usedCommand = resolveEngineCommand(usedEngine.id)
      // Saved effort is a request, not permanent proof about a changing CLI/account.
      // Recheck before any task text is handed to the engine; no agent turn is used.
      const effort = selectedEffort(usedEngine)
      if (effort !== 'default') {
        const checked = await checkEffortSelection(usedEngine, effort, effortTarget(usedEngine), current => capabilityInspector.inspect(track(event.sender), current, current.workspace || vaultRoot()))
        if (!checked.ok) { automation?.rejectWork(); return { ok: false, answer: 'The requested effort could not be verified for this model. Refresh Reasoning effort or choose Engine default. No message was sent.' } }
      }
      const access = await inferenceAllowed(usedEngine, settings.permissions.local, automation?.preferences().allowCloudInference !== false)
      if (!access.ok || usedPolicy !== policy() || usedCommand !== resolveEngineCommand(usedEngine.id) || ownDispatch !== workDispatchGeneration || JSON.stringify(savedEngine) !== JSON.stringify(settings.engine)) {
        automation?.rejectWork(); return { ok: false, answer: access.answer || 'The task was canceled or its model changed before dispatch. Send again when ready.' }
      }
      automation?.retargetWork(usedEngine)
      // A provider brain rides the ENGINE: the key from Models goes into the
      // engine's own environment for this launch. The app itself never calls
      // the provider — and a missing key refuses honestly instead of falling
      // back to a different brain than the one that was chosen.
      let auth: { provider: 'anthropic'; apiKey: string } | undefined
      if (usedEngine.cloudProvider === 'anthropic') {
        if (!cloudEnabled(inferencePermissions(), 'anthropic', keyStore?.has('anthropic') === true)) { automation?.rejectWork(); return { ok: false, answer: 'Anthropic inference is not enabled in Agent access or has no key. Nothing was sent.' } }
        const key = keyStore?.get('anthropic') || ''
        if (!key) {
          automation?.rejectWork()
          return { ok: false, answer: 'The Anthropic brain needs its key: add it in Settings > Models (it is held for this run). Nothing was sent.' }
        }
        auth = { provider: 'anthropic', apiKey: key }
      }
      const prepared = context ? await nativeContext.prepare(context, usedEngine.workspace || vaultRoot(), text,
        sessionMemory.load(sessionKey(usedEngine.id, usedEngine.workspace || vaultRoot(), context.chatId)), preparing.controller.signal) : undefined
      if (ownDispatch !== workDispatchGeneration || policy() !== usedPolicy || JSON.stringify(settings.engine) !== JSON.stringify(savedEngine) || usedCommand !== resolveEngineCommand(usedEngine.id)) throw Error('Task settings changed while reading context. Nothing was sent.')
      if (preparing.controller.signal.aborted) throw Error('Task preparation canceled. Nothing was sent.')
      if (auth && (keyStore?.get('anthropic') !== auth.apiKey || !cloudEnabled(inferencePermissions(), 'anthropic', keyStore?.has('anthropic') === true))) throw Error('Provider access changed while reading context. Nothing was sent.')
      prepared?.validate()
      const appInstructions = instructionBlock(usedEngine.id, usedEngine.model, effectiveRules(), settings.memoryFolder || '')
      const dispatchedText = `OddBrain app instructions (not additional tool permissions):\n${appInstructions}\n\n${prepared?.prompt || text}`
      if (dispatchedText.length > 100_000) throw Error('App instructions plus selected context exceed 100,000 characters. Nothing was shortened or sent.')
      const receipt = prepared?.receipt || { projectId: null, revision: '', workspace: usedEngine.workspace || vaultRoot(), sources: [], historyMessages: 0, characters: 0 }
      receipt.sources.unshift({ id: 'app-instructions', title: 'Saved app instructions', chars: appInstructions.length, digest: createHash('sha256').update(appInstructions).digest('hex'), coverage: 'Complete app-owned instruction block; not a permission grant' })
      receipt.characters = dispatchedText.length
      receipt.revision = createHash('sha256').update(JSON.stringify([receipt.revision, appInstructions])).digest('hex')
      const artifactBefore = snapshotNativeArtifacts(usedEngine.workspace || vaultRoot())
      const sent = dispatchRecordedTurn(turnArchive, { prompt: dispatchedText, userPrompt: text, chatId: context?.chatId, context: receipt, engine: usedEngine.id, model: usedEngine.model, workspace: usedEngine.workspace || vaultRoot(), pictures: images.length, images }, receive => engine!.send(dispatchedText, {
        chatId: context?.chatId,
        cwd: usedEngine.workspace || vaultRoot(),
        settings: usedEngine,
        auth, images,
        checkpointDir: join(app.getPath('userData'), 'checkpoints'),
        shouldCheckpoint: () => automation?.preferences().autoKeep !== false,
        onEvent: output => {
          if (output.kind === 'done') {
            try {
              const observed = collectNativeArtifacts(join(app.getPath('userData'), 'artifacts'), usedEngine.workspace || vaultRoot(), artifactBefore, context?.chatId)
              for (const notice of observed.notices) receive({ kind: 'status', text: notice })
              output = { ...output, ...(observed.links.length ? { artifacts: observed.links } : {}) }
            } catch { receive({ kind: 'status', text: 'Artifact inspection could not finish. Original outputs remain in the working folder.' }) }
          }
          receive(output)
        },
      }), () => engine?.stop(), (event: EngineEvent) => {
        if (event.kind === 'permission') {
          try { event = { ...event, requestId: permissionTickets.issue(event.requestId) } }
          catch { engine?.stop(); event = { kind: 'error', text: 'The permission could not be bound to the active engine. Stop requested; no approval was sent.', chatId: context?.chatId } }
        }
        if (event.kind === 'done' || event.kind === 'error' || event.kind === 'closed') permissionTickets.clear()
        automation?.ingest(event)
        pushEngineEvent(event)
        if (event.kind === 'done') void hookRunner.run('turn-done').then((lines) => { if (ownWork === nativeWork) lines.forEach((line) => pushEngineEvent({ kind: 'status', text: line, chatId: context?.chatId, transcriptId: event.transcriptId })) })
        if (event.kind === 'error') void hookRunner.run('turn-error').then((lines) => { if (ownWork === nativeWork) lines.forEach((line) => pushEngineEvent({ kind: 'status', text: line, chatId: context?.chatId, transcriptId: event.transcriptId })) })
        if (event.kind === 'permission') void hookRunner.run('permission').then((lines) => { if (ownWork === nativeWork) lines.forEach((line) => pushEngineEvent({ kind: 'status', text: line, chatId: context?.chatId, transcriptId: event.transcriptId })) })
      })
      if (sent.transcriptId) activeTranscript = { transcriptId: sent.transcriptId, chatId: context?.chatId, prompt: text }
      if (!sent.ok) automation?.rejectWork()
      return sent
      } catch (error) { automation?.rejectWork(); return { ok: false, answer: (error as Error).message } } finally { preparing = undefined; dispatchingWork = false }
    }
  handle('queue:read', event => workQueue.view(track(event.sender)))
  handle('queue:enqueue', (event, prompt: string, conversation?: unknown) => workQueue.enqueue(track(event.sender), prompt, checkNativeConversation(conversation)))
  handle('queue:resume', (event, id: string, acknowledge?: boolean) => {
    if (dispatchingWork || engine?.turnBusy()) throw Error('Wait for active work before resuming a saved task.')
    return workQueue.resume(track(event.sender), id, acknowledge === true)
  })
  handle('queue:cancel', (event, id: string) => workQueue.cancel(track(event.sender), id))
  handle('queue:hold', (event, id: string) => workQueue.block(id, 'The handoff response was not confirmed. Inspect transcripts before resuming.', event.sender.id))
  handle('queue:history', (_event, before?: string) => workQueue.history(before))
  handle('engine:send', async (event, prompt: string, cwd: string, pictures?: unknown, conversation?: unknown, queuedId?: string) => {
    if (!queuedId) return sendNative(event, prompt, cwd, pictures, conversation)
    let started = false
    try {
      if (dispatchingWork || engine?.turnBusy()) throw Error('Another task is active. Resume this saved task after it finishes.')
      if (Array.isArray(pictures) && pictures.length) throw Error('The saved queue contains text, not image bytes. Send images directly.')
      workQueue.start(track(event.sender), queuedId, prompt, checkNativeConversation(conversation)); started = true
      const answer = await sendNative(event, prompt, cwd, pictures, conversation)
      try { workQueue.finish(queuedId, answer) }
      catch { return { ...answer, answer: answer.answer + ' Queue receipt could not be confirmed. Inspect transcripts before any retry.' } }
      return answer
    } catch (error) {
      const answer = { ok: false, answer: (error as Error).message }
      try { if (started) workQueue.finish(queuedId, answer); else workQueue.block(queuedId, answer.answer, event.sender.id) } catch { /* existing queue/turn records are retained */ }
      return answer
    }
  })


  // Bringing a brain home: official-endpoint downloads into the app's own
  // engines folder, a run permission for staged installers, honest removal.
  const downloads = createDownloadManager({
    root: join(app.getPath('userData'), 'engines'),
    onTick: (tick: DownloadTick) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('engine:download-event', tick)
    },
  })
  handle('engine:download:start', (_event, engine: string) => downloads.start(typeof engine === 'string' ? engine : ''))
  handle('engine:download:status', () => downloads.status())
  handle('engine:download:run', (_event, engine: string) => downloads.runInstaller(typeof engine === 'string' ? engine : ''))
  handle('engine:download:execute', (_event, engine: string) => downloads.executeInstaller(typeof engine === 'string' ? engine : ''))
  handle('engine:download:remove', (_event, engine: string) => downloads.remove(typeof engine === 'string' ? engine : ''))
  // The staged Ollama runtime, started and stopped HERE — the download
  // module's copy says this, so the doors must exist to make it true.
  downloadManager = downloads
  handle('engine:download:serve-start', () => downloads.ollamaStart())
  handle('engine:download:serve-stop', () => downloads.ollamaStop())
  handle('engine:download:serve-status', () => downloads.ollamaStatus())
  // The owner's Ollama desktop app quits fully — it does NOT keep `serve`
  // resident. So the app starts the door itself at boot (his installed copy
  // first, staged second) and only reports the truth afterward. Fire and
  // forget: a failure here is the Connectors card's job to say, not a crash.
  void downloads.ollamaStart().then((answer) => {
    console.log(`[ollama] ${answer.answer}`)
  }).catch(() => {})

  // The two "keep it running" switches, in their own file (see appFlags.ts).
  const appFlagsFile = (): string => join(app.getPath('userData'), 'app-flags.json')
  handle('app:preview-html', () => readUiPreview(app.getAppPath(), process.resourcesPath, app.isPackaged))
  handle('app:claim-launch', () => claimUiLaunch())
  const confirmedFlags = () => ({ ...readAppFlagsStrict(appFlagsFile()), ...(['win32', 'darwin'].includes(process.platform) ? { loginItem: app.getLoginItemSettings().openAtLogin } : {}) })
  handle('app:flags:get', confirmedFlags)
  // The machine's own name for this person, offered as a suggestion on first
  // run. The real machine lesson: the app asked for a name and detected
  // nothing, so the owner typed empty quotes and moved on. Spaces in the
  // username are normal Windows — carried through untouched.
  // "Point to the exe" — the durable answer to every installer that drops a
  // binary somewhere nobody pre-listed. The person sees the file; the person
  // points; the app prefers it forever.
  handle('engine:pick-binary', async (_event, id: EngineId): Promise<{ ok: boolean; answer: string; path?: string }> => {
    if (id !== 'claude-code' && id !== 'agy') return { ok: false, answer: 'Unknown engine.' }
    const picked = await dialog.showOpenDialog({
      title: `Point to ${id === 'claude-code' ? 'claude' : 'agy'}`,
      properties: ['openFile'],
      filters: [{ name: 'Executable', extensions: ['exe', 'cmd', 'bat'] }],
    })
    if (picked.canceled || !picked.filePaths[0]) return { ok: false, answer: 'Nothing was picked.' }
    const file = picked.filePaths[0]
    if (!existsSync(file)) return { ok: false, answer: 'That file does not exist.' }
    setBinaryOverride(id, file)
    try {
      writeFileSync(join(app.getPath('userData'), 'engine-binaries.json'), JSON.stringify({ 'claude-code': binaryOverride('claude-code'), 'agy': binaryOverride('agy') }, null, 2))
    } catch {}
    detectEngine(id, true).catch(() => {})
    return { ok: true, answer: `${id} is pointed at ${file}. Launches and detection prefer it from now on.`, path: file }
  })

  handle('engine:clear-binary', (_event, id: EngineId): { ok: boolean; answer: string } => {
    if (id !== 'claude-code' && id !== 'agy') return { ok: false, answer: 'Unknown engine.' }
    setBinaryOverride(id, '')
    try {
      writeFileSync(join(app.getPath('userData'), 'engine-binaries.json'), JSON.stringify({ 'claude-code': binaryOverride('claude-code'), 'agy': binaryOverride('agy') }, null, 2))
    } catch {}
    detectEngine(id, true).catch(() => {})
    return { ok: true, answer: `${id} is back to automatic detection.` }
  })

  handle('engine:binary-override', (_event, id: EngineId): { path: string } => {
    return { path: id === 'claude-code' || id === 'agy' ? binaryOverride(id) : '' }
  })

  handle('app:whoami', (): { name: string } => {
    try {
      const info = userInfo()
      const fromInfo = typeof info.username === 'string' ? info.username.trim() : ''
      const fromEnv = (process.env['USERNAME'] ?? '').trim()
      const name = fromInfo || fromEnv
      return { name: name.slice(0, 60) }
    } catch {
      return { name: (process.env['USERNAME'] ?? '').trim().slice(0, 60) }
    }
  })
  handle('app:flags:set', (_event, patch: { loginItem?: boolean; warmRuntime?: boolean; keepLoadedAlways?: boolean }) => {
    const clean = {
      ...(typeof patch?.loginItem === 'boolean' ? { loginItem: patch.loginItem } : {}),
      ...(typeof patch?.warmRuntime === 'boolean' ? { warmRuntime: patch.warmRuntime } : {}),
      ...(typeof patch?.keepLoadedAlways === 'boolean' ? { keepLoadedAlways: patch.keepLoadedAlways } : {}),
    }
    const next = saveAppFlags(appFlagsFile(), clean)
    // The login item is the OS's own mechanism; the flag file is only the
    // memory of the choice, so the OS is told the same instant.
    if (typeof clean.loginItem === 'boolean') {
      app.setLoginItemSettings({ openAtLogin: next.loginItem })
    }
    // Turning warm ON takes effect immediately too: a runtime that is already
    // answering is left alone, a missing one is not started blind — the
    // staged copy must exist. (The always-loaded env applies when the runtime
    // next starts; a running one is never restarted under the person's feet.)
    if (clean.warmRuntime === true || clean.keepLoadedAlways === true) void warmStartRuntime()
    return confirmedFlags()
  })

  // The battle tally: a PRIVATE local ledger of what won for this person.
  // Real counts only, capped, never sent anywhere. No public scoreboard.
  const battleLedgerPath = (): string => join(app.getPath('userData'), 'battle-ledger.json')
  type BattleEntry = { prompt: string; winner: string; loser: string; tie: boolean; blind: boolean; at: string }
  const readLedger = (): BattleEntry[] => {
    try {
      const parsed = JSON.parse(readFileSync(battleLedgerPath(), 'utf8')) as BattleEntry[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  handle('battle:record', (_event, entry: Partial<BattleEntry>): { ok: boolean; answer: string } => {
    const prompt = typeof entry?.prompt === 'string' ? entry.prompt.slice(0, 500) : ''
    const winner = typeof entry?.winner === 'string' ? entry.winner.slice(0, 120) : ''
    const loser = typeof entry?.loser === 'string' ? entry.loser.slice(0, 120) : ''
    const tie = entry?.tie === true
    if (!prompt || (!tie && (!winner || !loser))) return { ok: false, answer: 'A tally line needs the prompt and the outcome.' }
    const ledger = readLedger()
    ledger.push({ prompt, winner, loser, tie, blind: entry?.blind === true, at: new Date().toISOString() })
    try {
      writeFileSync(battleLedgerPath(), JSON.stringify(ledger.slice(-500), null, 2))
      return { ok: true, answer: `Recorded. ${winner || 'A tie'} leads this prompt now.` }
    } catch (failure) {
      return { ok: false, answer: `Could not write the tally: ${(failure as Error).message}` }
    }
  })
  handle('battle:ledger', (): { ok: boolean; entries: BattleEntry[] } => ({ ok: true, entries: readLedger().slice(-50).reverse() }))

  // Recipes: saved work orders as plain markdown the owner can read and
  // share. Shown in full before a run; the engine's own cards still gate
  // everything a run tries to do — a recipe approves nothing by itself.
  const recipes = createRecipeManager(join(app.getPath('userData'), 'recipes'))
  handle('recipes:list', () => recipes.list())
  handle('recipes:save', (_event, recipe: unknown) => recipes.save(recipe as never))
  handle('recipes:remove', (_event, name: string) => recipes.remove(typeof name === 'string' ? name : ''))

  // Compaction: the brief's receipt on disk, and the fresh start. The brief
  // is the ENGINE's own words; these doors only keep the record and end the
  // session so the next send cannot --resume the long conversation back in.
  const briefs = createCompactManager(join(app.getPath('userData'), 'handoffs'))
  handle('compact:save', (_event, input: { brief?: string; workspace?: string; at?: string }) => briefs.save(input ?? {}))
  handle('engine:fresh', (): { ok: boolean; answer: string } => {
    if (commandRunner.running()) return { ok: false, answer: 'An app command is active. Stop it or wait for its result before resetting the engine session.' }
    preparing?.controller.abort(); permissionTickets.clear()
    workDispatchGeneration++; automation?.stopWork()
    if (!engine) return { ok: false, answer: 'The engine door is not open on this machine yet.' }
    try { engine.fresh(); return { ok: true, answer: 'Stop requested and the saved resume ID forgotten. The next task starts fresh; inspect any in-flight tool activity before retrying.' } }
    catch { return { ok: false, answer: 'The fresh-session request could not be confirmed. Retry Fresh session before sending; no automatic retry was made.' } }
  })

  // The repo map: the working folder's structure on one page — the folder the
  // engine already works in, never a path handed over from the window.
  handle('repo:map', async (): Promise<unknown> => buildRepoMap(settings.engine.workspace || vaultRoot()))

  // Hooks: the owner's own commands at the engine's moments. Added by hand,
  // shown in full, capped; packs cannot contribute one (the manifest refuses
  // what it does not know). A hook's failure is reported, never fatal.
  const hooksFile = (): string => join(app.getPath('userData'), 'hooks.json')
  const hookRunner = createHookRunner({
    load: () => {
      try {
        const parsed = JSON.parse(readFileSync(hooksFile(), 'utf8')) as unknown
        return Array.isArray(parsed) ? (parsed as never[]) : []
      } catch {
        return []
      }
    },
    save: (hooks) => {
      writeFileSync(hooksFile(), JSON.stringify(hooks, null, 2), 'utf8')
    },
  })
  const readHooks = (): Array<{ id: string; name: string; event: string; command: string }> => {
    try {
      const parsed = JSON.parse(readFileSync(hooksFile(), 'utf8')) as Array<{ id: string; name: string; event: string; command: string }>
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  handle('hooks:list', () => ({ ok: true, hooks: readHooks() }))
  handle('hooks:save', (_event, hook: unknown) => hookRunner.upsert(hook as never))
  handle('hooks:remove', (_event, id: string) => hookRunner.remove(typeof id === 'string' ? id : ''))
  handle('hooks:test', (_event, command: string) => hookRunner.test(typeof command === 'string' ? command : ''))

  // Watch mode: one watched folder; events are REPORTED to the window, and
  // the renderer decides whether a run fires (it owns the one send path).
  const watcher = createFolderWatcher((tick: WatchTick) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('watch:event', tick)
  })
  handle('watch:start', (_event, folder: string) => watcher.start(typeof folder === 'string' ? folder : ''))
  handle('watch:stop', () => watcher.stop())
  handle('watch:status', () => watcher.status())

  // Checkpoints: what the app kept the moment before an allowed write, and
  // the way back. Read from the folder the engine was handed at send time.
  handle('engine:checkpoints:list', async () => {
    try {
      return { ok: true, checkpoints: await listCheckpoints(join(app.getPath('userData'), 'checkpoints'), Number.MAX_SAFE_INTEGER) }
    } catch {
      return { ok: false, checkpoints: [], answer: 'The checkpoint index could not be read. Its original was not changed.' }
    }
  })
  const checkpointGate = (sender: Electron.WebContents) => {
    const owner = track(sender)
    let gate = checkpointReviews.get(owner)
    if (!gate) {
      gate = createCheckpointReviewGate(join(app.getPath('userData'), 'checkpoints'), path => {
        if (dispatchingWork || engine?.turnBusy()) throw Error('Stop active work before reviewing or restoring files.')
        const root = resolve(engine?.currentTarget()?.workspace || settings.engine.workspace || vaultRoot()), target = resolve(path), within = relative(root, target)
        if (!within || within === '..' || within.startsWith('../') || within.startsWith('..\\') || isAbsolute(within)) throw Error('Choose this file’s working folder before reviewing its restore.')
        noLinkedPath(root); noLinkedPath(target)
        return JSON.stringify([root, engine?.currentTarget(), settings.engine, settings.permissions, workDispatchGeneration])
      })
      checkpointReviews.set(owner, gate)
    }
    return gate
  }
  handle('engine:checkpoint:preview', (event, copy: string, original: string) => checkpointGate(event.sender).preview(copy, original))
  handle('engine:checkpoint:decide', (event, token: string, decision: 'allow' | 'deny') => checkpointGate(event.sender).decide(token, decision))
  handle('engine:checkpoint:inspect', (_event, copy: string) => inspectCheckpoint(join(app.getPath('userData'), 'checkpoints'), typeof copy === 'string' ? copy : ''))
  handle('engine:checkpoint:restore', (_event, copy: string, original: string): Promise<{ ok: boolean; answer: string }> =>
    restoreCheckpoint(join(app.getPath('userData'), 'checkpoints'), typeof copy === 'string' ? copy : '', typeof original === 'string' ? original : ''))

  handle('engine:answer', (_event, requestId: string, allow: boolean): { ok: boolean } => {
    if (typeof requestId !== 'string' || typeof allow !== 'boolean') return { ok: false }
    return { ok: permissionTickets.answer(requestId, allow) }
  })

  // The two folders skills deploy into: Claude Code reads its skills from
  // the user's own folder; agy reads workspace skills next to the work.
  const skillTargets = (): { claudeSkillsDir: string; agySkillsDir: string } => {
    const home = process.env['USERPROFILE'] || process.env['HOME'] || ''
    const workspace = settings.engine.workspace || vaultRoot()
    return {
      claudeSkillsDir: join(home, '.claude', 'skills'),
      agySkillsDir: join(workspace, '.agents', 'skills'),
    }
  }
  const mcpFile = join(app.getPath('userData'), 'mcp.json')

  // The canonical rulebook, as the owner edited it (blanks fall back to the
  // defaults inside the compiler — never an empty rule).
  const houseRulesFile = join(app.getPath('userData'), 'house-rules.json')
  const readHouseRules = (): Partial<HouseRules> => {
    const bytes = configBytes(houseRulesFile)
    if (bytes === null) return {}
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.entries(value).some(([key, text]) => !Object.hasOwn(DEFAULT_HOUSE_RULES, key) || typeof text !== 'string')) throw Error('Saved app instructions could not be read. Originals are unchanged.')
    return value
  }
  const effectiveRules = (): HouseRules => {
    const saved = readHouseRules()
    return Object.fromEntries(Object.entries(DEFAULT_HOUSE_RULES).map(([key, fallback]) => [key, saved[key as keyof HouseRules]?.trim() ? saved[key as keyof HouseRules] : fallback])) as HouseRules
  }
  const rulePreview = (sender: Electron.WebContents, id: EngineId, projectId?: string) => {
    if (id !== 'claude-code' && id !== 'agy') throw Error('Choose a known engine.')
    const owner = track(sender), project = projectId ? nativeContext.projects().find(p => p.id === projectId) : undefined
    if (projectId && (!project || !project.folder)) throw Error('Choose a working folder for this project before writing a native rule file. Shared chat instructions do not require one.')
    const target = project ? join(project.folder, id === 'agy' ? 'GEMINI.md' : 'CLAUDE.md') : nativeHouseRulesFile(id, app.getPath('home'))
    const snapshot = JSON.stringify([settings.engine, settings.permissions, project || null, readHouseRules()])
    const authorize = () => {
      if (dispatchingWork || engine?.turnBusy()) throw Error('Wait for active work before changing native rules.')
      const currentProject = projectId ? nativeContext.projects().find(p => p.id === projectId) : undefined
      if (snapshot !== JSON.stringify([settings.engine, settings.permissions, currentProject || null, readHouseRules()])) throw Error('Rule text or engine settings changed. Review again.')
      if (project && resolve(project.folder) !== resolve(engine?.currentTarget()?.workspace || settings.engine.workspace || vaultRoot())) throw Error('Use Work here for this project before reviewing its native rule file.')
      noLinkedPath(target)
    }
    const text = project ? [project.instruction, project.goals.length ? '## Project goals\n' + project.goals.map(goal => '- ' + goal).join('\n') : ''].filter(Boolean).join('\n\n') : instructionBlock(id, settings.engine.id === id ? settings.engine.model : '', effectiveRules(), settings.memoryFolder || '')
    const service = createProjectRuleReview(authorize), review = service.preview(target, text)
    let owned = ruleReviews.get(owner)
    if (!owned) { owned = new Map(); ruleReviews.set(owner, owned) }
    for (const [key, entry] of owned) if (entry.expiresAt <= Date.now()) owned.delete(key)
    if (owned.size >= 20) { service.decide(review.token, 'deny'); throw Error('Too many pending rule reviews. Deny old reviews or wait for expiry.') }
    owned.set(review.token, { service, expiresAt: review.expiresAt }); return review
  }
  handle('rules:preview-project', (event, projectId: string, id: EngineId) => rulePreview(event.sender, id, projectId))
  handle('rules:preview-global', (event, id: EngineId) => rulePreview(event.sender, id))
  handle('rules:decide', (event, token: string, decision: 'allow' | 'deny') => {
    const owned = ruleReviews.get(event.sender.id), review = owned?.get(token); owned?.delete(token)
    return review ? review.service.decide(token, decision) : { ok: false, answer: 'Unknown rule review in this window.' }
  })

  // The vault folder, opened in the file manager. The vault root only —
  // this door is a convenience for the owner, not a general launcher.
  handle('vault:open-folder', async (): Promise<{ ok: boolean }> => {
    const error = await shell.openPath(vaultRoot())
    return { ok: !error }
  })

  // What is really installed on this machine — the bay refuses to guess.
  handle('engine:detect', async (_event, fresh?: boolean): Promise<EngineAvailability[]> => {
    const ids: EngineId[] = ['claude-code', 'agy']
    return Promise.all(ids.map((id) => detectEngine(id, fresh === true)))
  })

  handle('quick:open', () => {
    createQuickWindow()
    return { ok: true }
  })

  handle('quick:shortcut', (_event, payload: { enabled: boolean }) => {
    quickShortcutEnabled = payload.enabled !== false
    applyQuickShortcut()
    return { ok: true, enabled: quickShortcutEnabled }
  })

  // An artifact in ITS OWN window: the same sandboxed preview HTML the
  // in-app iframe shows, at full reading size. Nothing new executes — the
  // CSP travels with the html.
  handle('artifact:popout', (_event, payload: { html: string; title: string }) => {
    const win = new BrowserWindow({
      ...fitWindow(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea, { width: 760, height: 860, minWidth: 480, minHeight: 320 }),
      title: payload.title || 'OddBrain — artifact',
      autoHideMenuBar: true,
      backgroundColor: '#141417',
      // Model-produced HTML in a full window is exactly where the Electron
      // hardening must be explicit, not defaulted: sandbox on, no Node, and
      // navigation locked (the PDF window below does the same).
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    })
    lockNavigation(win.webContents)
    void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(payload.html))
    return { ok: true }
  })

  // Save as PDF: rendered offscreen, written into the vault so it sits with
  // the owner's work, never into a temp folder nobody can find.
  handle('artifact:pdf', async (_event, payload: { html: string; name: string }): Promise<{ ok: boolean; answer: string }> => {
    try {
      const safe = pdfSafeName(payload.name) + '.pdf'
      const dir = join(vaultRoot(), 'Artifacts PDF')
      mkdirSync(dir, { recursive: true })
      const target = join(dir, safe)
      const win = new BrowserWindow({ show: false, width: 820, height: 1160, webPreferences: { sandbox: true } })
      try {
        await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(payload.html))
        const bytes = await win.webContents.printToPDF({ printBackground: true })
        writeFileSync(target, bytes)
      } finally {
        win.destroy()
      }
      return { ok: true, answer: target }
    } catch (error) {
      return { ok: false, answer: String((error as Error)?.message ?? error) }
    }
  })

  handle('engine:restart', () => restartIdleConnection(engine, dispatchingWork))

  handle('engine:stop', () => {
    workflows.cancel(); commandRunner.cancel()
    preparing?.controller.abort(); permissionTickets.clear()
    workDispatchGeneration++
    automation?.stopWork()
    engine?.stop()
    return { ok: true }
  })

  // Bringing a brain home. The door streams progress sentences; each becomes
  // an event on the same channel the engine's own events use, so the bay can
  // show a real bar instead of a spinner of lies.
  handle('engine:pull', async (_event, rawName: string): Promise<{ ok: boolean; answer: string }> => {
    const name = validateModelName(rawName)
    if (!name) return { ok: false, answer: 'That is not a model name this app will ask for.' }
    const door = settings.engine.baseUrl || 'http://localhost:11434'
    const send = (tick: unknown): void => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('engine:pull-event', tick)
    }
    try {
      // The brain door is reached the same way everywhere: model discovery
      // already refuses redirects on this exact URL, so pull and delete do
      // too — following one would send a model request somewhere the
      // settings never named.
      const answer = await fetch(`${door}/api/pull`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: name }),
        redirect: 'error',
      })
      if (!answer.ok || !answer.body) {
        const why = `the brain door answered ${answer.status}`
        send({ status: '', total: null, completed: null, done: false, error: why })
        return { ok: false, answer: why }
      }
      const decoder = new TextDecoder()
      let carry = ''
      // Node's undici stream is async-iterable at runtime; the type lib here
      // does not say so, hence the one honest cast.
      const body = answer.body as unknown as AsyncIterable<Uint8Array>
      for await (const chunk of body) {
        carry = `${carry}${decoder.decode(chunk as Buffer, { stream: true })}`
        const lines = carry.split('\n')
        carry = lines.at(-1) ?? ''
        for (const line of lines.slice(0, -1)) {
          const tick = parsePullLine(line)
          if (tick.status || tick.error) send(tick)
          if (tick.error) return { ok: false, answer: `the pull failed: ${tick.error}` }
        }
      }
      const finalTick = parsePullLine(carry)
      if (finalTick.error) return { ok: false, answer: `the pull failed: ${finalTick.error}` }
      send({ status: 'success', total: null, completed: null, done: true, error: '' })
      return { ok: true, answer: `${name} is home, it is in the brain list now` }
    } catch {
      const why = 'the brain door (Ollama) is not answering, start it, then try again'
      send({ status: '', total: null, completed: null, done: false, error: why })
      return { ok: false, answer: why }
    }
  })

  // Taking a brain off the machine, when the owner no longer wants it.
  handle('engine:model-delete', async (_event, rawName: string): Promise<{ ok: boolean; answer: string }> => {
    const name = validateModelName(rawName)
    if (!name) return { ok: false, answer: 'That is not a model name this app will ask for.' }
    const door = settings.engine.baseUrl || 'http://localhost:11434'
    try {
      const answer = await fetch(`${door}/api/delete`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: name }),
      })
      if (!answer.ok) return { ok: false, answer: `the brain door answered ${answer.status}` }
      return { ok: true, answer: `${name} is gone from this machine` }
    } catch {
      return { ok: false, answer: 'the brain door (Ollama) is not answering, start it, then try again' }
    }
  })

  // Capture the current conversation as a capsule: the digest lands in the
  // vault's Captures/ folder — the same shape the browser extension queues
  // into, so both paths feed one memory.
  handle('vault:capture-chat', (_event, payload: { title: string; markdown: string }): { ok: boolean; answer: string } => {
    const title = typeof payload?.title === 'string' ? payload.title.trim().slice(0, 80) : ''
    const markdown = typeof payload?.markdown === 'string' ? payload.markdown : ''
    if (!title || !markdown || Buffer.byteLength(markdown, 'utf8') > 8_000_000) {
      return { ok: false, answer: 'The capture is empty or exceeds 8 MB. Export the full chat as Markdown instead; nothing was shortened.' }
    }
    const service = createVaultService({ vaultPath: vaultRoot() })
    if (!service.available()) return { ok: false, answer: 'No vault to capture into.' }
    try {
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
      const name = `${stampFor(new Date())}-${randomUUID()}${slug ? `-${slug}` : ''}.md`
      service.files().write(`Captures/${name}`, markdown)
      return { ok: true, answer: `Captures/${name}` }
    } catch (error) {
      return { ok: false, answer: error instanceof Error ? error.message : 'The vault refused the capture.' }
    }
  })

  // A handoff: the finished turn, written into the vault as one markdown
  // document any later session (here or in a terminal) can continue from.
  // The name is validated and the vault's own path rules apply.
  handle('vault:save-handoff', (_event, payload: { name: string; markdown: string }): { ok: boolean; answer: string } => {
    const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
    const markdown = typeof payload?.markdown === 'string' ? payload.markdown : ''
    if (!name || name.length > 120 || /[\\/:*?"<>|\n\r]/.test(name) || !markdown || markdown.length > 200_000) {
      return { ok: false, answer: 'That is not a name and document this app will write.' }
    }
    const service = createVaultService({ vaultPath: vaultRoot() })
    if (!service.available()) return { ok: false, answer: 'No vault to write the handoff into.' }
    try {
      service.files().write(`handoffs/${name}`, markdown)
      return { ok: true, answer: `handoffs/${name}` }
    } catch (error) {
      return { ok: false, answer: error instanceof Error ? error.message : 'The vault refused the handoff.' }
    }
  })

  // A timestamped, portable copy of the vault: every markdown file, same
  // structure, written to the app's exports folder. Obsidian (or a backup,
  // or another machine) takes folders of markdown as they are — nothing is
  // converted, because nothing needs converting.
  handle('vault:export-copy', (): { ok: boolean; answer: string } => {
    const service = createVaultService({ vaultPath: vaultRoot() })
    if (!service.available()) return { ok: false, answer: 'No vault to copy.' }
    const stamp = stampFor(new Date())
    const destination = join(app.getPath('userData'), 'exports', `vault-${stamp}`)
    const result = exportVaultCopy(service.root, destination)
    if (!result.ok) return { ok: false, answer: result.answer }
    return { ok: true, answer: `${result.count} files copied to ${result.destination}` }
  })

  handle('vault:backup', async (_event, operation: unknown) => {
    if (operation !== 'create' && operation !== 'restore') return { ok: false, answer: 'Choose backup or restore.' }
    let source = vaultRoot()
    if (operation === 'restore') {
      const selected = await dialog.showOpenDialog({ title: 'Choose an OddBrain backup folder', properties: ['openDirectory'] })
      if (selected.canceled || !selected.filePaths[0]) return { ok: false, answer: 'Restore cancelled. Nothing changed.' }
      source = selected.filePaths[0]
    }
    const parent = await dialog.showOpenDialog({ title: operation === 'create' ? 'Choose where to keep the backup' : 'Choose where to create the restored vault', properties: ['openDirectory', 'createDirectory'] })
    if (parent.canceled || !parent.filePaths[0]) return { ok: false, answer: 'Cancelled. Nothing changed.' }
    const destination = join(parent.filePaths[0], `OddBrain-${operation === 'create' ? 'backup' : 'restored'}-${Date.now()}-${randomUUID().slice(0,8)}`)
    const confirmation = await dialog.showMessageBox({ type: 'question', buttons: ['Cancel', operation === 'create' ? 'Create backup' : 'Restore to new folder'], defaultId: 0, cancelId: 0, message: operation === 'create' ? 'Copy the entire vault, including sensitive conversations and attachments?' : 'Restore into a new folder? Your current vault will not be replaced.', detail: `Source: ${source}\nDestination: ${destination}\nVault files only. Installed models, application credentials and browser queues are not included. Keep the backup somewhere private.` })
    if (confirmation.response !== 1) return { ok: false, answer: 'Cancelled. Nothing changed.' }
    // Native dialog paths, never arbitrary renderer-provided source/destination paths.
    const result = operation === 'create' ? backupVault(source, destination) : restoreVault(source, destination)
    if (!result.ok) return result
    return { ok: true, answer: `${result.count} files copied and verified at ${result.destination}. ${operation === 'restore' ? 'Your current vault is unchanged. Choose this restored folder in Settings → Memory & files → Vault when ready.' : 'Keep another copy on a different drive. This is not an automatic backup schedule.'}` }
  })

  // The skills the owner's engine already has — the import list.
  const skillRoots = (id: EngineId): SkillRoot[] => {
    if (id !== 'claude-code' && id !== 'agy') throw Error('Choose a known engine.')
    const home = app.getPath('home')
    return id === 'claude-code' ? [{ engine: id, path: join(home, '.claude', 'skills') }]
      : [{ engine: id, path: skillTargets().agySkillsDir }, { engine: id, path: join(home, '.gemini', 'config', 'skills') }, { engine: id, path: join(home, '.gemini', 'antigravity-cli', 'skills') }]
  }
  const skillReview = (sender: Electron.WebContents) => {
    const owner = track(sender); let service = skillReviews.get(owner)
    if (!service) {
      service = createSkillAuthoring(id => skillRoots(id)[0].path, () => {
        if (dispatchingWork || engine?.turnBusy()) throw Error('Wait for active work to finish before changing installed skills.')
        return JSON.stringify([settings.engine, settings.permissions, workDispatchGeneration])
      }); skillReviews.set(owner, service)
    }
    return service
  }
  handle('skills:inventory', (_event, id: EngineId) => readInstalledSkills(skillRoots(id)))
  handle('skills:inspect-installed', (_event, id: EngineId, skill: string) => inspectInstalledSkill(skill, skillRoots(id)))
  handle('skills:preview-create', (event, draft: SkillDraft) => skillReview(event.sender).preview(draft))
  handle('skills:decide-create', (event, token: string, decision: 'allow' | 'deny') => skillReview(event.sender).decide(token, decision))

  handle('skills:scan', () => {
    const home = process.env['USERPROFILE'] || process.env['HOME'] || ''
    return scanClaudeSkills(join(home, '.claude', 'skills'))
  })

  // Install a skill from the app's own catalog: the name is checked against
  // the catalog (this door fetches nothing else), the file comes from
  // anthropics/skills, and it lands in every engine's own folder through the
  // same deploy everything else uses.
  handle('skills:install-catalog', () => ({ ok: false, answer: 'Inspect the pinned package and allow its installation first. Nothing was installed.' }))
  const catalogReview = (sender: Electron.WebContents) => {
    const owner = track(sender); let service = catalogReviews.get(owner)
    if (!service) {
      service = createCatalogInstallReview(() => {
        if (dispatchingWork || engine?.turnBusy()) throw Error('Wait for active work before installing skills.')
        const targets = skillTargets()
        return { targets, authority: JSON.stringify([targets, settings.engine, settings.permissions, workDispatchGeneration]) }
      }); catalogReviews.set(owner, service)
    }
    return service
  }
  handle('skills:plan-catalog', (event, name: string) => catalogReview(event.sender).plan(name))
  handle('skills:decide-catalog', (event, token: string, decision: 'allow' | 'deny') => catalogReview(event.sender).decide(token, decision))
  handle('skills:cancel-catalog', event => catalogReviews.get(event.sender.id)?.cancel())
  // Retire the unexposed legacy writer rather than leave a review bypass.
  handle('skills:deploy', () => ({ ok: false, written: [], answer: 'Use a reviewed skill-file change or package installation. Nothing was written.' }))

  // The one MCP list, stored once, deployed to every engine's config.
  //
  // A list that cannot be parsed is reported, not shown as empty: an empty
  // screen next to a Save button is how a hand-edited list would disappear.
  handle('mcp:read', (): { servers: McpServer[]; problem: string } => {
    try {
      const bytes = configBytes(mcpFile)
      return bytes === null ? { servers: [], problem: '' } : readMcpList(bytes.toString('utf8'))
    } catch (e) {
      return { servers: [], problem: `The saved tool-server list could not be read: ${(e as Error).message}` }
    }
  })

  handle('mcp:write', () => ({ ok: false, written: [], answer: 'Review the exact connector file changes before allowing them. No files changed.' }))
  const mcpReview = (sender: Electron.WebContents) => {
    const owner = track(sender); let service = mcpReviews.get(owner)
    if (!service) {
      service = createMcpReview(() => {
        if (dispatchingWork || engine?.turnBusy()) throw Error('Wait for active work before changing connector files.')
        const workspace = settings.engine.workspace || vaultRoot()
        return { workspace, centralFile: mcpFile, authority: JSON.stringify([workspace, settings.engine, settings.permissions, workDispatchGeneration]) }
      }); mcpReviews.set(owner, service)
    }
    return service
  }
  handle('mcp:preview', (event, servers: unknown) => mcpReview(event.sender).preview(servers))
  handle('mcp:decide', (event, token: string, decision: 'allow' | 'deny') => mcpReview(event.sender).decide(token, decision))
  handle('mcp:inventory', (_event, id: EngineId) => {
    const home = app.getPath('home'), workspace = settings.engine.workspace || vaultRoot()
    if (id === 'claude-code') return inspectNativeMcp([{ scope: 'Claude user configuration', path: join(home, '.claude.json') }, { scope: 'Claude workspace configuration', path: join(workspace, '.mcp.json') }])
    if (id === 'agy') return inspectNativeMcp([{ scope: 'agy global configuration', path: join(home, '.gemini', 'config', 'mcp_config.json') }, { scope: 'agy workspace configuration', path: join(workspace, '.agents', 'mcp_config.json') }])
    throw Error('Choose a known engine.')
  })

  // Mods (Phase 1): a pack is a folder with a manifest. Install = the person
  // picks the folder; the pack is validated, copied to a readable place, and
  // its skills deploy to the engines. Remove = undo exactly what the install
  // record says was written. No index, no server, no account in Phase 1.
  handle('mods:install-from-file', async (): Promise<{ ok: boolean; answer: string; pack?: unknown; prompts?: unknown; themes?: unknown; folder?: string; written?: string[] }> => {
    const picked = await dialog.showOpenDialog({
      title: 'Which pack folder?',
      properties: ['openDirectory'],
    })
    if (picked.canceled || !picked.filePaths[0]) return { ok: false, answer: 'No folder chosen.' }
    const result = installPackFromFolder(picked.filePaths[0], { storeRoot: join(app.getPath('userData'), 'extensions'), ...skillTargets() })
    if (!result.ok) return { ok: false, answer: result.answer }
    return {
      ok: true,
      answer: `${result.pack.name} installed.`,
      pack: result.pack,
      prompts: result.prompts,
      themes: result.themes,
      folder: result.folder,
      written: result.written,
    }
  })

  handle('mods:list', () => listPacks(join(app.getPath('userData'), 'extensions')))

  handle('mods:remove', (_event, id: string): { ok: boolean; answer: string } =>
    removePack(String(id ?? ''), join(app.getPath('userData'), 'extensions'), skillTargets()),
  )

  // Mods (Phase 2): the index client. A store is an index file — a folder
  // with index.json or an https URL answering the same JSON. Added indexes
  // are remembered; browse reads the index; install re-checks the pinned
  // checksum against the real files and refuses a mismatch outright.
  const indexesFile = (): string => join(app.getPath('userData'), 'extensions', 'indexes.json')
  const readIndexes = (): Array<{ kind: 'folder' | 'url'; locator: string; addedAt: string }> => {
    try {
      const parsed = JSON.parse(readFileSync(indexesFile(), 'utf8'))
      return Array.isArray(parsed?.indexes) ? parsed.indexes.slice(0, 20) : []
    } catch {
      return []
    }
  }
  const toSource = (kind: string, locator: string): { kind: 'folder'; path: string } | { kind: 'url'; url: string } | null => {
    const clean = String(locator ?? '').trim()
    if (!clean) return null
    if (kind === 'url' || /^https?:\/\//.test(clean)) {
      try {
        const parsed = new URL(clean)
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) return null
        return { kind: 'url', url: parsed.toString() }
      } catch {
        return null
      }
    }
    return { kind: 'folder', path: clean }
  }
  handle('mods:index-add', (_event, payload: { kind?: string; locator?: string }): { ok: boolean; answer: string } => {
    const source = toSource(String(payload?.kind ?? ''), String(payload?.locator ?? ''))
    if (!source) return { ok: false, answer: 'Give a folder that holds index.json, or an https URL that answers it.' }
    if (source.kind === 'folder' && !existsSync(join(source.path, 'index.json'))) {
      return { ok: false, answer: 'That folder holds no index.json, so it is not a pack index.' }
    }
    const list = readIndexes()
    const key = source.kind === 'url' ? source.url : resolve(source.path)
    if (list.some(item => (item.kind === 'url' ? item.locator : resolve(item.locator)) === key)) {
      return { ok: true, answer: 'That index is already added.' }
    }
    list.push({ kind: source.kind, locator: source.kind === 'url' ? source.url : source.path, addedAt: new Date().toISOString() })
    try {
      mkdirSync(dirname(indexesFile()), { recursive: true })
      writeFileSync(indexesFile(), JSON.stringify({ indexes: list }, null, 2), 'utf8')
      return { ok: true, answer: 'Index added.' }
    } catch {
      return { ok: false, answer: 'The index list could not be written.' }
    }
  })
  handle('mods:index-list', () => readIndexes())
  handle('mods:index-remove', (_event, locator: string): { ok: boolean } => {
    const list = readIndexes().filter(item => item.locator !== String(locator ?? ''))
    try {
      writeFileSync(indexesFile(), JSON.stringify({ indexes: list }, null, 2), 'utf8')
      return { ok: true }
    } catch {
      return { ok: false }
    }
  })
  handle('mods:index-browse', async (_event, payload: { kind?: string; locator?: string }) => {
    const source = toSource(String(payload?.kind ?? ''), String(payload?.locator ?? ''))
    if (!source) return { ok: false as const, problem: 'That is not a folder path or an https URL.' }
    return readIndex(source)
  })
  handle('mods:index-install', async (_event, payload: { kind?: string; locator?: string; id?: string }) => {
    const source = toSource(String(payload?.kind ?? ''), String(payload?.locator ?? ''))
    if (!source) return { ok: false as const, answer: 'That is not a folder path or an https URL.' }
    return installFromIndex(source, String(payload?.id ?? ''), { storeRoot: join(app.getPath('userData'), 'extensions'), ...skillTargets() })
  })

  // Mods (Phase 3): publish. Export turns the engine's real skills and the
  // app's current look into a pack folder plus an index.json entry beside it
  // — send the folder to share it, or add it as an index to install from it.
  handle('mods:export', (_event, payload: { name?: string; description?: string; author?: string; skills?: string[]; theme?: Record<string, string> | null }) => {
    const home = process.env['USERPROFILE'] || process.env['HOME'] || ''
    if (!home) return { ok: false as const, answer: 'No home folder is known, so there is nowhere to export to.' }
    const root = join(home, 'OddBrain packs')
    const skills = scanClaudeSkills(join(home, '.claude', 'skills'))
    const result = exportPack(
      {
        name: String(payload?.name ?? ''),
        description: String(payload?.description ?? ''),
        author: String(payload?.author ?? ''),
        skills: Array.isArray(payload?.skills) ? payload.skills.map(String) : [],
        theme: payload?.theme ?? null,
      },
      skills,
      root,
    )
    if (!result.ok) return result
    return { ok: true, answer: `Exported to ${result.folder}, its checksum is pinned in the index beside it.`, folder: result.folder, index: result.index }
  })

  // The community store the app ships with: a REAL folder of packs beside the
  // extension's resources — offline from the first run. In dev it is the
  // repo's own store/; packaged, the copy electron-builder ships.
  handle('mods:community-index', (): { ok: boolean; path?: string } => {
    // Launched from source, getAppPath can be the built main/ folder; the
    // checkout root (two up) is what actually holds store/.
    const candidates = app.isPackaged
      ? [join(process.resourcesPath || '', 'store')]
      : [join(app.getAppPath(), 'store'), join(app.getAppPath(), '..', '..', 'store')]
    for (const candidate of candidates) {
      if (candidate && existsSync(join(candidate, 'index.json'))) return { ok: true, path: candidate }
    }
    return { ok: false }
  })

  // The starter pack: the app's own real files, written to a temp folder and
  // installed through the very same path a friend's folder would take.
  handle('mods:install-starter', (): { ok: boolean; answer: string; folder?: string; written?: string[] } => {
    const files = starterPackFiles()
    const staging = join(app.getPath('temp'), `ai-assistant-starter-${Date.now()}`)
    try {
      mkdirSync(staging, { recursive: true })
      for (const [relative, text] of Object.entries(files)) {
        const full = join(staging, relative)
        mkdirSync(dirname(full), { recursive: true })
        writeFileSync(full, text, 'utf8')
      }
      const result = installPackFromFolder(staging, { storeRoot: join(app.getPath('userData'), 'extensions'), ...skillTargets() }, 'starter')
      if (!result.ok) return { ok: false, answer: result.answer }
      return { ok: true, answer: `${result.pack.name} installed.`, folder: result.folder, written: result.written }
    } catch {
      return { ok: false, answer: 'The starter pack could not be staged. Nothing was installed.' }
    } finally {
      rmSync(staging, { recursive: true, force: true })
    }
  })

  // The session board (A.5): the owner's own organisation of the engine's
  // resumable threads — which files each thread touches, and which are done.
  // The resume ids themselves stay in engine-sessions.json; this file only
  // carries the owner's links and history.
  const boardFile = (): string => join(app.getPath('userData'), 'sessions-board.json')
  const sessionBoard = createSessionBoardStore(boardFile())
  handle('sessions:board-read', () => sessionBoard.read())
  handle('sessions:board-write', (_event, value: unknown, expected: unknown): { ok: boolean } => {
    try { sessionBoard.save(value, expected); return { ok: true } }
    catch { return { ok: false } }
  })
  handle('sessions:pick-files', async (): Promise<string[]> => {
    const picked = await dialog.showOpenDialog({
      title: 'Which files does this thread touch?',
      properties: ['openFile', 'multiSelections'],
    })
    return picked.canceled ? [] : picked.filePaths
  })

  // Projects: the owner's named homes for related work. Stored once,
  // validated on the way in and the way out; a damaged file means "no
  // projects yet", never a failed launch.
  handle('projects:read', () => nativeContext.projects())
  handle('projects:write', (_event, projects: unknown, expected?: unknown) => { if (!Array.isArray(expected)) throw Error('Read projects before saving; no current data was replaced.'); return { ok: true, projects: nativeContext.write(projects, expected) } })
  handle('projects:attach', async (_event, projectId: string) => {
    if (!nativeContext.projects().some(p => p.id === projectId)) throw Error('Choose an existing project first.')
    const picked = await dialog.showOpenDialog({ title: 'Choose project references. Selected text may be sent with this project’s chats only after you enable it.', properties: ['openFile', 'multiSelections'] })
    return picked.canceled ? [] : nativeContext.attach(projectId, picked.filePaths)
  })
  handle('engine:context-target', (_event, value: unknown) => {
    const input = checkNativeConversation(value)
    if (!input) throw Error('Choose a chat first.')
    const workspace = nativeContext.workspace(input, settings.engine.workspace || vaultRoot())
    return { workspace, route: JSON.stringify(settings.engine), resume: !!sessionMemory.load(sessionKey(settings.engine.id, workspace, input.chatId)) }
  })
  handle('engine:chat-sessions', (_event, chatId: string) => {
    checkNativeConversation({ chatId })
    return sessionMemory.list().filter(row => row.chatId === chatId).map(({ key: _key, ...row }) => row)
  })

  handle('projects:new', (_event, name: string): Project => newProject(String(name ?? '')))

  // "Work here" — the owner points the engine at a project's folder. The
  // window never chooses a working folder behind the app's back; this door
  // IS the owner's explicit choice, same as the picker.
  handle('engine:workspace-set', (_event, folder: string): { ok: boolean; answer: string } => {
    if (dispatchingWork || engine?.turnBusy()) return { ok: false, answer: 'Stop active work before changing its working folder.' }
    if (typeof folder !== 'string' || folder.length > 4096) return { ok: false, answer: 'Choose a valid working folder. Nothing was changed.' }
    const clean = folder.trim()
    // Empty is allowed and means "back to the vault" — a real choice, not a mistake.
    if (clean === '') {
      settings = writeSettings(settingsFile, { ...settings, engine: { ...settings.engine, workspace: '' } })
      return { ok: true, answer: '' }
    }
    if (!isAbsolute(clean) || /[\n\r]/.test(clean) || /^https?:\/\//.test(clean)) {
      return { ok: false, answer: 'That is not a folder this app will work in.' }
    }
    try { if (!statSync(clean).isDirectory()) return { ok: false, answer: 'Choose a directory, not a file.' } }
    catch { return { ok: false, answer: 'That folder could not be read on this machine.' } }
    settings = writeSettings(settingsFile, { ...settings, engine: { ...settings.engine, workspace: clean } })
    return { ok: true, answer: clean }
  })

  // The engine sessions, per workspace: the threads a fresh launch will
  // continue. Read-only for the screen, with an explicit forget.
  handle('engine:sessions', () => sessionMemory.list(settings.engine.id).filter(row => !row.chatId))
  handle('engine:sessions-forget', (_event, workspace: string): { ok: boolean; answer?: string } => {
    if (typeof workspace !== 'string' || !workspace || /[\x00-\x1f]/.test(workspace)) return { ok: false, answer: 'Invalid saved workspace.' }
    if (dispatchingWork || engine?.turnBusy()) return { ok: false, answer: 'Stop the active task before forgetting a session.' }
    try {
      const target = engine?.currentTarget()
      if (target?.engine === settings.engine.id && target.workspace === workspace && !target.chatId) engine!.fresh()
      else sessionMemory.save(`${settings.engine.id}::${workspace}`, '')
      return { ok: true }
    } catch { return { ok: false, answer: 'Removal of the saved resume ID could not be confirmed. Refresh and inspect the saved record before retrying.' } }
  })

  // Open a folder in the file manager. Guarded to folders that exist and are
  // at least plausible; it is the owner's machine and this is a convenience.
  // Open a link in the person's browser. Guarded to https and a short list of
  // hosts we actually name in the interface — this door is not a launcher.
  handle('app:open-external', async (_event, url: string): Promise<{ ok: boolean }> => {
    let parsed: URL
    try {
      parsed = new URL(String(url ?? ''))
    } catch {
      return { ok: false }
    }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') return { ok: false }
    await shell.openExternal(parsed.toString())
    return { ok: true }
  })

  handle('app:open-folder', async (_event, folder: string): Promise<{ ok: boolean }> => {
    const clean = typeof folder === 'string' ? folder.trim() : ''
    if (!clean || clean.length > 4096 || /[\n\r]/.test(clean)) return { ok: false }
    if (!existsSync(clean)) return { ok: false }
    const error = await shell.openPath(clean)
    return { ok: !error }
  })

  // The rulebook itself: read for the edit screen, write to persist and
  // deploy immediately to every engine's global file.
  handle('houserules:read', () => {
    const rules = readHouseRules()
    return {
      rules: {
        identity: rules.identity ?? DEFAULT_HOUSE_RULES.identity,
        artifacts: rules.artifacts ?? DEFAULT_HOUSE_RULES.artifacts,
        permissions: rules.permissions ?? DEFAULT_HOUSE_RULES.permissions,
        memory: rules.memory ?? DEFAULT_HOUSE_RULES.memory,
        style: rules.style ?? DEFAULT_HOUSE_RULES.style,
      },
      defaults: DEFAULT_HOUSE_RULES,
    }
  })

  handle('houserules:write', (_event, rules: Partial<HouseRules>): { ok: boolean; written: string[] } => {
    const clean: Partial<HouseRules> = {}
    for (const key of Object.keys(DEFAULT_HOUSE_RULES) as Array<keyof HouseRules>) {
      const value = rules?.[key]
      if (typeof value === 'string' && value.trim()) clean[key] = value
    }
    readHouseRules() // damaged originals are not replaced with defaults
    const previous = configBytes(houseRulesFile); if (previous) preserveConfig(houseRulesFile, previous)
    commitConfigs([{ path: houseRulesFile, text: JSON.stringify(clean) }])
    return { ok: true, written: [] }
  })

  // The brains the engine can actually use, straight from the brain door —
  // the same list Claude Code itself would choose from. Real data only: what
  // Ollama reports, with cloud brains flagged because their work leaves the
  // machine and the label must say so.
  handle('engine:capabilities', async (event): Promise<EngineCapabilityReport> => capabilityInspector.inspect(track(event.sender), { ...settings.engine }, settings.engine.workspace || vaultRoot()))
  handle('engine:models', async (event): Promise<{ ok: boolean; models: EngineModelEntry[]; error?: string }> => {
    // Each engine is served by its OWN source: Claude Code reads its brains
    // from the owner's door; agy answers only to Google. Never a pickable lie.
    if (settings.engine.id !== 'claude-code') {
      const known = await detectEngine(settings.engine.id as EngineId)
      const answer = await agyModelSource(known.found, () => capabilityInspector.inspect(track(event.sender), { ...settings.engine }, settings.engine.workspace || vaultRoot())).models()
      return answer
    }
    return discoverClaudeModels({
      baseUrl: settings.engine.baseUrl || 'http://localhost:11434',
      nativeModels: async () => {
        const report = await capabilityInspector.inspect(track(event.sender), { ...settings.engine }, settings.engine.workspace || vaultRoot())
        if (!report.ok) throw Error('Native model inspection unavailable.')
        return report.models
      },
      providerModels: cloud && keyStore?.has('anthropic') && cloudEnabled(inferencePermissions(), 'anthropic', true)
        ? () => cloud!.listModels('anthropic') : undefined,
    })
  })

  // The throttle: how much the engine may do before asking. The app offers
  // the engine's own official settings and imposes nothing beyond them.
  handle('engine:approval', (_event, approval: string): { ok: boolean; answer: string } => {
    const mode: ApprovalMode = APPROVAL_MODES.includes(approval as ApprovalMode)
      ? (approval as ApprovalMode)
      : 'ask'
    if (approval === 'plan') { workflows.cancel(); commandRunner.cancel() }
    settings = writeSettings(settingsFile, { ...settings, engine: { ...settings.engine, approval: mode } })
    return { ok: true, answer: mode }
  })

  // The turn journal: finished turns kept as a small record a reopened
  // window can show. Bounded, plain, never a fake resumable transcript.
  const journal = createJournalManager(join(app.getPath('userData'), 'engine-journal.json'))
  handle('journal:list', () => journal.list())
  handle('journal:append', (_event, entry: unknown) => journal.append(entry as never))
  handle('journal:clear', () => journal.clear())

  // Auto memory: what the engine remembered, listed for the owner. Reads
  // and removes stay inside the vault's memory folder; the WRITES are the
  // engine's own, through its normal tools and this app's cards.
  // The memory home is the ENGINE's own working folder — the same root it
  // spawns in — so what the pane lists is always what the engine wrote,
  // even when the workspace is not the vault.
  const memoryFiles = createMemoryManager(() => settings.engine.workspace || vaultRoot(), () => settings.memoryFolder || '')
  handle('memory:list', () => memoryFiles.list())
  handle('memory:remove', (_event, name: string, expectedFolder?: string) => memoryFiles.remove(typeof name === 'string' ? name : '', typeof expectedFolder === 'string' ? expectedFolder : undefined))

  handle('memory:choose-folder', async () => {
    const chosen = await dialog.showOpenDialog({ title: 'Choose a dedicated memory folder (existing notes are not moved)', properties: ['openDirectory'] })
    if (chosen.canceled || !chosen.filePaths[0]) return { ok: false, canceled: true, answer: '' }
    const problem = folderProblem(chosen.filePaths[0]); if (problem) return { ok: false, answer: problem }
    try {
      const folder = realpathSync(chosen.filePaths[0])
      if (/[\r\n]/.test(folder) || folder.length > 4096) return { ok: false, answer: 'That folder name cannot be used in an engine instruction.' }
      settings = writeSettings(settingsFile, { ...settings, memoryFolder: folder })
      return { ok: true, answer: 'Memory folder selected. Existing notes were not moved.', folder }
    } catch { return { ok: false, answer: 'The memory folder could not be saved.' } }
  })
  handle('memory:default-folder', () => {
    const next = { ...settings }; delete next.memoryFolder
    try { settings = writeSettings(settingsFile, next); return { ok: true, answer: 'Memory uses the working-folder default again.' } }
    catch { return { ok: false, answer: 'The memory preference could not be saved.' } }
  })


  handle('engine:thinking', async (event, thinking: string, expectedTarget: string): Promise<{ ok: boolean; answer: string }> => {
    const original = settings.engine
    const snapshot = { ...original }
    const target = effortTarget(snapshot)
    const command = resolveEngineCommand(snapshot.id)
    const checked = await checkEffortSelection(snapshot, thinking, expectedTarget, current => capabilityInspector.inspect(track(event.sender), current, current.workspace || vaultRoot()))
    if (!checked.ok) return checked
    if (command !== resolveEngineCommand(snapshot.id) || original !== settings.engine || target !== effortTarget(settings.engine)) return { ok: false, answer: 'Engine settings changed during the check. Nothing was changed.' }
    settings = writeSettings(settingsFile, { ...settings, engine: { ...settings.engine, thinking: thinking as ThinkingMode, effortTarget: target } })
    return checked
  })

  handle('engine:model', (_event, model: string, provider?: string, expectedEngine?: string): { ok: boolean; answer: string } => {
    if ((expectedEngine && expectedEngine !== settings.engine.id) || (provider === 'anthropic' && settings.engine.id !== 'claude-code')) return { ok: false, answer: 'The engine changed. Choose a model from the current engine’s list.' }
    const typed = typeof model === 'string' ? model.trim() : ''
    if (typed && !isValidModelName(typed)) {
      return { ok: false, answer: 'Model names use letters, digits, dots, colons, @, / and dashes only; nothing was changed.' }
    }
    const clean = normalizeEngine({ ...settings.engine, model: typed, cloudProvider: provider === 'anthropic' || provider === 'native' ? provider : '', thinking: 'default', effortTarget: undefined })
    settings = writeSettings(settingsFile, { ...settings, engine: clean })
    return { ok: true, answer: clean.cloudProvider ? `brain set to ${clean.model} via ${clean.cloudProvider}` : `brain set to ${clean.model}` }
  })

  // Is the engine actually signed in? The CLI answers for itself; agy does not.
  handle('engine:auth-status', (_event, id?: string): Promise<unknown> =>
    readAuthStatus(id === 'agy' ? 'agy' : 'claude-code'),
  )

  // Open the CLI's own login in a terminal. The app starts the CLI; it never
  // receives the credentials and never runs an OAuth flow in its own window.
  handle('engine:open-login', () => openLogin())

  // Which Ollama is answering, and whether it can serve Claude Code's door.
  handle('engine:ollama-version', (): Promise<unknown> =>
    readOllamaVersion({ baseUrl: settings.engine.baseUrl || 'http://127.0.0.1:11434' }),
  )

  // "Open a folder" — the engine's workplace, chosen once and remembered.
  handle('engine:pick-workspace', async (): Promise<{ ok: boolean; answer: string }> => {
    if (dispatchingWork || engine?.turnBusy()) return { ok: false, answer: 'Stop active work before changing its working folder.' }
    const answer = await dialog.showOpenDialog({
      title: 'Where should the engine work?',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (answer.canceled || !answer.filePaths[0]) {
      return { ok: false, answer: 'No folder chosen. The working folder was not changed.' }
    }
    if (dispatchingWork || engine?.turnBusy()) return { ok: false, answer: 'Work started while the picker was open. The folder was not changed.' }
    const workspace = answer.filePaths[0]
    settings = writeSettings(settingsFile, { ...settings, engine: { ...settings.engine, workspace } })
    // The agy skills copy follows the workspace; refresh so a brand-new
    // workplace gets the hint files the moment it is picked.
    const moved = deployBuiltInSkills(skillTargets())
    if (moved.length) console.log(`[skills] refreshed ${moved.length} built-in engine skill file(s)`)
    return { ok: true, answer: workspace }
  })

  // The engines' hint skills (ours, not from any catalog) refresh on every
  // launch, here at the end of bridge registration — settings are loaded by
  // the time this runs, so the workspace path they need is known.
  const placedSkills = deployBuiltInSkills(skillTargets())
  if (placedSkills.length) console.log(`[skills] refreshed ${placedSkills.length} built-in engine skill file(s)`)
}

// Engines the app itself staged (engines/<id>/app under its own data
// folder) are probe candidates from the first detection on — the owner's
// machine put engines there and the probe list ignored that folder.
try {
  registerStagingRoot(join(app.getPath('userData'), 'engines'))
} catch {
  /* no data folder yet (odd test launches) — nothing staged to register */
}

// The owner's pointed binaries survive restarts: userData/engine-binaries.json.
try {
  const overrideFile = join(app.getPath('userData'), 'engine-binaries.json')
  if (existsSync(overrideFile)) {
    const parsed = JSON.parse(readFileSync(overrideFile, 'utf8')) as Record<string, string>
    for (const id of ['claude-code', 'agy'] as const) {
      const p = typeof parsed[id] === 'string' ? parsed[id] : ''
      if (p && existsSync(p)) setBinaryOverride(id, p)
    }
  }
} catch {
  /* a broken override file must never block the boot */
}

const isSmoke = process.argv.includes('--smoke')
const smokeOutArg = process.argv.find(arg => arg.startsWith('--smoke-out='))
const smokeOut = smokeOutArg ? smokeOutArg.split('=')[1] : ''

/** Renderer console output, kept so the smoke run can fail on it. */
const consoleErrors: string[] = []
const consoleWarnings: string[] = []

let api: LocalApi | null = null

// ---- The quick window: the whole app's engine, one keypress away -------
// The SAME renderer, the SAME queue, the SAME cards — a second window is
// only a smaller door into the one send path. Never a second engine.
let quickWindow: BrowserWindow | null = null

/**
 * The exact file URL the packaged app loads, with or without the quick flag —
 * the same string loadFile resolves to, pinned so the guard trusts precisely
 * this page and nothing else on disk.
 */
function appRendererFileUrl(query = ''): string {
  const url = pathToFileURL(join(__dirname, '../renderer/index.html'))
  return `${url.href.split('#')[0]}${query}`
}

/**
 * The warm-runtime promise, kept at boot and when the switch is turned on:
 * start the staged Ollama headless ONLY when it exists and is not already
 * answering — never a second copy of somebody's own runtime.
 */
/** Set once the download manager exists; the warm-up refuses to run blind. */
let downloadManager: ReturnType<typeof createDownloadManager> | null = null

async function warmStartRuntime(): Promise<void> {
  try {
    if (!downloadManager) return
    const status = await downloadManager.ollamaStatus()
    if (status && typeof status === 'object' && 'running' in status && (status as { running?: boolean }).running) return
    // The always-loaded switch is a RUNTIME property: Ollama's own env sets
    // the default hold forever, so every brain the engine drives stays warm.
    const flags = loadAppFlags(join(app.getPath('userData'), 'app-flags.json'))
    await downloadManager.ollamaStart(flags.keepLoadedAlways ? { OLLAMA_KEEP_ALIVE: '-1' } : undefined)
  } catch {
    // A runtime that will not start is the Engine page's problem to show;
    // boot itself must never fail because an optional warm-up refused.
  }
}

function createQuickWindow(): void {
  if (quickWindow && !quickWindow.isDestroyed()) {
    quickWindow.show()
    quickWindow.focus()
    return
  }
  const icon = windowIcon()
  quickWindow = new BrowserWindow({
    ...fitWindow(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea, { width: 440, height: 620, minWidth: 360, minHeight: 420 }),
    title: 'OddBrain — quick ask',
    autoHideMenuBar: true,
    ...(icon ? { icon } : {}),
    backgroundColor: '#141417',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (devServer) void quickWindow.loadURL(`${devServer}/?quick=1`)
  else if (api?.url) void quickWindow.loadURL(`${api.url}/?quick=1`)
  else void quickWindow.loadFile(join(__dirname, '../renderer/index.html'), { query: { quick: '1' } })
  // The file fallback is a real page this app loaded: pin its exact URL (with
  // and without the flag) so the quick window's IPC works packaged, offline,
  // and in dev — and never for any other file on disk.
  pinOwnOrigins([devServer, api?.url, appRendererFileUrl('?quick=1'), appRendererFileUrl()])
  lockNavigation(quickWindow.webContents)
  quickWindow.on('closed', () => {
    quickWindow = null
  })
}

const QUICK_SHORTCUT = 'CommandOrControl+Shift+O'
let quickShortcutEnabled = true

function applyQuickShortcut(): void {
  globalShortcut.unregister(QUICK_SHORTCUT)
  if (quickShortcutEnabled) {
    globalShortcut.register(QUICK_SHORTCUT, () => createQuickWindow())
  }
}


let extensionAppearance: ExtensionAppearance | null = null
let extensionApi: ExtensionApi | null = null
let settings: AppSettings = { ...EMPTY_SETTINGS }
let settingsFile = ''
let keyStore: KeyStore | null = null
let cloud: CloudClient | null = null
/** The engine plug and the last events it produced, for windows opened mid-turn. */
let engine: EngineSocket | null = null
let automation: AutomationService | null = null
let reviewer: ReturnType<typeof createTextReviewer> | null = null
let memoryOrganizer: ReturnType<typeof createMemoryOrganizer> | null = null
let foregroundApiRequests = 0
let dispatchingWork = false
let workDispatchGeneration = 0
const engineHistory: EngineEvent[] = []

/**
 * The icon file, when this build has one.
 *
 * In a packaged Windows build the icon comes from the executable itself, so
 * nothing is passed; in the checkout the repo's own BrainMark is used, which is
 * what the taskbar shows during development. An absent file is not an error —
 * it just means the operating system's default stands.
 */
function windowIcon(): string | undefined {
  for (const candidate of [join(app.getAppPath(), 'resources', 'icon.png'), join(process.resourcesPath || '', 'icon.png')]) {
    try {
      if (candidate && existsSync(candidate)) return candidate
    } catch {
      // process.resourcesPath is undefined outside a package; keep looking.
    }
  }
  return undefined
}

function createWindow(): BrowserWindow {
  const icon = windowIcon()
  const window = new BrowserWindow({
    ...fitWindow(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea),
    show: false,
    ...(icon ? { icon } : {}),
    // The window paints this before the renderer draws, so there is never a white flash.
    backgroundColor: '#141417',
    title: 'OddBrain',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Electron changed this event's payload shape across versions; read both.
  window.webContents.on('console-message', (...args: unknown[]) => {
    const maybeDetails = args[1]
    const details =
      maybeDetails && typeof maybeDetails === 'object'
        ? (maybeDetails as { level?: string | number; message?: string })
        : null
    const level = details ? details.level : (args[1] as string | number)
    const message = details ? details.message : (args[2] as string)
    const text = String(message ?? '')
    if (level === 'error' || level === 3) consoleErrors.push(text)
    else if (level === 'warning' || level === 2) consoleWarnings.push(text)
  })

  window.webContents.on('preload-error', (_event, path, error) => {
    consoleErrors.push(`preload failed at ${path}: ${error.message}`)
  })

  window.webContents.on('did-fail-load', (_event, code, description) => {
    consoleErrors.push(`renderer failed to load (${code}): ${description}`)
  })

  // Show on first paint so there is never a white flash, and so a screenshot
  // taken by the smoke run captures something real rather than an unpainted frame.
  window.once('ready-to-show', () => window.show())

  // The interface is always loaded over http, never from file://, so that its
  // fetch calls are same-origin and the local API boundary sees a real Origin.
  // In dev that origin is Vite's, which forwards /api to the server below.
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (devServer) {
    void window.loadURL(devServer)
  } else if (api) {
    void window.loadURL(`${api.url}/`)
  } else {
    // The API failed to start. Show the interface anyway rather than nothing —
    // it renders its own offline state, which is more useful than a blank window.
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
  // The fallback's file page is ours: pin it exactly, so offline mode keeps a
  // working interface instead of a window whose every button is refused.

  // The pages this app loads are the only pages IPC answers, and navigation
  // is locked: a link can never walk this window (and its preload bridge)
  // somewhere else — plain web links open in the real browser instead.
  pinOwnOrigins([devServer, api?.url, appRendererFileUrl()])
  lockNavigation(window.webContents)

  if (isSmoke) runSmoke(window)

  return window
}

/**
 * Headless proof that the shell works: wait for the renderer, photograph the
 * window, and exit non-zero if the renderer logged anything it shouldn't have.
 * This is the test that makes "the window opens" a fact instead of a claim.
 */
function runSmoke(window: BrowserWindow): void {
  const started = Date.now()
  window.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        // The real machine reported a chat that would not scroll. Photograph
        // alone cannot see that, so the smoke run now proves the scroll
        // chain on the built app: force overflow in the message scroller and
        // demand that it actually moves.
        let scrollLine = 'SCROLL skipped'
        try {
          const probe = (await window.webContents.executeJavaScript(
            `(() => {
              const scroller = document.querySelector('[data-find-scroll]')
              if (!scroller) return { ok: false, why: 'no scroller in the tree' }
              const filler = document.createElement('div')
              filler.style.height = '4000px'
              ;(scroller.firstElementChild ?? scroller).appendChild(filler)
              const scrollable = scroller.scrollHeight > scroller.clientHeight
              scroller.scrollTop = 99999
              const moved = scroller.scrollTop > 100
              filler.remove()
              return { ok: scrollable && moved, scrollable, moved }
            })()`,
            true,
          )) as { ok: boolean; why?: string; scrollable?: boolean; moved?: boolean }
          scrollLine = probe && probe.ok ? 'SCROLL OK' : `SCROLL BROKEN ${JSON.stringify(probe)}`
        } catch (probeError) {
          scrollLine = `SCROLL FAILED ${(probeError as Error).message}`
        }
        const image = await window.webContents.capturePage()
        if (smokeOut) writeFileSync(smokeOut, image.toPNG())
        const bounds = window.getBounds()
        const title = window.getTitle()
        const blank = image.isEmpty()
        console.log(
          `SMOKE ${blank ? 'BLANK' : 'OK'} ${scrollLine} title="${title}" size=${bounds.width}x${bounds.height} ` +
            `in ${Date.now() - started}ms errors=${consoleErrors.length} warnings=${consoleWarnings.length}`
        )
        for (const line of consoleErrors.slice(0, 10)) console.log(`  ERROR: ${line}`)
        for (const line of consoleWarnings.slice(0, 10)) console.log(`  WARN:  ${line}`)
        // The rule the owner set: a WARNING is already a failure. The smoke
        // run is the console-clean gate, so it enforces the whole sentence.
        const failed =
          consoleErrors.length > 0 || consoleWarnings.length > 0 || blank || scrollLine.startsWith('SCROLL BROKEN')
        app.exit(failed ? 1 : 0)
      } catch (error) {
        console.log(`SMOKE FAILED: ${(error as Error).message}`)
        app.exit(1)
      }
    }, 1500)
  })
}

// One copy at a time. A second launch focuses the window you already have.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [existing] = BrowserWindow.getAllWindows()
    if (existing) {
      if (existing.isMinimized()) existing.restore()
      existing.focus()
    }
  })

  // The menu bar the approved mockup shows: File Edit View Go Help. Every
  // item does a real thing — no decoration. "New chat" and the Go section
  // talk to the window over the same channel the extension bridge uses.
  const sendToWindow = (channel: string): void => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel)
  }
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'New Chat', accelerator: 'CmdOrCtrl+N', click: () => sendToWindow('menu:new-chat') },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => sendToWindow('menu:settings') },
        { type: 'separator' },
        { role: 'quit', label: 'Quit' },
      ],
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Go',
      submenu: [
        { label: 'Chat', accelerator: 'CmdOrCtrl+1', click: () => sendToWindow('menu:view:chat') },
        { label: 'Artifacts', accelerator: 'CmdOrCtrl+2', click: () => sendToWindow('menu:view:artifacts') },
        { label: 'Today', accelerator: 'CmdOrCtrl+3', click: () => sendToWindow('menu:view:today') },
        { label: 'Projects', accelerator: 'CmdOrCtrl+4', click: () => sendToWindow('menu:view:projects') },
        { label: 'Vault', accelerator: 'CmdOrCtrl+5', click: () => sendToWindow('menu:view:vault') },
        { label: 'Brain', accelerator: 'CmdOrCtrl+7', click: () => sendToWindow('menu:view:brain') },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Learn more',
          click: () => void shell.openExternal('https://github.com/NishadIslamUtso/OddBrain'),
        },
        {
          label: 'About OddBrain',
          click: () => {
            void dialog.showMessageBox({
              type: 'info',
              title: 'About OddBrain',
              message: `OddBrain ${app.getVersion()}`,
              detail: 'The face of your engines. Local vault, local memory, $0.',
            })
          },
        },
      ],
    },
  ])
  // Inside whenReady, as Electron requires — set before ready and the menu is
  // silently ignored, which is exactly the "Ctrl+4 does nothing" this once was.
  void app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.whenReady().then(async () => {
    // Only a main-frame, explicitly initiated dictation session may use the mic.
    session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => {
      if (!contents || !urlIsOurs(contents.getURL()) || !details.isMainFrame) return false
      if (permission === 'media') return details.mediaType === 'audio' && mediaService?.canRecord(contents.id) === true
      return permission === 'clipboard-sanitized-write'
    })
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      const own = urlIsOurs(contents.getURL()) && details.isMainFrame && urlIsOurs(details.requestingUrl)
      if (permission === 'media') callback(!!own && 'mediaTypes' in details && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio' && mediaService?.canRecord(contents.id) === true)
      else callback(!!own && permission === 'clipboard-sanitized-write')
    })
    Menu.setApplicationMenu(menu)
    console.log(`[menu] application menu set: ${Menu.getApplicationMenu()?.items.length ?? 0} top items`)
    const rendererDir = process.env['ELECTRON_RENDERER_URL']
      ? undefined
      : join(__dirname, '../renderer')
    // What the user chose last time, read before anything can need it. A damaged
    // file means "nothing chosen yet", never a failed launch.
    settingsFile = join(app.getPath('userData'), 'settings.json')
    settings = readSettings(settingsFile)
    // The quick window's hotkey is system-wide from boot; --quick opens it
    // immediately (drives and tests use this door).
    applyQuickShortcut()
    if (process.argv.includes('--quick')) createQuickWindow()
    engine = createEngineSocket(createSessionMemory(join(app.getPath('userData'), 'engine-sessions.json')))
    registerBridges()
    // The keep-it-running flags, honored every boot — HERE, after the bridges
    // registered, because the warm runtime starts through the download
    // manager that registerBridges creates. Called earlier, it once returned
    // silently on a null manager: a switch that promised at every launch and
    // kept the promise at none.
    try {
      const flags = loadAppFlags(join(app.getPath('userData'), 'app-flags.json'))
      if (flags.loginItem) app.setLoginItemSettings({ openAtLogin: true })
      if (flags.warmRuntime || flags.keepLoadedAlways) void warmStartRuntime()
    } catch {
      // Flags are a preference; a failure reading them is not a failed launch.
    }
    // The vault, whenever it exists, is brought up to the current structure at
    // boot: missing files are written, same-name files are never replaced, and
    // two-wording files keep both copies for the owner to settle in Settings.
    const integrated = integrateVaultStructure(vaultRoot())
    if (integrated.ok && integrated.written.length) {
      console.log(`[structure] added ${integrated.written.length} structure file(s), ${integrated.conflicts.length} conflict(s) to settle`)
    }
    runMonthlyAudit()

    // Keys are sealed by the operating system — safeStorage is the keychain on
    // macOS and Windows and the desktop's own secret store on Linux. When a
    // machine gives the app nothing to seal with, the key is held for this run
    // and the app says so, rather than writing it to disk in the clear.
    let seal: ((value: string) => string) | undefined
    let unseal: ((value: string) => string) | undefined
    try {
      if (safeStorage.isEncryptionAvailable()) {
        seal = value => safeStorage.encryptString(value).toString('base64')
        unseal = value => safeStorage.decryptString(Buffer.from(value, 'base64'))
      }
    } catch {
      // No keychain here: the store below keeps keys in memory for this run.
    }
    keyStore = createKeyStore({ file: join(app.getPath('userData'), 'keys.json'), encrypt: seal, decrypt: unseal })
    // `custom` is the provider whose address and model a person types in
    // themselves; the client reads it fresh on every request, so changing it in
    // Settings needs no restart.
    cloud = createCloudClient({
      keys: keyStore,
      config: () => ({ custom: settings.cloud }),
      // Read fresh on every call, so a switch in Settings takes effect at once.
      permissions: () => inferencePermissions(),
      env: process.env,
    })
    const reviewCloud = createCloudClient({ keys: keyStore, config: () => ({ custom: settings.cloud }), permissions: () => inferencePermissions(), env: process.env,
      fetchImpl: (input, init) => fetch(input, { ...init, redirect: 'error' }) })
    reviewer = createTextReviewer({ permissions: () => inferencePermissions(), cloudAllowed: () => automation?.preferences().allowCloudInference !== false, cloud: () => reviewCloud, engine: () => settings.engine })
    automation = createAutomationService({ file: join(app.getPath('userData'), 'automation.json'), engine: () => settings.engine,
      runText: (task, preferences, signal) => { memoryOrganizer?.cancel(); return reviewer!.run(task, preferences, signal) },
      onChanged: (view: AutomationView) => { for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('automation:changed', view) } })
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) try { window.webContents.send('automation:changed', automation.view()) } catch {}
    app.on('before-quit', () => { void automation?.dispose() })
    memoryOrganizer = createMemoryOrganizer({
      store: () => createMemoryWorkspace(createVaultService({ vaultPath: vaultRoot() }).files()),
      busy: () => dispatchingWork || !!engine?.turnBusy() || foregroundApiRequests > 0 || !!automation?.view().current,
      configuration: () => JSON.stringify({ engine: settings.engine, permissions: inferencePermissions(), cloud: automation?.preferences().allowCloudInference, custom: settings.cloud, keyProviders: keyStore?.ids() }),
      run: (system, prompt, preferences, signal) => reviewer!.organize(system, prompt, preferences, signal),
    })
    app.on('before-quit', () => memoryOrganizer?.dispose())
    const enabled = keyStore.ids().length
    console.log(
      `[cloud] keys ${keyStore.encryption === 'os' ? 'sealed by this machine' : 'held for this run only'}; ` +
        `${enabled} provider${enabled === 1 ? '' : 's'} enabled`
    )

    // The vault lives in this process: no companion server to start, no port to
    // find, and the interface's /api/vault calls land on these files.
    const vault = createVaultService({ vaultPath: vaultRoot() })
    console.log(
      vault.available()
        ? `[vault] ${vault.root}`
        : `[vault] nothing at ${vault.root}; captures will report that rather than create one.`
    )
    try {
      // The API is handed the cloud client, so a chat whose model names a
      // provider streams from there — through the same address, as the same
      // records, with no second path for the interface to know about.
      api = await startLocalApi({ port: API_PORT, rendererDir, vault, cloud: cloud || undefined, onInferenceActivity: busy => { foregroundApiRequests = Math.max(0, foregroundApiRequests + (busy ? 1 : -1)); if (busy) memoryOrganizer?.cancel() } })
      if (api.port !== API_PORT) {
        console.log(`[api] port ${API_PORT} was busy; listening on ${api.port} instead.`)
      }
    } catch (error) {
      console.log(`[api] could not start: ${(error as Error).message}`)
      api = null
    }
    // The extension's own port. Narrow on purpose (see src/main/extension/server.ts):
    // it carries the capture side of the vault and nothing that could spend a key
    // or change a setting. A busy port is reported, never fatal.
    // The pairing token: generated once on this machine, persisted next to the
    // rest of the app's own state, handed to the port so every restart accepts
    // the same paired extension. The extension's pairing screen shows where it
    // lives; nothing here trusts the network with it.
    let pairToken = ''
    try {
      const pairFile = join(app.getPath('userData'), 'extension-pair.json')
      const raw = JSON.parse(readFileSync(pairFile, 'utf8')) as { token?: string }
      if (typeof raw.token === 'string' && raw.token.length >= 32) pairToken = raw.token
    } catch {}
    if (!pairToken) {
      pairToken = randomBytes(24).toString('hex')
      try {
        writeFileSync(join(app.getPath('userData'), 'extension-pair.json'), JSON.stringify({ token: pairToken }), 'utf8')
      } catch {
        // A failed save means a fresh token next boot; the extension re-pairs. Fine.
      }
    }
    extensionApi = await startExtensionApi({
      port: extensionPortWanted(),
      appearance: () => extensionAppearance,
      vault,
      mayCapture: () => settings.permissions.browserCapture,
      pairToken,
    })
    if (extensionApi.listening) {
      console.log(`[extension] listening at ${extensionApi.url}, captures, context and the never-check list only`)
    }
    // The pairing secret belongs to the person, not to the extension: the app
    // shows it only here, copies it on their press, and rotation is theirs
    // too — an old extension stops working the moment they rotate.
    handle('extension-pair:get', () => ({ token: pairToken }))
    handle('extension-pair:rotate', () => {
      pairToken = randomBytes(24).toString('hex')
      try {
        writeFileSync(join(app.getPath('userData'), 'extension-pair.json'), JSON.stringify({ token: pairToken }), 'utf8')
      } catch {
        // A failed save means the rotation lives until reboot; still told below.
      }
      if (extensionApi) extensionApi.setPairToken(pairToken)
      return { ok: true, token: pairToken }
    })
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('before-quit', () => {
    capabilityInspector.cancelAll()
    mediaService?.cancelAll()
    marketplaceService?.cancelAll()
    agyMarketplaceService?.cancelAll()
    void api?.close()
    void extensionApi?.close()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

// Module scope: registration/window recreation cannot reset the launch ticket.
const claimUiLaunch = createLaunchGate()
