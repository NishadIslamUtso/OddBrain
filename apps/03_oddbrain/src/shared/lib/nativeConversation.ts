import { resolveChatContext, type ChatOverrides } from './chatContext'
export type NativeConversation = {
  chatId: string
  expectedRoute?: string
  projectId?: string | null
  overrides?: ChatOverrides
  /** Refuse, rather than silently start fresh, if this saved native link disappeared. */
  continuationExpected?: boolean
  /** Supplied only for a new native context. Stored chat text, never another native ID. */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}
export type ContextSourceRole = 'app-instruction' | 'owner-instruction' | 'owner-preference' | 'untrusted-reference' | 'conversation-history' | 'owner-request'
export type ContextReceipt = {
  projectId: string | null; revision: string; workspace: string
  sources: Array<{ id: string; title: string; chars: number; digest?: string; coverage: string; role?: ContextSourceRole; hazards?: import('./textHazards').TextHazardReport }>
  historyMessages: number; characters: number
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
  if (raw.history !== undefined && (!Array.isArray(raw.history) || raw.history.some(m => !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string'))) throw Error('Invalid stored conversation context.')
  resolveChatContext({ goal: '', style: '', workspace: '', additionalFolders: [] }, raw.overrides || {})
  if (JSON.stringify(raw).length > 100_000) throw Error('Conversation context exceeds 100,000 characters. Nothing was clipped or sent; use a shorter explicit recap in a new chat.')
  return structuredClone(raw)
}

export type NativeContextTarget = { workspace: string; route: string; resume: boolean }

export function validContextReceipt(value: unknown): value is ContextReceipt {
  const v = value as ContextReceipt
  const hazard = (report: any) => report === undefined || (!!report && Number.isSafeInteger(report.total) && report.total >= 0 && typeof report.notice === 'string' && report.notice.length <= 2_000 && Array.isArray(report.findings) && report.findings.length <= 5 && report.findings.every((finding: any) => finding && typeof finding.kind === 'string' && typeof finding.label === 'string' && Number.isSafeInteger(finding.count) && finding.count >= 0 && Array.isArray(finding.positions) && finding.positions.length <= 8 && finding.positions.every(Number.isSafeInteger) && Array.isArray(finding.codePoints) && finding.codePoints.length <= 8 && finding.codePoints.every((item: unknown) => typeof item === 'string') && Array.isArray(finding.excerpts) && finding.excerpts.length <= 4 && finding.excerpts.every((item: unknown) => typeof item === 'string' && item.length <= 500)))
  const session = v?.session === undefined || (!!v.session && ['live', 'resumed', 'fresh'].includes(v.session.state) && typeof v.session.detail === 'string' && v.session.detail.length <= 2_000)
  const launch = v?.launch === undefined || (!!v.launch && typeof v.launch.digest === 'string' && /^[a-f0-9]{64}$/i.test(v.launch.digest) && typeof v.launch.complete === 'boolean' && ['files', 'connectorFiles', 'ruleFiles', 'hookFiles'].every(key => Number.isSafeInteger((v.launch as any)[key]) && (v.launch as any)[key] >= 0) && Array.isArray(v.launch.warnings) && v.launch.warnings.length <= 100 && v.launch.warnings.every(item => typeof item === 'string' && item.length <= 2_000))
  return !!v && typeof v === 'object' && (v.projectId === null || typeof v.projectId === 'string') && typeof v.revision === 'string' && /^[a-f0-9]{64}$/i.test(v.revision) && typeof v.workspace === 'string' && session && launch &&
    Number.isSafeInteger(v.characters) && v.characters >= 0 && Number.isSafeInteger(v.historyMessages) && v.historyMessages >= 0 && Array.isArray(v.sources) && v.sources.length <= 100 && v.sources.every(source =>
      source && typeof source.id === 'string' && typeof source.title === 'string' && typeof source.coverage === 'string' && (source.role === undefined || ['app-instruction', 'owner-instruction', 'owner-preference', 'untrusted-reference', 'conversation-history', 'owner-request'].includes(source.role)) && hazard(source.hazards) && Number.isSafeInteger(source.chars) && source.chars >= 0 && (source.digest === undefined || (typeof source.digest === 'string' && /^[a-f0-9]{64}$/i.test(source.digest))))
}
