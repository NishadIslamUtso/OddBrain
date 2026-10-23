/**
 * Kdenlive-centred Video Studio contracts.
 *
 * OddBrain owns understanding, licensed-asset discovery and reviewed AI actions.
 * Kdenlive owns the editable timeline, monitor, undo and render. Remote catalogue
 * entries stay remote until the owner approves one exact project download.
 */

export type CreativeKind = 'image' | 'video' | 'audio'
export type CreativeProvider = 'openverse' | 'wikimedia' | 'pixabay'
export type CreativeUse = 'commercial-or-public' | 'noncommercial'
export type CreativeLicenceRisk = 'standard' | 'noncommercial' | 'no-derivatives' | 'noncommercial-no-derivatives' | 'unknown'

export type VideoStudioPreferences = {
  kdenlive: string
  mcpUrl: string
  projectFolder: string
  ytDlp: string
  /** Zero means no owner-selected ceiling. Streaming disk-space protection still applies. */
  maxDownloadBytes: number
}

export const DEFAULT_VIDEO_STUDIO: VideoStudioPreferences = {
  kdenlive: '',
  // OddBrain's established browser companion owns 8765. Configure the
  // separately installed Kdenlive fork to 8766 so both local services work.
  mcpUrl: 'http://127.0.0.1:8766/mcp',
  projectFolder: '',
  ytDlp: '',
  maxDownloadBytes: 0,
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
  const maximum = Number(raw.maxDownloadBytes)
  return {
    kdenlive: cleanText(raw.kdenlive, 4096),
    mcpUrl: normalizeMcpUrl(raw.mcpUrl),
    projectFolder: cleanText(raw.projectFolder, 4096),
    ytDlp: cleanText(raw.ytDlp, 4096),
    maxDownloadBytes: Number.isSafeInteger(maximum) && maximum >= 0 ? maximum : 0,
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
  profile: { width: number; height: number; description: string; duration?: number; fps?: number }
  undo: { index: number; canUndo: boolean; canRedo: boolean; undoText: string; redoText: string }
  counts: Record<string, number>
}

/** Safe project identity exposed to renderers and AI. Native URL/session remain main-process-only. */
export type KdenlivePublicProject = Omit<KdenliveProjectSnapshot, 'documentUrl' | 'sessionId'> & {
  projectHandle: string
  projectName: string
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
  intendedUse: CreativeUse
  licenceRisk: CreativeLicenceRisk
  licenceNotice: string
  downloadAllowed: boolean
  width?: number
  height?: number
  duration?: number
  mediaType?: string
  previewAvailable: boolean
}

export type CreativeSearchAnswer = {
  ok: boolean
  assets: CreativeAsset[]
  problems: string[]
  notice: string
  page?: number
  hasMore?: boolean
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
  binId?: string
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

export type VideoEvidenceDiagnostic = { area: 'audio-levels' | 'pauses' | 'scene-changes'; status: 'complete' | 'empty' | 'failed'; message: string }

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
  audioWindows?: number
  diagnostics?: VideoEvidenceDiagnostic[]
  moments: VideoEvidenceMoment[]
  disclosure: string
  status: 'processing' | 'ready' | 'blocked'
  /** Number of local reading attempts. Interrupted attempts reopen as blocked, never as silently resumed work. */
  attempts?: number
  updatedAt?: string
  error?: string
}

export type LocalVideoIntakeReview = {
  ok: boolean
  token?: string
  name: string
  bytes: number
  ocrAvailable: boolean
  consequence: string
  expiresAt?: string
  error?: string
}

export type VideoUrlAcquireAnswer = {
  ok: boolean
  answer: string
  path?: string
  sourceUrl?: string
  receipt?: string
  imported?: boolean
  binId?: string
  evidence?: VideoEvidenceSummary
}

export type KdenlivePlanCommand = { type: string; [key: string]: unknown }
export type KdenliveEditPlan = {
  id: string
  title: string
  purpose: string
  sourceEvidenceIds: string[]
  expectedProject: { projectHandle: string; sequenceId: string; revision: number }
  commands: KdenlivePlanCommand[]
  assetNeeds: Array<{ kind: CreativeKind; query: string; purpose: string; placement: string }>
  notes: string
}
export type KdenlivePlanReview = {
  ok: boolean
  token?: string
  plan?: KdenliveEditPlan
  planJson?: string
  planDigest?: string
  project?: KdenlivePublicProject
  commandSummary?: string[]
  validation?: { valid: boolean; issues: string[]; unsupported: boolean }
  consequence?: string
  expiresAt?: string
  error?: string
}
export type KdenliveHistoryEntry = { undoIndex: number; text: string; state: string; origin: string; timestamp?: string; command?: string }
export type CreativeProposal = { query: string; kind: CreativeKind; purpose: string; intendedUse: CreativeUse; assets: CreativeAsset[]; createdAt: string }
export type VideoStudioWorkspace = {
  evidence: VideoEvidenceSummary[]
  proposedPlan: KdenliveEditPlan | null
  creativeProposal: CreativeProposal | null
  project: KdenlivePublicProject | null
  history: KdenliveHistoryEntry[]
  notice: string
}
export type EvidenceExpansion = { ok: boolean; evidence?: VideoEvidenceSummary; moments?: VideoEvidenceMoment[]; images?: Array<{ at: number; mime: string; data: string }>; audio?: Array<{ at: number; mime: string; data: string }>; answer: string }
export type VideoEvidenceFrame = { ok: boolean; sourceId: string; at: number; mime?: string; data?: string; error?: string }
export type KdenliveFrameCapture = { ok: boolean; position: number; mime?: string; data?: string; error?: string }
export type KdenliveRenderMode = 'preview' | 'export'
export type KdenliveOutputIntent = 'vertical-short' | 'current-sequence'
export type KdenliveAudioIntent = 'required' | 'silent' | 'unspecified'
export type KdenliveRenderReview = { ok: boolean; token?: string; mode?: KdenliveRenderMode; intent?: KdenliveOutputIntent; audioIntent?: KdenliveAudioIntent; destination?: string; range?: { start: number; end: number }; profile?: { width: number; height: number; fps?: number; durationSeconds?: number }; consequence?: string; expiresAt?: string; error?: string }
export type KdenliveRenderJob = { path: string; mode: KdenliveRenderMode; range?: { start: number; end: number }; status: string; progress?: number; error?: string; startedAt?: string; verification?: Record<string, unknown> }
export type KdenliveRenderStatus = { ok: boolean; jobs: KdenliveRenderJob[]; answer: string }
export type KdenlivePreviewInspectionReview = { ok: boolean; token?: string; path?: string; consequence?: string; expiresAt?: string; error?: string }

export type KdenliveToolReview = {
  ok: boolean
  token?: string
  tool?: string
  summary?: string
  expiresAt?: string
  error?: string
}

export type KdenliveAction = 'undo' | 'redo' | 'save-version' | 'make-vertical'
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
  search(query: string, kind: CreativeKind, page?: number, intendedUse?: CreativeUse): Promise<CreativeSearchAnswer>
  preview(token: string): Promise<CreativePreview>
  prepareAsset(token: string): Promise<AssetReview>
  decideAsset(token: string, decision: 'allow' | 'deny', importIntoKdenlive: boolean): Promise<AssetInstallAnswer>
  chooseLocalVideo(): Promise<LocalVideoIntakeReview>
  decideLocalVideo(token: string, decision: 'allow' | 'deny', storage: 'in-place' | 'private-copy', videoOcr: boolean): Promise<{ ok: boolean; answer: string; evidence?: VideoEvidenceSummary }>
  preflightUrl(url: string): Promise<VideoUrlPreflight>
  acquireUrl(token: string, decision: 'allow' | 'deny', importIntoKdenlive: boolean): Promise<VideoUrlAcquireAnswer>
  workspace(): Promise<VideoStudioWorkspace>
  captureKdenliveFrame(position: number): Promise<KdenliveFrameCapture>
  prepareKdenliveRender(mode: KdenliveRenderMode, start?: number, end?: number, intent?: KdenliveOutputIntent, audioIntent?: KdenliveAudioIntent): Promise<KdenliveRenderReview>
  decideKdenliveRender(token: string, decision: 'allow' | 'deny'): Promise<{ ok: boolean; answer: string }>
  kdenliveRenderStatus(): Promise<KdenliveRenderStatus>
  prepareKdenlivePreviewInspection(path: string, videoOcr: boolean): Promise<KdenlivePreviewInspectionReview>
  decideKdenlivePreviewInspection(token: string, decision: 'allow' | 'deny'): Promise<{ ok: boolean; answer: string; evidence?: VideoEvidenceSummary }>
  expandEvidence(id: string, moments: number[], question: string): Promise<EvidenceExpansion>
  readEvidenceFrame(id: string, at: number): Promise<VideoEvidenceFrame>
  retryEvidence(id: string): Promise<{ ok: boolean; answer: string; evidence?: VideoEvidenceSummary }>
  confirmEvidenceDescription(id: string, at: number, description: string): Promise<{ ok: boolean; answer: string }>
  prepareEditPlan(plan?: KdenliveEditPlan): Promise<KdenlivePlanReview>
  decideEditPlan(token: string, decision: 'allow' | 'deny'): Promise<{ ok: boolean; answer: string; project?: KdenlivePublicProject }>
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
  const wanted = Math.min(count, 12)
  // Give every requested frame a time slot across the complete source. A strong
  // scene change may replace that slot's overview point, but cannot crowd every
  // retained frame into the opening or another busy section.
  const slot = duration / wanted
  const gap = Math.max(0.001, Math.min(1, slot / 4))
  const scenes = sceneCandidates
    .filter(item => Number.isFinite(item.at) && item.at >= 0 && item.at < duration && Number.isFinite(item.score) && item.score >= 0)
  const used = new Set<number>()
  const selected: Array<{ at: number; reason: 'overview' | 'scene-change'; score: number }> = []
  for (let index = 0; index < wanted; index++) {
    const target = Math.min(duration - Math.min(0.001, duration / 2), slot * (index + 0.5))
    const nearby = scenes
      .map((scene, sceneIndex) => ({ scene, sceneIndex }))
      .filter(item => !used.has(item.sceneIndex) && Math.abs(item.scene.at - target) <= slot * 0.45 && selected.every(chosen => Math.abs(chosen.at - item.scene.at) >= gap))
      .sort((a, b) => b.scene.score - a.scene.score || Math.abs(a.scene.at - target) - Math.abs(b.scene.at - target))[0]
    if (nearby) {
      used.add(nearby.sceneIndex)
      selected.push({ at: nearby.scene.at, reason: 'scene-change', score: nearby.scene.score })
    } else selected.push({ at: target, reason: 'overview', score: 0 })
  }
  return selected.sort((a, b) => a.at - b.at)
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
