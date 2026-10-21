/**
 * Kdenlive-centred Video Studio contracts.
 *
 * OddBrain owns understanding, licensed-asset discovery and reviewed AI actions.
 * Kdenlive owns the editable timeline, monitor, undo and render. Remote catalogue
 * entries stay remote until the owner approves one exact project download.
 */

export type CreativeKind = 'image' | 'video' | 'audio'
export type CreativeProvider = 'openverse' | 'wikimedia' | 'pixabay'

export type VideoStudioPreferences = {
  kdenlive: string
  mcpUrl: string
  projectFolder: string
  ytDlp: string
}

export const DEFAULT_VIDEO_STUDIO: VideoStudioPreferences = {
  kdenlive: '',
  mcpUrl: 'http://127.0.0.1:8765/mcp',
  projectFolder: '',
  ytDlp: '',
}

const cleanText = (value: unknown, max: number): string =>
  typeof value === 'string' && value.length <= max && !/[\u0000\r\n]/.test(value) ? value.trim() : ''

/** Only loopback MCP is accepted. A video editor never needs a public control port. */
export function normalizeMcpUrl(value: unknown): string {
  const raw = cleanText(value, 2048)
  if (!raw) return DEFAULT_VIDEO_STUDIO.mcpUrl
  try {
    const url = new URL(raw)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.protocol !== 'http:' || url.username || url.password || url.search || url.hash) return DEFAULT_VIDEO_STUDIO.mcpUrl
    return url.toString()
  } catch { return DEFAULT_VIDEO_STUDIO.mcpUrl }
}

export function normalizeVideoStudio(value: unknown): VideoStudioPreferences {
  const raw = value && typeof value === 'object' ? value as Partial<VideoStudioPreferences> : {}
  return {
    kdenlive: cleanText(raw.kdenlive, 4096),
    mcpUrl: normalizeMcpUrl(raw.mcpUrl),
    projectFolder: cleanText(raw.projectFolder, 4096),
    ytDlp: cleanText(raw.ytDlp, 4096),
  }
}

export type NativeKdenliveStatus = {
  compatible: boolean
  identity: string
  protocol: string
  referenceCommit: string
  missingTools: string[]
  reason: string
}

export type KdenliveProjectSnapshot = {
  documentUrl: string
  sequenceId: string
  /** Kept in the main process except while constructing a reviewed native call. */
  sessionId: string
  revision: number
  modified: boolean
  profile: { width: number; height: number; description: string }
  undo: { index: number; canUndo: boolean; canRedo: boolean; undoText: string; redoText: string }
  counts: Record<string, number>
}

export type VideoStudioView = {
  preferences: VideoStudioPreferences
  kdenliveVersion: string
  kdenliveReady: boolean
  mcpConnected: boolean
  mcpTools: string[]
  nativeKdenlive: NativeKdenliveStatus
  aiToolsUrl: string
  projectReady: boolean
  hasMcpToken: boolean
  hasPixabayKey: boolean
  keyEncryption: 'os' | 'none'
  notice: string
}

export type CreativeAsset = {
  token: string
  provider: CreativeProvider
  providerId: string
  kind: CreativeKind
  title: string
  creator: string
  sourcePage: string
  licence: string
  licenceUrl: string
  attribution: string
  width?: number
  height?: number
  duration?: number
  previewAvailable: boolean
}

export type CreativeSearchAnswer = {
  ok: boolean
  assets: CreativeAsset[]
  problems: string[]
  notice: string
}

export type CreativePreview = {
  ok: boolean
  token: string
  mime?: string
  data?: string
  error?: string
}

export type AssetReview = {
  ok: boolean
  token?: string
  asset?: CreativeAsset
  destination?: string
  consequence?: string
  expiresAt?: string
  error?: string
}

export type AssetInstallAnswer = {
  ok: boolean
  answer: string
  path?: string
  imported?: boolean
  receipt?: string
}

export type VideoUrlProvider = 'youtube' | 'tiktok' | 'instagram' | 'direct-media' | 'unknown'
export type VideoUrlPreflight = {
  ok: boolean
  token?: string
  url: string
  provider: VideoUrlProvider
  title: string
  duration?: number
  uploader?: string
  mediaType?: string
  estimatedBytes?: number
  method: 'yt-dlp-metadata' | 'direct-head' | 'none'
  warnings: string[]
  consequence: string
  error?: string
}

export type VideoEvidenceMoment = {
  at: number
  reason: 'overview' | 'scene-change' | 'question'
  score: number
  frame?: string
  ocr?: string
  description?: string
  descriptionState?: 'unconfirmed' | 'confirmed'
}

export type VideoEvidenceSummary = {
  id: string
  name: string
  sourceKind: 'file' | 'url'
  sourceUrl?: string
  sha256: string
  duration: number
  createdAt: string
  transcriptSections: number
  sceneChanges: number
  moments: VideoEvidenceMoment[]
  disclosure: string
  status: 'processing' | 'ready' | 'blocked'
  error?: string
}

export type VideoUrlAcquireAnswer = {
  ok: boolean
  answer: string
  path?: string
  sourceUrl?: string
  receipt?: string
  imported?: boolean
  evidence?: VideoEvidenceSummary
}

export type KdenlivePlanCommand = { type: string; [key: string]: unknown }
export type KdenliveEditPlan = {
  id: string
  title: string
  purpose: string
  sourceEvidenceIds: string[]
  expectedProject: { documentUrl: string; sequenceId: string; revision: number }
  commands: KdenlivePlanCommand[]
  assetNeeds: Array<{ kind: CreativeKind; query: string; purpose: string; placement: string }>
  notes: string
}
export type KdenlivePlanReview = {
  ok: boolean
  token?: string
  plan?: KdenliveEditPlan
  project?: Omit<KdenliveProjectSnapshot, 'sessionId'>
  commandSummary?: string[]
  validation?: { valid: boolean; issues: string[]; unsupported: boolean }
  consequence?: string
  expiresAt?: string
  error?: string
}
export type KdenliveHistoryEntry = { undoIndex: number; text: string; state: string; origin: string; timestamp?: string; command?: string }
export type CreativeProposal = { query: string; kind: CreativeKind; purpose: string; assets: CreativeAsset[]; createdAt: string }
export type VideoStudioWorkspace = {
  evidence: VideoEvidenceSummary[]
  proposedPlan: KdenliveEditPlan | null
  creativeProposal: CreativeProposal | null
  project: Omit<KdenliveProjectSnapshot, 'sessionId'> | null
  history: KdenliveHistoryEntry[]
  notice: string
}
export type EvidenceExpansion = { ok: boolean; evidence?: VideoEvidenceSummary; moments?: VideoEvidenceMoment[]; images?: Array<{ at: number; mime: string; data: string }>; audio?: Array<{ at: number; mime: string; data: string }>; answer: string }
export type KdenliveFrameCapture = { ok: boolean; position: number; mime?: string; data?: string; error?: string }

export type KdenliveToolReview = {
  ok: boolean
  token?: string
  tool?: string
  summary?: string
  expiresAt?: string
  error?: string
}

export type KdenliveAction = 'undo' | 'redo' | 'save-version'
export type DesignKitFormat = 'vertical' | 'landscape'
export type DesignKitReview = { ok: boolean; token?: string; destination?: string; files?: string[]; consequence?: string; expiresAt?: string; error?: string }

export type VideoStudioBridge = {
  read(): Promise<VideoStudioView>
  update(patch: Partial<VideoStudioPreferences>): Promise<VideoStudioView>
  chooseKdenlive(): Promise<VideoStudioView>
  chooseProjectFolder(): Promise<VideoStudioView>
  chooseYtDlp(): Promise<VideoStudioView>
  saveSecret(kind: 'mcp' | 'pixabay', value: string): Promise<VideoStudioView>
  clearSecret(kind: 'mcp' | 'pixabay'): Promise<VideoStudioView>
  testKdenlive(): Promise<VideoStudioView>
  openKdenlive(): Promise<{ ok: boolean; answer: string }>
  search(query: string, kind: CreativeKind): Promise<CreativeSearchAnswer>
  preview(token: string): Promise<CreativePreview>
  prepareAsset(token: string): Promise<AssetReview>
  decideAsset(token: string, decision: 'allow' | 'deny', importIntoKdenlive: boolean): Promise<AssetInstallAnswer>
  preflightUrl(url: string): Promise<VideoUrlPreflight>
  acquireUrl(token: string, decision: 'allow' | 'deny', importIntoKdenlive: boolean): Promise<VideoUrlAcquireAnswer>
  workspace(): Promise<VideoStudioWorkspace>
  captureKdenliveFrame(position: number): Promise<KdenliveFrameCapture>
  expandEvidence(id: string, moments: number[], question: string): Promise<EvidenceExpansion>
  confirmEvidenceDescription(id: string, at: number, description: string): Promise<{ ok: boolean; answer: string }>
  prepareEditPlan(plan?: KdenliveEditPlan): Promise<KdenlivePlanReview>
  decideEditPlan(token: string, decision: 'allow' | 'deny'): Promise<{ ok: boolean; answer: string; project?: Omit<KdenliveProjectSnapshot, 'sessionId'> }>
  prepareKdenliveAction(action: KdenliveAction): Promise<KdenliveToolReview>
  decideKdenliveAction(token: string, decision: 'allow' | 'deny'): Promise<{ ok: boolean; answer: string }>
  stop(): Promise<{ ok: boolean; answer: string }>
  prepareDesignKit(format: DesignKitFormat): Promise<DesignKitReview>
  decideDesignKit(token: string, decision: 'allow' | 'deny', importTitleIntoKdenlive: boolean): Promise<AssetInstallAnswer>
}

/**
 * Pick overview moments first, then high-confidence scene changes far enough
 * apart to add new evidence. This plans visual evidence; it never sends frames.
 */
export function adaptiveFramePoints(duration: number, sceneCandidates: Array<{ at: number; score: number }>, count = 3): Array<{ at: number; reason: 'overview' | 'scene-change'; score: number }> {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isInteger(count) || count < 1) return []
  const wanted = Math.min(count, 12), margin = Math.min(1, duration * 0.02), gap = Math.max(1, duration / Math.max(12, wanted * 4))
  const scenes = sceneCandidates
    .filter(item => Number.isFinite(item.at) && item.at >= margin && item.at <= duration - margin && Number.isFinite(item.score) && item.score >= 0)
    .sort((a, b) => b.score - a.score || a.at - b.at)
  const selected: Array<{ at: number; reason: 'overview' | 'scene-change'; score: number }> = []
  for (const scene of scenes) {
    if (selected.every(item => Math.abs(item.at - scene.at) >= gap)) selected.push({ at: scene.at, reason: 'scene-change', score: scene.score })
    if (selected.length >= wanted) break
  }
  for (let index = 0; selected.length < wanted && index < wanted * 3; index++) {
    const at = duration * ((index + 1) / (wanted * 3 + 1))
    if (selected.every(item => Math.abs(item.at - at) >= gap / 2)) selected.push({ at, reason: 'overview', score: 0 })
  }
  if (!selected.length) selected.push({ at: duration / 2, reason: 'overview', score: 0 })
  return selected.slice(0, wanted).sort((a, b) => a.at - b.at)
}

export function parseSceneMetadata(value: string): Array<{ at: number; score: number }> {
  if (typeof value !== 'string' || value.length > 4_000_000) return []
  const found: Array<{ at: number; score: number }> = []
  let at: number | undefined
  for (const line of value.split(/\r?\n/)) {
    const time = line.match(/(?:pts_time|lavfi\.scene_time)[:=]([\d.]+)/)
    if (time) at = Number(time[1])
    const score = line.match(/lavfi\.scene_score=([\d.]+)/)
    if (score && Number.isFinite(at)) {
      const value = Number(score[1])
      if (Number.isFinite(value)) found.push({ at: at!, score: value })
      at = undefined
    }
  }
  return found.slice(0, 10_000)
}

export function classifyVideoUrl(value: unknown): { ok: true; url: URL; provider: VideoUrlProvider } | { ok: false; error: string } {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u001f]/.test(value)) return { ok: false, error: 'Paste one normal HTTPS video URL.' }
  let url: URL
  try { url = new URL(value.trim()) } catch { return { ok: false, error: 'That is not a valid URL.' } }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return { ok: false, error: 'Only credential-free HTTPS video links are accepted.' }
  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const provider: VideoUrlProvider = host === 'youtu.be' || host.endsWith('.youtube.com') || host === 'youtube.com' ? 'youtube'
    : host === 'tiktok.com' || host.endsWith('.tiktok.com') ? 'tiktok'
    : host === 'instagram.com' || host.endsWith('.instagram.com') ? 'instagram'
    : /\.(?:mp4|webm|mov|mkv|m4v)$/i.test(url.pathname) ? 'direct-media' : 'unknown'
  return { ok: true, url, provider }
}
