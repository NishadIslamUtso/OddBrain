import { normalizeWorkingNotes, resolveChatContext, workingNotesText, type ChatOverrides, type WorkingNotes } from './chatContext'
import type { ContextCapacitySource } from './modelContext'
export type NativeConversation = {
  chatId: string
  expectedRoute?: string
  projectId?: string | null
  overrides?: ChatOverrides
  /** Compact, versioned AI/user draft state. It is context, never confirmed memory or authority. */
  workingNotes?: WorkingNotes
  /** Persistent, revocable approval for app-mediated read-only search of non-excluded vault sources. */
  vaultSearch?: boolean
  /** Renderer preference only; main-process context preparation validates and applies it. */
  contextProfile?: { key?: string; mode: 'auto' | 'manual'; source: ContextCapacitySource; capacityTokens: number | null; outputReserveTokens: number }
  /** Refuse, rather than silently start fresh, if this saved native link disappeared. */
  continuationExpected?: boolean
  /** Supplied only for a new native context. Stored chat text, never another native ID. */
  history?: Array<{ id?: string; role: 'user' | 'assistant'; content: string }>
}
export type ContextSourceRole = 'app-instruction' | 'owner-instruction' | 'owner-preference' | 'draft-working-note' | 'untrusted-reference' | 'conversation-history' | 'owner-request'
export type ContextReceipt = {
  projectId: string | null; revision: string; workspace: string
  sources: Array<{ id: string; title: string; chars: number; digest?: string; coverage: string; role?: ContextSourceRole; hazards?: import('./textHazards').TextHazardReport }>
  historyMessages: number; characters: number
  modelContext?: { key?: string; mode: 'auto' | 'manual'; source: ContextCapacitySource; capacityTokens: number | null; outputReserveTokens: number; estimatedInputTokens: number; exact: false }
  omitted?: Array<{ id: string; title: string; reason: 'model-context-budget' | 'provider-overflow' }>
  overflowRecovery?: { attempt: 2; retryLimitTokens: number | null; retryInputTokens: number; observedCapacityTokens: number | null; providerMessage: string }
  session?: { state: 'live' | 'resumed' | 'fresh'; detail: string }
  launch?: { digest: string; complete: boolean; files: number; connectorFiles: number; ruleFiles: number; hookFiles: number; warnings: string[] }
}
export type NativeSessionLink = { engine: 'claude-code' | 'agy'; workspace: string; sessionId: string; chatId?: string }
export function checkNativeConversation(value: unknown): NativeConversation | undefined {
  if (value === undefined || value === null) return undefined
  const raw = value as NativeConversation
  if (!raw || typeof raw !== 'object' || typeof raw.chatId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,256}$/.test(raw.chatId)) throw Error('Invalid conversation identity. Nothing was sent.')
  if (raw.expectedRoute !== undefined && (typeof raw.expectedRoute !== 'string' || raw.expectedRoute.length > 16_000)) throw Error('Invalid engine route.')
  if (raw.projectId !== undefined && raw.projectId !== null && (typeof raw.projectId !== 'string' || !/^[a-zA-Z0-9_-]{6,64}$/.test(raw.projectId))) throw Error('Invalid project identity.')
  if (raw.continuationExpected !== undefined && typeof raw.continuationExpected !== 'boolean') throw Error('Invalid resume choice.')
  if (raw.vaultSearch !== undefined && typeof raw.vaultSearch !== 'boolean') throw Error('Invalid vault-search choice.')
  if (raw.contextProfile !== undefined) {
    const p = raw.contextProfile
    if (!p || (p.key !== undefined && (typeof p.key !== 'string' || p.key.length > 1_000)) || !['auto', 'manual'].includes(p.mode) || !['reported', 'observed', 'owner', 'unknown'].includes(p.source) || !(p.capacityTokens === null || (Number.isSafeInteger(p.capacityTokens) && p.capacityTokens! >= 256 && p.capacityTokens! <= 10_000_000)) || !Number.isSafeInteger(p.outputReserveTokens) || p.outputReserveTokens < 64 || p.outputReserveTokens > 10_000_000 || (p.mode === 'manual' && p.capacityTokens === null)) throw Error('Invalid model context profile.')
  }
  if (raw.history !== undefined && (!Array.isArray(raw.history) || raw.history.some(m => !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || (m.id !== undefined && (typeof m.id !== 'string' || m.id.length > 256))))) throw Error('Invalid stored conversation context.')
  resolveChatContext({ goal: '', style: '', workspace: '', additionalFolders: [] }, raw.overrides || {})
  if (raw.workingNotes !== undefined && workingNotesText(normalizeWorkingNotes(raw.workingNotes)) !== JSON.stringify(raw.workingNotes)) throw Error('Invalid or oversized chat Working Notes. Nothing was sent.')
  if (JSON.stringify(raw).length > 140_000) throw Error('Conversation context exceeds 100,000 characters. Nothing was clipped or sent; use a shorter explicit recap in a new chat.')
  return structuredClone(raw)
}

export type NativeContextTarget = { workspace: string; route: string; resume: boolean }

export function validContextReceipt(value: unknown): value is ContextReceipt {
  const v = value as ContextReceipt
  const hazard = (report: any) => report === undefined || (!!report && Number.isSafeInteger(report.total) && report.total >= 0 && typeof report.notice === 'string' && report.notice.length <= 2_000 && Array.isArray(report.findings) && report.findings.length <= 5 && report.findings.every((finding: any) => finding && typeof finding.kind === 'string' && typeof finding.label === 'string' && Number.isSafeInteger(finding.count) && finding.count >= 0 && Array.isArray(finding.positions) && finding.positions.length <= 8 && finding.positions.every(Number.isSafeInteger) && Array.isArray(finding.codePoints) && finding.codePoints.length <= 8 && finding.codePoints.every((item: unknown) => typeof item === 'string') && Array.isArray(finding.excerpts) && finding.excerpts.length <= 4 && finding.excerpts.every((item: unknown) => typeof item === 'string' && item.length <= 500)))
  const session = v?.session === undefined || (!!v.session && ['live', 'resumed', 'fresh'].includes(v.session.state) && typeof v.session.detail === 'string' && v.session.detail.length <= 2_000)
  const launch = v?.launch === undefined || (!!v.launch && typeof v.launch.digest === 'string' && /^[a-f0-9]{64}$/i.test(v.launch.digest) && typeof v.launch.complete === 'boolean' && ['files', 'connectorFiles', 'ruleFiles', 'hookFiles'].every(key => Number.isSafeInteger((v.launch as any)[key]) && (v.launch as any)[key] >= 0) && Array.isArray(v.launch.warnings) && v.launch.warnings.length <= 100 && v.launch.warnings.every(item => typeof item === 'string' && item.length <= 2_000))
  const modelContext = v?.modelContext === undefined || (!!v.modelContext && (v.modelContext.key === undefined || (typeof v.modelContext.key === 'string' && v.modelContext.key.length <= 1_000)) && ['auto', 'manual'].includes(v.modelContext.mode) && ['reported', 'observed', 'owner', 'unknown'].includes(v.modelContext.source) && (v.modelContext.capacityTokens === null || (Number.isSafeInteger(v.modelContext.capacityTokens) && v.modelContext.capacityTokens >= 256 && v.modelContext.capacityTokens <= 10_000_000)) && Number.isSafeInteger(v.modelContext.outputReserveTokens) && v.modelContext.outputReserveTokens >= 64 && Number.isSafeInteger(v.modelContext.estimatedInputTokens) && v.modelContext.estimatedInputTokens >= 0 && v.modelContext.exact === false)
  const omitted = v?.omitted === undefined || (Array.isArray(v.omitted) && v.omitted.length <= 10_000 && v.omitted.every(item => item && typeof item.id === 'string' && item.id.length <= 500 && typeof item.title === 'string' && item.title.length <= 500 && ['model-context-budget', 'provider-overflow'].includes(item.reason)))
  const overflowRecovery = v?.overflowRecovery === undefined || (!!v.overflowRecovery && v.overflowRecovery.attempt === 2 && (v.overflowRecovery.retryLimitTokens === null || (Number.isSafeInteger(v.overflowRecovery.retryLimitTokens) && v.overflowRecovery.retryLimitTokens >= 256)) && Number.isSafeInteger(v.overflowRecovery.retryInputTokens) && v.overflowRecovery.retryInputTokens >= 1 && (v.overflowRecovery.observedCapacityTokens === null || (Number.isSafeInteger(v.overflowRecovery.observedCapacityTokens) && v.overflowRecovery.observedCapacityTokens >= 256)) && typeof v.overflowRecovery.providerMessage === 'string' && v.overflowRecovery.providerMessage.length <= 2_000)
  return !!v && typeof v === 'object' && (v.projectId === null || typeof v.projectId === 'string') && typeof v.revision === 'string' && /^[a-f0-9]{64}$/i.test(v.revision) && typeof v.workspace === 'string' && session && launch && modelContext && omitted && overflowRecovery &&
    Number.isSafeInteger(v.characters) && v.characters >= 0 && Number.isSafeInteger(v.historyMessages) && v.historyMessages >= 0 && Array.isArray(v.sources) && v.sources.length <= 100 && v.sources.every(source =>
      source && typeof source.id === 'string' && typeof source.title === 'string' && typeof source.coverage === 'string' && (source.role === undefined || ['app-instruction', 'owner-instruction', 'owner-preference', 'draft-working-note', 'untrusted-reference', 'conversation-history', 'owner-request'].includes(source.role)) && hazard(source.hazards) && Number.isSafeInteger(source.chars) && source.chars >= 0 && (source.digest === undefined || (typeof source.digest === 'string' && /^[a-f0-9]{64}$/i.test(source.digest))))
}
