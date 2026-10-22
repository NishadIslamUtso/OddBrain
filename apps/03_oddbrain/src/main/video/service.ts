import { createHash, randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { lstat, mkdir, open, realpath, rename, rm, statfs, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative } from 'node:path'
import { spawn } from 'node:child_process'
import { boundedResponse } from '../network/boundedResponse'
import { readRecoverableJson, writeRecoverableJson } from '../recoverableJson'
import { runMediaCommand } from '../media/process'
import type { KeyStore } from '../cloud/keys'
import {
  DEFAULT_VIDEO_STUDIO,
  classifyVideoUrl,
  normalizeMcpUrl,
  normalizeVideoStudio,
  type AssetInstallAnswer,
  type AssetReview,
  type CreativeAsset,
  type CreativeKind,
  type CreativePreview,
  type CreativeProvider,
  type CreativeSearchAnswer,
  type DesignKitFormat,
  type DesignKitReview,
  type CreativeProposal,
  type EvidenceExpansion,
  type KdenliveAction,
  type KdenliveEditPlan,
  type KdenliveHistoryEntry,
  type KdenlivePlanReview,
  type KdenliveProjectSnapshot,
  type KdenlivePreviewInspectionReview,
  type KdenliveOutputIntent,
  type KdenliveRenderJob,
  type KdenliveRenderMode,
  type KdenliveRenderReview,
  type KdenliveRenderStatus,
  type KdenliveToolReview,
  type VideoEvidenceFrame,
  type VideoEvidenceMoment,
  type VideoEvidenceSummary,
  type VideoStudioPreferences,
  type VideoStudioView,
  type VideoStudioWorkspace,
  type VideoUrlAcquireAnswer,
  type VideoUrlPreflight,
} from '../../shared/lib/videoStudio'
import type { MediaAudioWindow, MediaResult } from '../../shared/lib/mediaBridge'
import { NATIVE_KDENLIVE_REFERENCE, commandSummary, nativeCompatibility, normalizeEditPlan, projectSnapshot, toolPayload } from './nativeProtocol'

type PrivateAsset = { public: CreativeAsset; previewUrl: string; downloadUrl: string; expires: number; owner: number }
type AssetApproval = { asset: PrivateAsset; destination: string; preferences: string; expires: number; owner: number }
type UrlApproval = { preflight: VideoUrlPreflight; source: URL; expires: number; owner: number }
type McpTool = { name: string; description?: string; inputSchema?: { properties?: Record<string, unknown>; required?: string[] } }
type McpConnection = { session: string; tools: McpTool[]; serverInfo: unknown; protocol: string; native: ReturnType<typeof nativeCompatibility> }
type StoredEvidence = VideoEvidenceSummary & {
  sourcePath: string
  sourceText: string
  transcript: string
  transcriptSegments: Array<{ id: string; label: string; text: string }>
  scenes: Array<{ at: number; score: number }>
  audioWindows: MediaAudioWindow[]
  frameFiles: Array<{ at: number; path: string; mime: string }>
  raw: { sourceReceipt?: string; videoOcr?: boolean }
  unconfirmed: { descriptions: Array<{ at: number; description: string; question: string; createdAt: string }> }
  confirmed: { descriptions: Array<{ at: number; description: string; confirmedAt: string }> }
}
type EditPlanApproval = { owner: number; plan: KdenliveEditPlan; state: KdenliveProjectSnapshot; validation: { valid: boolean; issues: string[]; unsupported: boolean }; preferences: string; expires: number }
type RenderApproval = { owner: number; mode: KdenliveRenderMode; intent: KdenliveOutputIntent; state: KdenliveProjectSnapshot; destination: string; range?: { start: number; end: number }; preferences: string; expires: number }
type PreviewInspectionApproval = { owner: number; path: string; videoOcr: boolean; size: number; dev: number; ino: number; mtimeMs: number; preferences: string; expires: number }
type AiMcpReply = { status: number; body: unknown; session?: string }

const MCP_KEY = 'oddbrain-kdenlive-mcp'
const PIXABAY_KEY = 'oddbrain-pixabay'
const MAX_CATALOGUE_RESPONSE = 4_000_000
const clock = (): number => Date.now()
const expiresAt = (milliseconds: number): string => new Date(milliseconds).toISOString()
const safePart = (value: string): string => value.normalize('NFKC').replace(/[^a-zA-Z0-9._ -]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 90) || 'asset'
const text = (value: unknown, max = 500): string => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f]/.test(value) ? value.trim() : ''
const finite = (value: unknown): number | undefined => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : undefined
const preferencesDigest = (value: VideoStudioPreferences): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')

function publicAsset(input: Omit<CreativeAsset, 'token'>, token: string): CreativeAsset { return { ...input, token } }
function providerNotice(provider: CreativeProvider): string {
  if (provider === 'pixabay') return 'Pixabay result. Source identification and Pixabay’s current content rules still apply.'
  if (provider === 'openverse') return 'Openverse indexes third-party works. Verify the shown licence and source before publishing.'
  return 'Wikimedia Commons result. The individual file page is the licence authority.'
}

function privateAddress(value: string): boolean {
  if (value === '::1' || value === '0:0:0:0:0:0:0:1') return true
  if (/^10\.|^127\.|^169\.254\.|^192\.168\.|^0\./.test(value)) return true
  const match = value.match(/^172\.(\d+)\./); if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true
  const lower = value.toLowerCase()
  return lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:') || lower === '::'
}

async function assertPublicHttps(url: URL): Promise<void> {
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw Error('The selected asset is not a credential-free HTTPS download.')
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw Error('The selected asset resolves to a local address and was refused.')
  if (isIP(host)) { if (privateAddress(host)) throw Error('The selected asset resolves to a private address and was refused.'); return }
  const addresses = await lookup(host, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(item => privateAddress(item.address))) throw Error('The selected asset did not resolve only to public addresses.')
}

async function jsonResponse(response: Response, provider: string): Promise<any> {
  const raw = await boundedResponse(response, MAX_CATALOGUE_RESPONSE, `${provider} returned an unexpectedly large catalogue response.`)
  if (!response.ok) throw Error(`${provider} search failed (HTTP ${response.status}).`)
  try { return JSON.parse(raw) } catch { throw Error(`${provider} returned unreadable search results.`) }
}

async function fetchFixedJson(fetchImpl: typeof fetch, url: string, provider: string): Promise<any> {
  const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(30_000), headers: { Accept: 'application/json', 'User-Agent': 'OddBrain/0.9 CreativeLibrary' } })
  return jsonResponse(response, provider)
}

function localDesignFiles(format: DesignKitFormat): Record<string, string> {
  const vertical = format === 'vertical', width = vertical ? 1080 : 1920, height = vertical ? 1920 : 1080, lowerY = Math.round(height * 0.76)
  const title = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#171923"/><stop offset="0.55" stop-color="#33245c"/><stop offset="1" stop-color="#d46b52"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#bg)"/><circle cx="${Math.round(width * 0.82)}" cy="${Math.round(height * 0.2)}" r="${Math.round(width * 0.22)}" fill="#ffffff" opacity=".08"/><rect x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.39)}" width="${Math.round(width * 0.12)}" height="8" rx="4" fill="#f4b860"/><text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.49)}" fill="#fff" font-family="sans-serif" font-weight="700" font-size="${Math.round(width * 0.09)}">YOUR TITLE</text><text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.55)}" fill="#fff" opacity=".8" font-family="sans-serif" font-size="${Math.round(width * 0.035)}">Replace this text in Kdenlive</text></svg>\n`
  const lowerThird = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="${Math.round(width * 0.06)}" y="${lowerY}" width="${Math.round(width * 0.68)}" height="${Math.round(height * 0.13)}" rx="24" fill="#11131a" opacity=".9"/><rect x="${Math.round(width * 0.06)}" y="${lowerY}" width="12" height="${Math.round(height * 0.13)}" rx="6" fill="#f4b860"/><text x="${Math.round(width * 0.1)}" y="${lowerY + Math.round(height * 0.057)}" fill="#fff" font-family="sans-serif" font-weight="700" font-size="${Math.round(width * 0.045)}">NAME OR TOPIC</text><text x="${Math.round(width * 0.1)}" y="${lowerY + Math.round(height * 0.095)}" fill="#fff" opacity=".72" font-family="sans-serif" font-size="${Math.round(width * 0.026)}">Supporting detail</text></svg>\n`
  const captions = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: OddBrain Short,Arial,${vertical ? 62 : 54},&H00FFFFFF,&H000000FF,&H00111111,&H99000000,-1,0,0,0,100,100,0,0,1,5,1,2,70,70,${vertical ? 220 : 85},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`
  const lut: string[] = ['TITLE "OddBrain Soft Warm"', 'LUT_3D_SIZE 17', 'DOMAIN_MIN 0.0 0.0 0.0', 'DOMAIN_MAX 1.0 1.0 1.0']
  for (let blue = 0; blue < 17; blue++) for (let green = 0; green < 17; green++) for (let red = 0; red < 17; red++) lut.push(`${Math.min(1, red / 16 * 1.025).toFixed(6)} ${Math.min(1, green / 16 * 1.005).toFixed(6)} ${Math.max(0, blue / 16 * 0.97).toFixed(6)}`)
  const shapes = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g fill="none" stroke="#f4b860" stroke-width="${Math.max(6, Math.round(width * .008))}"><circle cx="${width * .22}" cy="${height * .28}" r="${width * .12}"/><rect x="${width * .48}" y="${height * .17}" width="${width * .34}" height="${height * .22}" rx="${width * .05}"/><path d="M ${width * .14} ${height * .68} C ${width * .33} ${height * .5}, ${width * .58} ${height * .86}, ${width * .86} ${height * .62}"/></g></svg>\n`
  const gradient = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="fade" x1="0" y1="1" x2="0" y2="0"><stop stop-color="#090a10" stop-opacity=".9"/><stop offset=".62" stop-color="#18152a" stop-opacity=".2"/><stop offset="1" stop-color="#d46b52" stop-opacity="0"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#fade)"/></svg>\n`
  const cleanCaptions = captions.replace('Style: OddBrain Short', 'Style: OddBrain Clean').replace(vertical ? ',62,' : ',54,', vertical ? ',50,' : ',44,').replace('&H00111111,&H99000000', '&H00202020,&H66000000')
  const recipes = JSON.stringify({ schema: 1, format, canvas: { width, height }, authority: 'Apply only through the reviewed native Kdenlive MCP batch; Kdenlive owns animation, effects, Undo and preview.', captionFamilies: [{ name: 'bold-outline', file: 'captions-bold.ass' }, { name: 'clean', file: 'captions-clean.ass' }], titleRecipes: [{ name: 'soft-card', tool: 'desktop_title_create', animateWith: ['desktop_effect_add', 'desktop_effect_set'], note: 'Create a native title, then review exact keyframes.' }, { name: 'boxed-lower-third', tool: 'desktop_title_create', sourceArtwork: 'lower-third.svg' }], transitionRecipes: [{ name: 'fade-through-black', operations: ['clip_fade'], durationRule: '6–12 frames after footage review; this is a clip fade, not a cross-track dissolve' }, { name: 'cross-dissolve', manualInKdenlive: true, reason: 'The pinned native protocol reads compositions but does not create them; never report this recipe as applied.' }], effectPresets: [{ name: 'gentle-punch-in', operation: 'reframe', review: 'Check faces and text safe areas.' }, { name: 'music-under-speech', operation: 'audio_duck', review: 'Listen to the preview; do not infer a safe mix from numbers alone.' }], shapes: ['accent-shapes.svg'], gradients: ['gradient-overlay.svg'], colourLooks: ['soft-warm.cube'] }, null, 2) + '\n'
  return { 'title-card.svg': title, 'lower-third.svg': lowerThird, 'accent-shapes.svg': shapes, 'gradient-overlay.svg': gradient, 'captions-bold.ass': captions, 'captions-clean.ass': cleanCaptions, 'soft-warm.cube': `${lut.join('\n')}\n`, 'kdenlive-recipes.json': recipes, 'README.md': `# OddBrain ${format} design kit\n\nLocally generated reusable source assets and native Kdenlive recipe data. It includes two editable title artworks, shapes, a gradient overlay, two caption families, a restrained colour LUT, and reviewed-protocol recipes for animated titles, transitions, reframing, effects and music ducking. Recipes are proposals, not rendered templates: Kdenlive remains responsible for exact animation, transitions, effects, preview, Undo, rendering, and export. Review colours, fonts, safe areas, contrast, timing, motion and the LUT on the actual footage before publishing.\n` }
}

function parseMcp(raw: string): any {
  const body = raw.trim()
  if (!body) return null
  if (body.startsWith('{')) return JSON.parse(body)
  const data = body.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).filter(Boolean).at(-1)
  if (!data) throw Error('Kdenlive MCP returned no JSON message.')
  return JSON.parse(data)
}

export function createVideoStudioService(options: {
  file: string
  keys(): KeyStore | null
  fetchImpl?: typeof fetch
  runCommand?: typeof runMediaCommand
  launch?: (command: string, args: string[]) => void
  /** Test seam only; production always performs DNS/private-address checks. */
  assertRemote?: (url: URL) => Promise<void>
  now?: () => number
  analyzeVideo?: (owner: number, path: string, videoOcr?: boolean) => Promise<MediaResult>
  videoOcrAvailable?: () => boolean
  expandVideoEvidence?: (path: string, moments: number[], videoOcr: boolean, signal?: AbortSignal) => Promise<{ sha256: string; duration: number; images: NonNullable<MediaResult['images']>; audio?: Array<{ at: number; mime: string; data: string }>; visualEvidence: NonNullable<MediaResult['visualEvidence']> }>
  stopVideoAnalysis?: (owner: number) => void
}) {
  const fetchImpl = options.fetchImpl || fetch, runCommand = options.runCommand || runMediaCommand, now = options.now || clock, checkRemote = options.assertRemote || assertPublicHttps
  let preferences = { ...DEFAULT_VIDEO_STUDIO }
  try { preferences = readRecoverableJson(options.file, normalizeVideoStudio, DEFAULT_VIDEO_STUDIO).value } catch {}
  let lastVersion = '', lastConnection: McpConnection | null = null, lastNotice = '', aiToolsUrl = ''
  let proposedPlan: KdenliveEditPlan | null = null, creativeProposal: CreativeProposal | null = null
  const evidenceFile = join(dirname(options.file), 'video-evidence-v1.json')
  let storedEvidence: StoredEvidence[] = []
  try {
    storedEvidence = readRecoverableJson(evidenceFile, value => {
      if (!Array.isArray(value)) return []
      return value.filter(item => item && typeof item === 'object' && typeof item.id === 'string' && typeof item.sourcePath === 'string' && typeof item.sha256 === 'string') as StoredEvidence[]
    }, []).value
  } catch { /* first use or an unrecoverable evidence index */ }
  const assets = new Map<string, PrivateAsset>(), approvals = new Map<string, AssetApproval>(), urls = new Map<string, UrlApproval>()
  const editorActions = new Map<string, { owner: number; action: KdenliveAction; tool: string; args: Record<string, unknown>; preferences: string; expires: number }>(), editPlans = new Map<string, EditPlanApproval>(), renderApprovals = new Map<string, RenderApproval>(), activeRenders = new Map<string, { owner: number; mode: KdenliveRenderMode; range?: { start: number; end: number }; startedAt: string; status: string; verified?: boolean }>(), designKits = new Map<string, { owner: number; format: DesignKitFormat; destination: string; preferences: string; expires: number }>(), transfers = new Map<number, AbortController>(), mcpJobs = new Map<number, AbortController>()
  const previewInspections = new Map<string, PreviewInspectionApproval>()
  const aiSessions = new Map<string, number>()
  const saveEvidence = (): void => writeRecoverableJson(evidenceFile, storedEvidence)
  const renderReceiptsFile = join(dirname(options.file), 'video-render-receipts-v1.json')
  try {
    const retained = readRecoverableJson<{ schema: 1; renders: Array<{ path: string; mode: KdenliveRenderMode; range?: { start: number; end: number }; startedAt: string; status: string; verified?: boolean }> }>(renderReceiptsFile, value => {
      if (!plain(value) || value.schema !== 1 || !Array.isArray(value.renders)) throw Error('Invalid video render receipt index.')
      return value as { schema: 1; renders: Array<{ path: string; mode: KdenliveRenderMode; range?: { start: number; end: number }; startedAt: string; status: string; verified?: boolean }> }
    }, { schema: 1, renders: [] }).value
    for (const item of retained.renders) {
      const range = item.range && Number.isSafeInteger(item.range.start) && Number.isSafeInteger(item.range.end) && item.range.start >= 0 && item.range.end > item.range.start ? item.range : undefined
      if (typeof item?.path === 'string' && item.path.length <= 32_768 && isAbsolute(item.path) && ['preview', 'export'].includes(item.mode) && typeof item.startedAt === 'string' && typeof item.status === 'string') activeRenders.set(item.path, { owner: -1, mode: item.mode, ...(range ? { range } : {}), startedAt: item.startedAt.slice(0, 100), status: item.status.slice(0, 100), ...(item.verified === true ? { verified: true } : {}) })
    }
  } catch { /* malformed receipts fail closed; Kdenlive remains the render authority */ }
  const saveRenderReceipts = (): void => writeRecoverableJson(renderReceiptsFile, { schema: 1, renders: [...activeRenders].map(([path, value]) => ({ path, mode: value.mode, ...(value.range ? { range: value.range } : {}), startedAt: value.startedAt, status: value.status, ...(value.verified ? { verified: true } : {}) })) })
  // A process restart never turns an interrupted decoder into an implied retry.
  // The durable intake remains linked to its original path/receipt and waits for
  // the owner to press Retry in Video Studio.
  let recoveredInterrupted = false
  storedEvidence = storedEvidence.map(item => {
    const safe: StoredEvidence = { ...item, raw: item.raw && typeof item.raw === 'object' ? item.raw : {}, unconfirmed: item.unconfirmed && Array.isArray(item.unconfirmed.descriptions) ? item.unconfirmed : { descriptions: [] }, confirmed: item.confirmed && Array.isArray(item.confirmed.descriptions) ? item.confirmed : { descriptions: [] }, transcriptSegments: Array.isArray(item.transcriptSegments) ? item.transcriptSegments : [], scenes: Array.isArray(item.scenes) ? item.scenes : [], audioWindows: Array.isArray(item.audioWindows) ? item.audioWindows : [], frameFiles: Array.isArray(item.frameFiles) ? item.frameFiles : [], moments: Array.isArray(item.moments) ? item.moments : [] }
    if (safe.status !== 'processing') return safe
    recoveredInterrupted = true
    return { ...safe, status: 'blocked', updatedAt: new Date(now()).toISOString(), error: 'OddBrain closed or restarted while this source was being read. The source and receipt were retained; retry explicitly from Video Studio.' }
  })
  if (recoveredInterrupted) saveEvidence()
  const publicEvidence = (value: StoredEvidence): VideoEvidenceSummary => ({ id: value.id, name: value.name, sourceKind: value.sourceKind, ...(value.sourceUrl ? { sourceUrl: value.sourceUrl } : {}), sha256: value.sha256, duration: value.duration, createdAt: value.createdAt, transcriptSections: value.transcriptSections, sceneChanges: value.sceneChanges, audioWindows: value.audioWindows.length, moments: value.moments.map(moment => { const copy = { ...moment }; delete copy.frame; return copy }), disclosure: value.disclosure, status: value.status, ...(Number.isSafeInteger(value.attempts) ? { attempts: value.attempts } : {}), ...(value.updatedAt ? { updatedAt: value.updatedAt } : {}), ...(value.error ? { error: value.error } : {}) })

  const prune = (): void => {
    const at = now()
    for (const [key, value] of assets) if (value.expires <= at) assets.delete(key)
    for (const [key, value] of approvals) if (value.expires <= at) approvals.delete(key)
    for (const [key, value] of urls) if (value.expires <= at) urls.delete(key)
    for (const [key, value] of editorActions) if (value.expires <= at) editorActions.delete(key)
    for (const [key, value] of editPlans) if (value.expires <= at) editPlans.delete(key)
    for (const [key, value] of renderApprovals) if (value.expires <= at) renderApprovals.delete(key)
    for (const [key, value] of previewInspections) if (value.expires <= at) previewInspections.delete(key)
    for (const [key, value] of designKits) if (value.expires <= at) designKits.delete(key)
    for (const [key, touched] of aiSessions) if (touched + 30 * 60_000 <= at) aiSessions.delete(key)
  }
  const save = (patch: Partial<VideoStudioPreferences>): VideoStudioPreferences => {
    for (const key of ['kdenlive', 'projectFolder', 'ytDlp'] as const) if (patch[key] !== undefined && (typeof patch[key] !== 'string' || patch[key]!.length > 4096 || /[\u0000\r\n]/.test(patch[key]!))) throw Error('Video path setting is invalid. Nothing was saved.')
    if (patch.mcpUrl !== undefined && normalizeMcpUrl(patch.mcpUrl) !== String(patch.mcpUrl).trim()) throw Error('Kdenlive MCP must be credential-free loopback HTTP, such as http://127.0.0.1:8765/mcp. Nothing was saved.')
    const next = normalizeVideoStudio({ ...preferences, ...patch })
    writeRecoverableJson(options.file, next); preferences = next; lastConnection = null; return { ...next }
  }
  const regularFile = async (path: string): Promise<boolean> => {
    if (!path) return false
    try { const value = await lstat(path); return value.isFile() && !value.isSymbolicLink() } catch { return false }
  }
  const realFolder = async (path: string): Promise<boolean> => {
    if (!path) return false
    try { const value = await lstat(path); return value.isDirectory() && !value.isSymbolicLink() } catch { return false }
  }
  const safeProjectDirectory = async (...parts: string[]): Promise<string> => {
    if (!await realFolder(preferences.projectFolder)) throw Error('The selected project folder is unavailable or linked. Nothing was written.')
    const root = await realpath(preferences.projectFolder); let current = root
    for (const part of parts) {
      if (!part || part === '.' || part === '..' || part.includes('/') || part.includes('\\')) throw Error('Unsafe project subfolder was refused.')
      const candidate = join(current, part)
      try { const info = await lstat(candidate); if (!info.isDirectory() || info.isSymbolicLink()) throw Error('A required project subfolder is not a normal folder. Nothing was written.') }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await mkdir(candidate, { mode: 0o700 }) }
      const actual = await realpath(candidate), back = relative(root, actual)
      if (!back || back.startsWith('..') || isAbsolute(back)) throw Error('A project subfolder escaped the selected project. Nothing was written.')
      current = actual
    }
    return current
  }

  const mcpRequest = async (method: string, params: unknown, session = '', notification = false, signal?: AbortSignal): Promise<{ value: any; session: string }> => {
    const url = new URL(preferences.mcpUrl)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.protocol !== 'http:') throw Error('Kdenlive MCP must use loopback HTTP.')
    const key = options.keys()?.get(MCP_KEY) || ''
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }
    if (key) headers.Authorization = `Bearer ${key}`
    if (session) headers['Mcp-Session-Id'] = session
    const request = { jsonrpc: '2.0', ...(notification ? {} : { id: randomUUID() }), method, params }
    const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000)
    const response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(request), redirect: 'error', signal: requestSignal })
    const raw = await boundedResponse(response, 8_000_000, 'Kdenlive MCP response exceeded the 8 MB local preview/evidence limit.')
    if (!response.ok) throw Error(`Kdenlive MCP refused the request (HTTP ${response.status}).`)
    const value = parseMcp(raw), nextSession = response.headers.get('mcp-session-id') || session
    if (value?.error?.message) throw Error(`Kdenlive MCP: ${String(value.error.message).slice(0, 500)}`)
    return { value: value?.result, session: nextSession }
  }

  const connectMcp = async (): Promise<McpConnection> => {
    const initialized = await mcpRequest('initialize', { protocolVersion: NATIVE_KDENLIVE_REFERENCE.protocol, capabilities: {}, clientInfo: { name: 'OddBrain', version: '0.9.0' } })
    await mcpRequest('notifications/initialized', {}, initialized.session, true)
    const listed = await mcpRequest('tools/list', {}, initialized.session)
    const reported = Array.isArray(listed.value?.tools) ? listed.value.tools : []
    if (reported.length > 500) throw Error('Kdenlive MCP exposed more than 500 tools; the inventory was refused as unsafe.')
    const tools: McpTool[] = reported.filter((item: any) => item && typeof item.name === 'string' && item.name.length <= 200 && !/[\u0000-\u001f]/.test(item.name)).map((item: any) => ({ name: item.name, description: text(item.description, 1000), inputSchema: item.inputSchema && typeof item.inputSchema === 'object' ? item.inputSchema : undefined }))
    const protocol = text(initialized.value?.protocolVersion, 100), serverInfo = initialized.value?.serverInfo
    lastConnection = { session: listed.session, tools, serverInfo, protocol, native: nativeCompatibility(serverInfo, protocol, tools) }; return lastConnection
  }

  const callTool = async (connection: McpConnection, name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<any> => {
    if (!connection.tools.some(tool => tool.name === name)) throw Error(`The connected Kdenlive server does not expose ${name}.`)
    const called = await mcpRequest('tools/call', { name, arguments: args }, connection.session, false, signal)
    return toolPayload(called.value)
  }

  const nativeConnection = async (): Promise<McpConnection> => {
    const connection = lastConnection || await connectMcp()
    if (!connection.native.compatible) throw Error(connection.native.reason)
    return connection
  }

  const readNativeState = async (provided?: McpConnection, signal?: AbortSignal): Promise<KdenliveProjectSnapshot> => {
    const connection = provided || await nativeConnection()
    return projectSnapshot(await callTool(connection, 'desktop_state', {}, signal))
  }

  const view = async (): Promise<VideoStudioView> => {
    const keys = options.keys(), kdenliveReady = await regularFile(preferences.kdenlive), projectReady = await realFolder(preferences.projectFolder)
    const native = lastConnection?.native || { compatible: false, missing: [], identity: 'Not connected', reason: `Connect the separately installed native Kdenlive MCP protocol reviewed at ${NATIVE_KDENLIVE_REFERENCE.commit.slice(0, 12)}. No editor build has been accepted on this machine yet.` }
    return { preferences: { ...preferences }, kdenliveVersion: lastVersion, kdenliveReady, mcpConnected: !!lastConnection, mcpTools: (lastConnection?.tools || []).map(tool => tool.name), nativeKdenlive: { compatible: native.compatible, identity: native.identity, protocol: lastConnection?.protocol || '', referenceCommit: NATIVE_KDENLIVE_REFERENCE.commit, missingTools: native.missing, reason: native.reason }, aiToolsUrl, projectReady, hasMcpToken: !!keys?.has(MCP_KEY), hasPixabayKey: !!keys?.has(PIXABAY_KEY), keyEncryption: keys?.encryption || 'none', notice: lastNotice }
  }

  const testKdenlive = async (): Promise<VideoStudioView> => {
    lastNotice = ''
    if (!await regularFile(preferences.kdenlive)) { lastVersion = ''; lastConnection = null; lastNotice = 'Choose the Kdenlive executable first.'; return view() }
    const signal = new AbortController().signal
    try {
      const raw = await runCommand(preferences.kdenlive, ['--version'], signal, 15_000, 200_000)
      lastVersion = raw.toString('utf8').trim().replace(/\s+/g, ' ').slice(0, 300) || 'Kdenlive responded without a version label.'
    } catch (error) { lastVersion = ''; lastNotice = `Kdenlive could not be verified: ${(error as Error).message}`; return view() }
    try { const connected = await connectMcp(); lastNotice = `Kdenlive verified. MCP exposed ${connected.tools.length} tool${connected.tools.length === 1 ? '' : 's'}. ${connected.native.reason}` }
    catch (error) { lastConnection = null; lastNotice = `Kdenlive verified, but live MCP is unavailable: ${(error as Error).message}` }
    return view()
  }

  const rememberAsset = (owner: number, record: Omit<PrivateAsset, 'owner' | 'expires'>): CreativeAsset => {
    if (assets.size >= 2_000) throw Error('Two thousand live Creative Library review results are still retained. Wait for old fifteen-minute reviews to expire; nothing was evicted.')
    const token = randomUUID(), publicValue = { ...record.public, token }
    assets.set(token, { ...record, public: publicValue, owner, expires: now() + 15 * 60_000 }); return publicValue
  }

  const searchOpenverse = async (owner: number, query: string, kind: CreativeKind, page: number): Promise<CreativeAsset[]> => {
    const endpoint = kind === 'audio' ? 'audio' : 'images'
    if (kind === 'video') return []
    const data = await fetchFixedJson(fetchImpl, `https://api.openverse.org/v1/${endpoint}/?q=${encodeURIComponent(query)}&page_size=12&page=${page}&mature=false`, 'Openverse')
    return (Array.isArray(data?.results) ? data.results : []).flatMap((item: any) => {
      const id = text(item.id, 200), url = text(item.url, 4096), page = text(item.foreign_landing_url || item.detail_url, 4096), preview = text(item.thumbnail || item.url, 4096)
      if (!id || !url || !page || !preview) return []
      const licence = [text(item.license, 100).toUpperCase(), text(item.license_version, 50)].filter(Boolean).join(' ') || 'See source'
      const creator = text(item.creator, 300) || 'Unknown creator', title = text(item.title, 300) || `Openverse ${kind}`, filetype = text(item.filetype, 20).toLowerCase(), mediaType = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac' } as Record<string, string>)[filetype]
      return [rememberAsset(owner, { previewUrl: preview, downloadUrl: url, public: publicAsset({ provider: 'openverse', providerId: id, kind, title, creator, sourcePage: page, licence, licenceUrl: text(item.license_url, 4096), attribution: `${title} — ${creator} — ${licence}`, width: finite(item.width), height: finite(item.height), duration: finite(item.duration), ...(mediaType ? { mediaType } : {}), previewAvailable: true }, '') })]
    })
  }

  const searchWikimedia = async (owner: number, query: string, kind: CreativeKind, page: number): Promise<CreativeAsset[]> => {
    const filetype = kind === 'image' ? 'bitmap' : kind
    const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: `filetype:${filetype} ${query}`, gsrnamespace: '6', gsrlimit: '12', gsroffset: String((page - 1) * 12), prop: 'imageinfo', iiprop: 'url|extmetadata|mime|size|mediatype', iiurlwidth: '640', format: 'json', origin: '*' })
    const data = await fetchFixedJson(fetchImpl, `https://commons.wikimedia.org/w/api.php?${params}`, 'Wikimedia Commons')
    return Object.values(data?.query?.pages || {}).flatMap((page: any) => {
      const info = page?.imageinfo?.[0], metadata = info?.extmetadata || {}, id = String(page?.pageid || ''), url = text(info?.url, 4096), mime = text(info?.mime, 200).toLowerCase(), mediaClass = text(info?.mediatype, 100).toLowerCase()
      const typeMatches = kind === 'image' ? mime.startsWith('image/') : kind === 'video' ? mime.startsWith('video/') || mime === 'application/ogg' && mediaClass === 'video' : mime.startsWith('audio/') || mime === 'application/ogg' && mediaClass === 'audio'
      if (!id || !url || !typeMatches) return []
      const thumbnail = text(info?.thumburl, 4096), preview = kind === 'image' ? thumbnail || url : thumbnail
      const title = text(String(page?.title || '').replace(/^File:/, ''), 300) || `Wikimedia ${kind}`, creator = text(metadata.Artist?.value?.replace(/<[^>]+>/g, ' '), 300) || 'See file page', licence = text(metadata.LicenseShortName?.value, 200) || 'See file page', pageUrl = `https://commons.wikimedia.org/?curid=${encodeURIComponent(id)}`
      return [rememberAsset(owner, { previewUrl: preview, downloadUrl: url, public: publicAsset({ provider: 'wikimedia', providerId: id, kind, title, creator, sourcePage: pageUrl, licence, licenceUrl: text(metadata.LicenseUrl?.value, 4096), attribution: text(metadata.Credit?.value?.replace(/<[^>]+>/g, ' '), 500) || `${title} — ${creator} — ${licence}`, width: finite(info?.width), height: finite(info?.height), duration: finite(info?.duration), mediaType: mime, previewAvailable: Boolean(preview) }, '') })]
    })
  }

  const searchPixabay = async (owner: number, query: string, kind: CreativeKind, page: number): Promise<CreativeAsset[]> => {
    const key = options.keys()?.get(PIXABAY_KEY) || ''; if (!key) throw Error('Pixabay is not configured; Openverse and Wikimedia were still searched.')
    const endpoint = kind === 'video' ? 'https://pixabay.com/api/videos/' : 'https://pixabay.com/api/'
    if (kind === 'audio') return []
    const params = new URLSearchParams({ key, q: query, safesearch: 'true', per_page: '12', page: String(page), ...(kind === 'image' ? { image_type: 'all' } : {}) })
    const data = await fetchFixedJson(fetchImpl, `${endpoint}?${params}`, 'Pixabay')
    return (Array.isArray(data?.hits) ? data.hits : []).flatMap((item: any) => {
      const id = String(item?.id || ''), page = text(item?.pageURL, 4096), creator = text(item?.user, 300) || 'Pixabay contributor'
      const download = kind === 'video' ? text(item?.videos?.medium?.url || item?.videos?.small?.url || item?.videos?.large?.url, 4096) : text(item?.largeImageURL || item?.webformatURL, 4096)
      const preview = kind === 'video' && item?.picture_id ? `https://i.vimeocdn.com/video/${encodeURIComponent(String(item.picture_id))}_640x360.jpg` : text(item?.previewURL || item?.webformatURL, 4096)
      if (!id || !page || !download || !preview) return []
      const title = text(item?.tags, 300) || `Pixabay ${kind}`
      return [rememberAsset(owner, { previewUrl: preview, downloadUrl: download, public: publicAsset({ provider: 'pixabay', providerId: id, kind, title, creator, sourcePage: page, licence: 'Pixabay Content License', licenceUrl: 'https://pixabay.com/service/license-summary/', attribution: `${title} — ${creator} via Pixabay`, width: finite(item?.imageWidth || item?.videos?.medium?.width), height: finite(item?.imageHeight || item?.videos?.medium?.height), duration: finite(item?.duration), mediaType: kind === 'video' ? 'video/mp4' : 'image/jpeg', previewAvailable: true }, '') })]
    })
  }

  const rankAssets = (found: CreativeAsset[], query: string): CreativeAsset[] => {
    const terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])], phrase = query.toLowerCase()
    return found.map((asset, index) => {
      const title = asset.title.toLowerCase(), creator = asset.creator.toLowerCase(), attribution = asset.attribution.toLowerCase()
      const relevance = (title.includes(phrase) ? 20 : 0) + terms.reduce((score, term) => score + (title.includes(term) ? 5 : 0) + (creator.includes(term) ? 2 : 0) + (attribution.includes(term) ? 1 : 0), 0)
      const evidence = (/^(?:see|unknown|unspecified|custom)/i.test(asset.licence) ? 0 : 5) + (asset.licenceUrl ? 2 : 0) + (asset.previewAvailable ? 1 : 0) + (asset.duration || asset.width || asset.height ? 1 : 0)
      return { asset, index, score: relevance + evidence }
    }).sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.asset)
  }

  const search = async (owner: number, queryInput: string, kind: CreativeKind, pageInput = 1): Promise<CreativeSearchAnswer> => {
    prune(); const query = text(queryInput, 160), page = Number(pageInput)
    if (!query || query.length < 2 || !['image', 'video', 'audio'].includes(kind) || !Number.isSafeInteger(page) || page < 1 || page > 20) return { ok: false, assets: [], problems: ['Enter at least two normal search characters and use a valid result page.'], notice: 'Nothing was searched.' }
    const jobs = [searchOpenverse(owner, query, kind, page), searchWikimedia(owner, query, kind, page), searchPixabay(owner, query, kind, page)]
    const settled = await Promise.allSettled(jobs), found: CreativeAsset[] = [], problems: string[] = []; let hasMore = false
    for (const result of settled) { if (result.status === 'fulfilled') { found.push(...result.value); if (result.value.length >= 12) hasMore = true } else problems.push((result.reason as Error).message) }
    const unique = [...new Map(found.map(asset => [`${asset.provider}:${asset.providerId}`, asset] as const)).values()], ranked = rankAssets(unique, query).slice(0, 24)
    return { ok: ranked.length > 0 || problems.length < jobs.length, assets: ranked, problems: [...new Set(problems)], page, hasMore: hasMore && page < 20, notice: ranked.length ? `${ranked.length} live result${ranked.length === 1 ? '' : 's'} on page ${page}, locally ranked by query fit and provenance completeness. Nothing has been downloaded. ${[...new Set(ranked.map(item => providerNotice(item.provider)))].join(' ')}` : 'No matching licensed assets were returned. Nothing was downloaded.' }
  }

  const fetchImage = async (urlText: string): Promise<{ mime: string; data: string }> => {
    let url = new URL(urlText)
    for (let redirect = 0; redirect < 4; redirect++) {
      await checkRemote(url)
      const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000), headers: { Accept: 'image/*', 'User-Agent': 'OddBrain/0.9 CreativeLibrary' } })
      if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get('location'); if (!location) throw Error('Preview redirect had no destination.'); url = new URL(location, url); continue }
      const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      if (!response.ok || !/^image\/(?:jpeg|png|webp|gif)$/.test(mime)) throw Error('The provider did not return a supported image preview.')
      const declared = Number(response.headers.get('content-length') || 0); if (declared > 2_500_000) throw Error('This preview exceeds the 2.5 MB preview safety limit.')
      const reader = response.body?.getReader(); if (!reader) throw Error('The preview had no body.')
      const chunks: Uint8Array[] = []; let bytes = 0
      try { for (;;) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; if (bytes > 2_500_000) throw Error('This preview exceeds the 2.5 MB preview safety limit.'); chunks.push(next.value) } }
      finally { await reader.cancel().catch(() => undefined) }
      return { mime, data: Buffer.concat(chunks).toString('base64') }
    }
    throw Error('The preview redirected too many times.')
  }

  const preview = async (owner: number, token: string): Promise<CreativePreview> => {
    prune(); const asset = assets.get(token)
    if (!asset || (asset.owner !== owner && asset.owner !== -1)) return { ok: false, token, error: 'That search result expired. Search again.' }
    if (!asset.public.previewAvailable || !asset.previewUrl) return { ok: false, token, error: 'This provider returned no bounded still preview. Review the named source page before approving it.' }
    try { return { ok: true, token, ...(await fetchImage(asset.previewUrl)) } } catch (error) { return { ok: false, token, error: (error as Error).message } }
  }

  const extensionFor = (asset: CreativeAsset, url: URL): string => {
    const ext = extname(url.pathname).toLowerCase()
    if (/^\.[a-z0-9]{2,5}$/.test(ext)) return ext
    const byMime: Record<string, string> = { 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/webm': '.webm', 'video/ogg': '.ogv', 'audio/mpeg': '.mp3', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/ogg': '.ogg', 'application/ogg': asset.kind === 'video' ? '.ogv' : '.ogg', 'audio/flac': '.flac' }
    return byMime[asset.mediaType || ''] || (asset.kind === 'image' ? '.jpg' : asset.kind === 'video' ? '.mp4' : '.bin')
  }
  const assetDestination = (asset: CreativeAsset): string => join(preferences.projectFolder, 'OddBrain Assets', `${asset.provider}-${safePart(asset.providerId)}-${safePart(asset.title)}${extensionFor(asset, new URL(assets.get(asset.token)!.downloadUrl))}`)

  const prepareAsset = async (owner: number, token: string): Promise<AssetReview> => {
    prune(); const asset = assets.get(token)
    if (!asset || (asset.owner !== owner && asset.owner !== -1)) return { ok: false, error: 'That search result expired. Search again.' }
    if (!asset.public.licence || /^(?:see|unknown|unspecified|custom)/i.test(asset.public.licence)) return { ok: false, error: 'This result does not expose a specific licence. OddBrain will not download it; open the source page and choose another result with clear terms.' }
    if (!await realFolder(preferences.projectFolder)) return { ok: false, error: 'Choose an existing Kdenlive project folder first.' }
    const approval = randomUUID(), expires = now() + 5 * 60_000, destination = assetDestination(asset.public)
    approvals.set(approval, { asset, destination, preferences: preferencesDigest(preferences), expires, owner })
    return { ok: true, token: approval, asset: asset.public, destination, consequence: `Download this one ${asset.public.kind} into the selected project, preserve its source/licence receipt, and optionally import it into the connected Kdenlive timeline bin. Existing files will not be overwritten.`, expiresAt: expiresAt(expires) }
  }

  const download = async (sourceText: string, destination: string, signal?: AbortSignal, projectArea: 'OddBrain Assets' | 'OddBrain Sources' = 'OddBrain Assets', expected?: CreativeKind): Promise<{ path: string; sha256: string; bytes: number; requestedUrl: string; resolvedUrl: string }> => {
    const folder = await safeProjectDirectory(projectArea); destination = join(folder, basename(destination))
    let url = new URL(sourceText), response: Response | null = null
    for (let redirects = 0; redirects < 5; redirects++) {
      await checkRemote(url)
      response = await fetchImpl(url, { redirect: 'manual', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30 * 60_000)]) : AbortSignal.timeout(30 * 60_000), headers: { Accept: 'image/*,video/*,audio/*,application/octet-stream', 'User-Agent': 'OddBrain/0.9 CreativeLibrary' } })
      if ([301, 302, 303, 307, 308].includes(response.status)) { const location = response.headers.get('location'); if (!location) throw Error('Asset redirect had no destination.'); url = new URL(location, url); response = null; continue }
      break
    }
    if (!response?.ok || !response.body) throw Error(`The provider refused the selected download${response ? ` (HTTP ${response.status})` : ''}.`)
    const mediaType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (expected && mediaType && mediaType !== 'application/octet-stream' && !mediaType.startsWith(`${expected}/`) && !(mediaType === 'application/ogg' && (expected === 'audio' || expected === 'video'))) throw Error(`The selected ${expected} download returned ${mediaType}; it was refused before writing.`)
    const declared = Number(response.headers.get('content-length') || 0), space = await statfs(preferences.projectFolder), available = Number(space.bavail) * Number(space.bsize)
    if (Number.isFinite(declared) && declared > 0 && declared + 128 * 1024 * 1024 > available) throw Error(`This selected asset needs ${declared.toLocaleString()} bytes plus working space, but the project drive does not have it.`)
    const temporary = `${destination}.incoming-${randomUUID()}`, file = await open(temporary, 'wx', 0o600), reader = response.body.getReader(), hash = createHash('sha256')
    let bytes = 0, nextSpaceCheck = 64 * 1024 * 1024
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break
        let written = 0; while (written < next.value.byteLength) written += (await file.write(next.value, written, next.value.byteLength - written, null)).bytesWritten
        hash.update(next.value); bytes += next.value.byteLength
        if (bytes >= nextSpaceCheck) { const current = await statfs(preferences.projectFolder), free = Number(current.bavail) * Number(current.bsize); if (free < 128 * 1024 * 1024) throw Error('The project drive ran out of safe working space. The incomplete download was removed.'); nextSpaceCheck += 64 * 1024 * 1024 }
      }
      if (!bytes || declared > 0 && bytes !== declared) throw Error('The provider download ended early. The incomplete file was removed.')
      await file.sync(); await file.close()
      let final = destination
      try { await lstat(final); final = `${destination.slice(0, -extname(destination).length)}-${randomUUID().slice(0, 8)}${extname(destination)}` } catch {}
      await rename(temporary, final)
      return { path: final, sha256: hash.digest('hex'), bytes, requestedUrl: sourceText, resolvedUrl: url.toString() }
    } catch (error) { try { await file.close() } catch {}; await rm(temporary, { force: true }); throw error }
    finally { await reader.cancel().catch(() => undefined) }
  }

  const importAsset = async (path: string): Promise<{ binId: string; ready: boolean; duration?: number }> => {
    const connection = await nativeConnection()
    if (!connection.tools.some(item => item.name === 'desktop_media_import')) throw Error('The reviewed native Kdenlive protocol exposes no media-import tool. The asset remains downloaded but was not imported.')
    const state = await readNativeState(connection)
    if (!state.documentUrl) throw Error('Save the visible Kdenlive project before importing the downloaded asset.')
    const result = await callTool(connection, 'desktop_media_import', { sessionId: state.sessionId, expectedRevision: state.revision, requestId: randomUUID(), path, wait: 30 })
    const next = projectSnapshot(result), binId = text(result?.binId, 200)
    if (next.documentUrl !== state.documentUrl || next.sequenceId !== state.sequenceId || next.revision <= state.revision || !binId) throw Error('Kdenlive did not return the expected project revision and bin ID after media import.')
    return { binId, ready: result?.ready === true, ...(finite(result?.duration) ? { duration: finite(result.duration) } : {}) }
  }

  const decideAsset = async (owner: number, token: string, decision: 'allow' | 'deny', importIntoKdenlive: boolean): Promise<AssetInstallAnswer> => {
    prune(); const approval = approvals.get(token); approvals.delete(token)
    if (!approval || approval.owner !== owner) return { ok: false, answer: 'That asset approval expired. Nothing was downloaded.' }
    if (decision !== 'allow') return { ok: true, answer: 'Cancelled. Nothing was downloaded or imported.' }
    if (approval.preferences !== preferencesDigest(preferences)) return { ok: false, answer: 'Kdenlive or project settings changed after review. Review the asset again; nothing was downloaded.' }
    const controller = new AbortController(); transfers.get(owner)?.abort(); transfers.set(owner, controller); let downloadedPath = '', importedBinId = ''
    try {
      const result = await download(approval.asset.downloadUrl, approval.destination, controller.signal, 'OddBrain Assets', approval.asset.public.kind), receiptFolder = await safeProjectDirectory('OddBrain Assets', 'asset-receipts'); downloadedPath = result.path
      let imported = false, importOutcome: { binId: string; ready: boolean; duration?: number } | undefined, importError = ''
      if (importIntoKdenlive) try { importOutcome = await importAsset(result.path); imported = true; importedBinId = importOutcome.binId } catch (error) { importError = (error as Error).message }
      const receipt = join(receiptFolder, `${result.sha256}-${randomUUID().slice(0, 8)}.json`)
      await writeFile(receipt, `${JSON.stringify({ schema: 1, acquiredAt: new Date(now()).toISOString(), file: basename(result.path), bytes: result.bytes, sha256: result.sha256, requestedUrl: result.requestedUrl, resolvedUrl: result.resolvedUrl, asset: approval.asset.public, kdenliveImport: { requested: importIntoKdenlive, succeeded: imported, ...(importOutcome || {}), ...(importError ? { error: importError } : {}) } }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      return { ok: true, path: result.path, imported, ...(importedBinId ? { binId: importedBinId } : {}), receipt, answer: `Downloaded the selected asset and saved its source/licence/import-outcome receipt.${imported ? ` Kdenlive imported it as bin ${importedBinId}${importOutcome?.ready ? ' and reported it ready' : ', but readiness was not confirmed'}.` : importError ? ` It was not imported: ${importError}` : ' It was not imported.'}` }
    } catch (error) { return { ok: false, answer: controller.signal.aborted ? 'Stopped. The incomplete transfer was removed.' : `${(error as Error).message}${downloadedPath ? ` The completed file remains at ${downloadedPath}${importedBinId ? ` and Kdenlive reported bin ${importedBinId}` : ''}, but the receipt did not finish.` : ''}` } }
    finally { if (transfers.get(owner) === controller) transfers.delete(owner) }
  }

  const preflightUrl = async (owner: number, input: string): Promise<VideoUrlPreflight> => {
    prune(); const classified = classifyVideoUrl(input)
    if (!classified.ok) return { ok: false, url: '', provider: 'unknown', title: '', method: 'none', warnings: [], consequence: '', error: classified.error }
    const { url, provider } = classified
    try {
      let result: VideoUrlPreflight
      if (provider === 'direct-media') {
        await checkRemote(url)
        const response = await fetchImpl(url, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'OddBrain/0.9 VideoPreflight' } })
        if (!response.ok) throw Error(`The media server refused inspection (HTTP ${response.status}).`)
        const mediaType = (response.headers.get('content-type') || '').split(';')[0]
        if (!mediaType.startsWith('video/')) throw Error('That link did not identify itself as direct video media.')
        result = { ok: true, url: url.toString(), provider, title: basename(url.pathname) || 'Direct video', mediaType, estimatedBytes: finite(response.headers.get('content-length')), method: 'direct-head', warnings: ['Direct links can expire. OddBrain will retain the exact source URL and file hash.'], consequence: 'Approval streams this one video into the selected project folder. Existing files are never overwritten.' }
      } else {
        if (!['youtube', 'tiktok', 'instagram'].includes(provider)) throw Error('This website has no reviewed video-link adapter. Use a direct media URL or a supported public link.')
        if (!await regularFile(preferences.ytDlp)) throw Error('Choose an owner-installed yt-dlp executable in Kdenlive & video settings first.')
        const raw = await runCommand(preferences.ytDlp, ['--ignore-config', '--dump-single-json', '--skip-download', '--no-playlist', '--no-warnings', '--', url.toString()], new AbortController().signal, 90_000, 2_000_000)
        const metadata = JSON.parse(raw.toString('utf8'))
        if (metadata?.is_live || metadata?.live_status === 'is_live') throw Error('Live sources are not supported.')
        if (metadata?.availability && !['public', 'unlisted', 'needs_auth'].includes(metadata.availability)) throw Error(`This source reports availability “${String(metadata.availability).slice(0, 80)}”; OddBrain will not bypass it.`)
        if (metadata?.availability === 'needs_auth') throw Error('This source requires authentication. OddBrain does not read browser cookies or bypass access controls.')
        result = { ok: true, url: url.toString(), provider, title: text(metadata?.title, 500) || `${provider} video`, duration: finite(metadata?.duration), uploader: text(metadata?.uploader || metadata?.channel, 300), mediaType: text(metadata?.ext, 50), estimatedBytes: finite(metadata?.filesize_approx || metadata?.filesize), method: 'yt-dlp-metadata', warnings: ['Only public, permitted content may be acquired. Site rules and creator rights still apply.', 'No cookies, login data, playlist expansion or DRM bypass is used.'], consequence: 'Approval asks the reviewed yt-dlp executable to acquire this one public video into the selected project folder and records its URL and file hash.' }
      }
      const token = randomUUID(), complete = { ...result, token }; urls.set(token, { preflight: complete, source: url, expires: now() + 5 * 60_000, owner }); return complete
    } catch (error) { return { ok: false, url: url.toString(), provider, title: '', method: 'none', warnings: [], consequence: '', error: (error as Error).message } }
  }

  const registerEvidenceIntake = (path: string, name: string, input: { sourceKind: 'file' | 'url'; sourceUrl?: string; receipt?: string; sha256?: string; videoOcr?: boolean }): VideoEvidenceSummary => {
    const sha256 = /^[a-f0-9]{64}$/.test(input.sha256 || '') ? input.sha256! : ''
    let item = storedEvidence.find(value => value.sourceKind === input.sourceKind && (sha256 ? value.sha256 === sha256 : value.sourcePath === path))
    if (item?.status === 'ready') return publicEvidence(item)
    const updatedAt = new Date(now()).toISOString()
    if (item) {
      item.name = name || item.name; item.sourcePath = path; item.sha256 = sha256 || item.sha256
      if (input.sourceUrl) item.sourceUrl = input.sourceUrl
      if (input.receipt) item.raw.sourceReceipt = input.receipt
      if (input.videoOcr !== undefined) item.raw.videoOcr = input.videoOcr
      const alreadyReading = item.status === 'processing'
      item.status = 'processing'; item.error = undefined; item.updatedAt = updatedAt; item.attempts = (item.attempts || 0) + (alreadyReading ? 0 : 1)
      item.disclosure = 'The approved source is retained in Video Studio and is being read locally. No AI description is confirmed automatically.'
      saveEvidence(); return publicEvidence(item)
    }
    if (storedEvidence.length >= 256) throw Error('The durable video-evidence index already contains 256 records. Nothing was evicted; archive the project evidence deliberately before adding another source.')
    item = {
      id: randomUUID(), name: name || basename(path), sourceKind: input.sourceKind, ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}), sourcePath: path,
      sha256, duration: 0, createdAt: updatedAt, updatedAt, attempts: 1, transcriptSections: 0, sceneChanges: 0, moments: [],
      disclosure: 'The approved source is retained in Video Studio and is being read locally. No AI description is confirmed automatically.', status: 'processing',
      sourceText: '', transcript: '', transcriptSegments: [], scenes: [], audioWindows: [], frameFiles: [], raw: { ...(input.receipt ? { sourceReceipt: input.receipt } : {}), ...(input.videoOcr !== undefined ? { videoOcr: input.videoOcr } : {}) }, unconfirmed: { descriptions: [] }, confirmed: { descriptions: [] },
    }
    storedEvidence = [...storedEvidence, item]; saveEvidence(); return publicEvidence(item)
  }

  const recordEvidence = async (_owner: number, path: string, result: MediaResult, input: { sourceKind: 'file' | 'url'; sourceUrl?: string; receipt?: string; dedupe?: boolean }): Promise<VideoEvidenceSummary> => {
    if (!result.ok || !result.source?.sha256 || !result.time?.total || result.textComplete !== true) throw Error(result.error || 'Video Studio requires complete source-duration evidence. A selected chat range remains attached separately and can be retried here as a complete read.')
    const ready = input.dedupe === false ? undefined : storedEvidence.find(item => item.status === 'ready' && item.sha256 === result.source!.sha256 && item.sourceKind === input.sourceKind)
    if (ready) return publicEvidence(ready)
    let intake = input.dedupe === false ? storedEvidence.find(item => item.sourceKind === input.sourceKind && item.sourcePath === path) : storedEvidence.find(item => item.sourceKind === input.sourceKind && item.sha256 === result.source!.sha256)
    if (!intake) { registerEvidenceIntake(path, result.name, { ...input, sha256: result.source.sha256 }); intake = storedEvidence.at(-1)! }
    if (intake.sha256 && intake.sha256 !== result.source.sha256) throw Error('The retained source no longer matches its intake hash. It was not mixed with the earlier evidence; attach the changed file as a new source.')
    const id = intake.id, root = join(dirname(evidenceFile), 'video-evidence-files', id)
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
    await mkdir(root, { recursive: true, mode: 0o700 })
    const moments: VideoEvidenceMoment[] = [], frameFiles: StoredEvidence['frameFiles'] = []
    try {
      for (const [index, evidence] of (result.visualEvidence || []).entries()) {
        const image = result.images?.[index], destination = join(root, `frame-${String(index + 1).padStart(3, '0')}.jpg`)
        if (image) { const bytes = Buffer.from(image.data, 'base64'); await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 }); frameFiles.push({ at: evidence.at, path: destination, mime: image.mime }) }
        moments.push({ at: evidence.at, reason: evidence.reason, score: evidence.score, ...(evidence.ocr ? { ocr: evidence.ocr } : {}), ...(image ? { frame: destination } : {}) })
      }
      const transcriptSegments = result.segments || (result.text ? [{ id: 'complete', label: 'Complete evidence timeline', text: result.text }] : [])
      const stored: StoredEvidence = {
        ...intake, name: intake.name || result.name, ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}), sourcePath: intake.sourcePath || path,
        sha256: result.source.sha256, duration: result.time.total, updatedAt: new Date(now()).toISOString(), transcriptSections: transcriptSegments.length,
        sceneChanges: result.sceneMap?.length || 0, moments, disclosure: result.disclosure || 'Local media evidence; derived text and frames remain unconfirmed.', status: 'ready', error: undefined,
        sourceText: result.text || transcriptSegments.map(section => `${section.label}\n${section.text}`).join('\n\n'), transcript: result.text || '', transcriptSegments,
        scenes: result.sceneMap || [], audioWindows: result.audioMap || [], frameFiles, raw: { ...intake.raw, ...(input.receipt ? { sourceReceipt: input.receipt } : {}) },
      }
      storedEvidence = storedEvidence.map(value => value.id === id ? stored : value); saveEvidence()
      lastNotice = `Video evidence is ready for ${result.name}: complete selected audio coverage, ${stored.transcriptSections} transcript section(s), ${stored.audioWindows.length} delivery interval(s), ${stored.sceneChanges} scene change(s), and ${stored.moments.length} initial frame(s). The AI can request more timestamps.`
      return publicEvidence(stored)
    } catch (error) { await rm(root, { recursive: true, force: true }).catch(() => undefined); throw error }
  }

  const recordEvidenceFailure = (path: string, name: string, input: { sourceKind: 'file' | 'url'; sourceUrl?: string; receipt?: string; sha256?: string; videoOcr?: boolean }, error: string): VideoEvidenceSummary => {
    let item = storedEvidence.find(value => value.sourceKind === input.sourceKind && (input.sha256 ? value.sha256 === input.sha256 : value.sourcePath === path))
    if (!item) {
      try { registerEvidenceIntake(path, name, input); item = storedEvidence.at(-1)! }
      catch { return { id: randomUUID(), name, sourceKind: input.sourceKind, ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}), sha256: input.sha256 || '', duration: 0, createdAt: new Date(now()).toISOString(), transcriptSections: 0, sceneChanges: 0, moments: [], disclosure: 'The source was preserved, but the full 256-record evidence index refused another intake. Nothing was evicted.', status: 'blocked', error: `${error} The blocked attempt could not be indexed.` } }
    }
    item.status = 'blocked'; item.error = error; item.updatedAt = new Date(now()).toISOString()
    item.disclosure = 'The approved source and its provenance remain linked in Video Studio, but the local evidence read did not complete. Retry does not reattach or redownload it.'
    if (input.receipt) item.raw.sourceReceipt = input.receipt
    if (input.videoOcr !== undefined) item.raw.videoOcr = input.videoOcr
    saveEvidence(); return publicEvidence(item)
  }

  const retryEvidence = async (owner: number, id: string): Promise<{ ok: boolean; answer: string; evidence?: VideoEvidenceSummary }> => {
    const item = storedEvidence.find(value => value.id === id)
    if (!item) return { ok: false, answer: 'That durable video intake was not found.' }
    if (item.status === 'ready') return { ok: true, answer: 'That source is already ready; nothing was reprocessed.', evidence: publicEvidence(item) }
    if (!options.analyzeVideo) return { ok: false, answer: 'The local evidence reader is unavailable in this runtime.' }
    try {
      registerEvidenceIntake(item.sourcePath, item.name, { sourceKind: item.sourceKind, sourceUrl: item.sourceUrl, receipt: item.raw.sourceReceipt, sha256: item.sha256, videoOcr: item.raw.videoOcr })
      const result = await options.analyzeVideo(owner, item.sourcePath, item.raw.videoOcr === true)
      if (item.sha256 && result.source?.sha256 !== item.sha256) throw Error('The retained source no longer matches its intake hash. It was not mixed with the earlier evidence; attach the changed file as a new source.')
      const evidence = await recordEvidence(owner, item.sourcePath, result, { sourceKind: item.sourceKind, sourceUrl: item.sourceUrl, receipt: item.raw.sourceReceipt, ...(item.name.startsWith('Kdenlive preview ·') ? { dedupe: false } : {}) })
      return { ok: true, answer: 'The retained source was read completely and is ready for timestamped questions. It was not reattached or downloaded again.', evidence }
    } catch (error) {
      const evidence = recordEvidenceFailure(item.sourcePath, item.name, { sourceKind: item.sourceKind, sourceUrl: item.sourceUrl, receipt: item.raw.sourceReceipt, sha256: item.sha256, videoOcr: item.raw.videoOcr }, (error as Error).message)
      return { ok: false, answer: `The retained source is still blocked: ${(error as Error).message}`, evidence }
    }
  }

  const expandEvidence = async (_owner: number, id: string, momentsInput: number[], questionInput: string): Promise<EvidenceExpansion> => {
    const item = storedEvidence.find(value => value.id === id), question = text(questionInput, 1000)
    if (!item || item.status !== 'ready') return { ok: false, answer: 'That ready video evidence source was not found.' }
    if (!options.expandVideoEvidence) return { ok: false, answer: 'Question-driven local frame retrieval is not available in this runtime.' }
    if (!question) return { ok: false, answer: 'Say what the extra evidence should help answer.' }
    const moments = Array.isArray(momentsInput) ? [...new Set(momentsInput.map(Number))] : []
    if (moments.length < 1 || moments.length > 6 || moments.some(at => !Number.isFinite(at) || at < 0 || at > item.duration)) return { ok: false, answer: `Choose 1–6 timestamps within 0–${item.duration.toFixed(1)} seconds.` }
    const controller = new AbortController(); mcpJobs.get(_owner)?.abort(); mcpJobs.set(_owner, controller)
    try {
      const expanded = await options.expandVideoEvidence(item.sourcePath, moments, item.raw.videoOcr === true, controller.signal)
      if (expanded.sha256 !== item.sha256) throw Error('The source hash no longer matches the evidence map. Reprocess the source instead of mixing versions.')
      const root = join(dirname(evidenceFile), 'video-evidence-files', item.id), added: VideoEvidenceMoment[] = [], images: NonNullable<EvidenceExpansion['images']> = []
      for (const [index, evidence] of expanded.visualEvidence.entries()) {
        const image = expanded.images[index], destination = join(root, `question-${Date.now()}-${String(index + 1).padStart(2, '0')}.jpg`), bytes = Buffer.from(image.data, 'base64')
        await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 })
        const moment: VideoEvidenceMoment = { at: evidence.at, reason: 'question', score: 0, frame: destination, ...(evidence.ocr ? { ocr: evidence.ocr } : {}) }
        item.moments.push(moment); item.frameFiles.push({ at: evidence.at, path: destination, mime: image.mime }); added.push(moment); images.push({ at: evidence.at, mime: image.mime, data: image.data })
      }
      item.moments.sort((a, b) => a.at - b.at); saveEvidence()
      return { ok: true, evidence: publicEvidence(item), moments: added, images, audio: expanded.audio || [], answer: `Retrieved ${added.length} additional local frame${added.length === 1 ? '' : 's'}${expanded.audio?.length ? ` and ${expanded.audio.length} matching four-second audio window${expanded.audio.length === 1 ? '' : 's'}` : ''} for “${question}”. They remain raw evidence until described and confirmed.` }
    } catch (error) { return { ok: false, answer: controller.signal.aborted ? 'Stopped. No unfinished evidence was accepted.' : (error as Error).message } }
    finally { if (mcpJobs.get(_owner) === controller) mcpJobs.delete(_owner) }
  }

  const readEvidenceFrame = async (id: string, atInput: number): Promise<VideoEvidenceFrame> => {
    const at = Number(atInput), item = storedEvidence.find(value => value.id === id && value.status === 'ready')
    if (!item || !Number.isFinite(at)) return { ok: false, sourceId: id, at, error: 'That ready video evidence frame was not found.' }
    const frame = item.frameFiles.find(value => Math.abs(value.at - at) < .001)
    if (!frame) return { ok: false, sourceId: id, at, error: 'That timestamp is not a retained frame. Ask for question-driven evidence first.' }
    try { const bytes = await readFile(frame.path); if (!bytes.length || bytes.length > 2_000_000) throw Error('The retained frame is empty or exceeds the two-megabyte viewing limit.'); return { ok: true, sourceId: id, at: frame.at, mime: frame.mime, data: bytes.toString('base64') } }
    catch (error) { return { ok: false, sourceId: id, at, error: (error as Error).message } }
  }

  const confirmEvidenceDescription = (_owner: number, id: string, atInput: number, descriptionInput: string): { ok: boolean; answer: string } => {
    const item = storedEvidence.find(value => value.id === id), at = Number(atInput), description = text(descriptionInput, 2000)
    if (!item || !Number.isFinite(at) || !description) return { ok: false, answer: 'That exact evidence description was not found.' }
    const note = item.unconfirmed.descriptions.find(value => Math.abs(value.at - at) < .001 && value.description === description)
    if (!note) return { ok: false, answer: 'Only an exact visible unconfirmed description can be confirmed.' }
    if (!item.confirmed.descriptions.some(value => Math.abs(value.at - at) < .001 && value.description === description)) item.confirmed.descriptions.push({ at, description, confirmedAt: new Date(now()).toISOString() })
    const moment = item.moments.find(value => Math.abs(value.at - at) < .001 && value.description === description)
    if (moment) moment.descriptionState = 'confirmed'
    saveEvidence(); return { ok: true, answer: `Confirmed the description at ${at.toFixed(3)} seconds. The raw frame and earlier unconfirmed note remain linked and separate.` }
  }

  const receiptForSource = async (path: string, sourceUrl: string, provider: string, resolvedUrl = sourceUrl, creator = '', title = ''): Promise<{ path: string; sha256: string; bytes: number }> => {
    const file = await open(path, 'r'); const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024); let bytes = 0
    try { for (;;) { const part = await file.read(buffer, 0, buffer.length, bytes); if (!part.bytesRead) break; hash.update(buffer.subarray(0, part.bytesRead)); bytes += part.bytesRead } } finally { await file.close() }
    const folder = await safeProjectDirectory('OddBrain Sources', 'source-receipts'); const sha256 = hash.digest('hex'), receipt = join(folder, `${sha256}-${randomUUID().slice(0, 8)}.json`)
    await writeFile(receipt, `${JSON.stringify({ schema: 1, acquiredAt: new Date(now()).toISOString(), sourceUrl, resolvedUrl, provider, creator: creator || null, title: title || null, file: basename(path), bytes, sha256 }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    return { path: receipt, sha256, bytes }
  }

  const acquireUrl = async (owner: number, token: string, decision: 'allow' | 'deny', importIntoKdenlive: boolean): Promise<VideoUrlAcquireAnswer> => {
    prune(); const approval = urls.get(token); urls.delete(token)
    if (!approval || approval.owner !== owner) return { ok: false, answer: 'That video-link approval expired. Nothing was downloaded.' }
    if (decision !== 'allow') return { ok: true, answer: 'Cancelled. Nothing was downloaded.' }
    if (!await realFolder(preferences.projectFolder)) return { ok: false, answer: 'The selected project folder is no longer available. Nothing was downloaded.' }
    const controller = new AbortController(); transfers.get(owner)?.abort(); transfers.set(owner, controller)
    let staging = '', path = '', resolvedUrl = approval.source.toString()
    try {
      const folder = await safeProjectDirectory('OddBrain Sources')
      if (approval.preflight.provider === 'direct-media') {
        const sourceExtension = extname(approval.source.pathname) || '.mp4', destination = join(folder, safePart(basename(approval.preflight.title, extname(approval.preflight.title))) + sourceExtension)
        const downloaded = await download(approval.source.toString(), destination, controller.signal, 'OddBrain Sources', 'video'); path = downloaded.path; resolvedUrl = downloaded.resolvedUrl
      } else {
        if (!await regularFile(preferences.ytDlp)) throw Error('The reviewed yt-dlp executable is no longer available.')
        staging = join(folder, `.incoming-${randomUUID()}`); await mkdir(staging, { mode: 0o700 })
        const output = join(staging, `${safePart(approval.preflight.title)}-${randomUUID().slice(0, 8)}.%(ext)s`)
        const raw = await runCommand(preferences.ytDlp, ['--ignore-config', '--no-playlist', '--no-warnings', '--no-overwrites', '--restrict-filenames', '-f', 'bv*+ba/b', '--merge-output-format', 'mp4', '--print', 'after_move:filepath', '-o', output, '--', approval.source.toString()], controller.signal, 2 * 60 * 60_000, 200_000)
        path = raw.toString('utf8').trim().split(/\r?\n/).filter(Boolean).at(-1) || ''
        const root = await realpath(staging), actual = path ? await realpath(path) : ''
        const within = actual ? relative(root, actual) : ''
        if (!actual || !within || within.startsWith('..') || isAbsolute(within)) throw Error('yt-dlp did not report a safe completed file inside its temporary project folder.')
        const metadata = await lstat(actual); if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size < 1) throw Error('yt-dlp did not produce a regular completed media file.')
        const completed = join(folder, basename(actual)); await rename(actual, completed); await rm(staging, { recursive: true, force: true }); staging = ''; path = completed
      }
      const receipt = await receiptForSource(path, approval.source.toString(), approval.preflight.provider, resolvedUrl, approval.preflight.uploader || '', approval.preflight.title)
      const intakeInput = { sourceKind: 'url' as const, sourceUrl: approval.source.toString(), receipt: receipt.path, sha256: receipt.sha256 }
      let evidence: VideoEvidenceSummary | undefined = registerEvidenceIntake(path, approval.preflight.title || basename(path), intakeInput), evidenceAnswer = ''
      if (options.analyzeVideo) {
        try { evidence = await recordEvidence(owner, path, await options.analyzeVideo(owner, path), intakeInput); evidenceAnswer = ' It automatically entered the durable local evidence reader and is ready for timestamped questions.' }
        catch (error) { evidence = recordEvidenceFailure(path, approval.preflight.title, intakeInput, (error as Error).message); evidenceAnswer = ` Its durable intake remains available, but the automatic reader was blocked: ${(error as Error).message}` }
      } else { evidence = recordEvidenceFailure(path, approval.preflight.title, intakeInput, 'This runtime has no connected local evidence reader.'); evidenceAnswer = ' The durable intake was kept, but this runtime has no connected local evidence reader.' }
      let imported = false, importOutcome: { binId: string; ready: boolean; duration?: number } | undefined, importError = '', importReceipt = '', suffix = ''
      if (importIntoKdenlive) try { importOutcome = await importAsset(path); imported = true } catch (error) { importError = (error as Error).message; suffix = ` ${importError}` }
      if (importIntoKdenlive) {
        try { importReceipt = join(dirname(receipt.path), `${receipt.sha256}-${randomUUID().slice(0, 8)}-kdenlive-import.json`); await writeFile(importReceipt, `${JSON.stringify({ schema: 1, recordedAt: new Date(now()).toISOString(), sourceReceipt: basename(receipt.path), requested: true, succeeded: imported, ...(importOutcome || {}), ...(importError ? { error: importError } : {}) }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' }) }
        catch (error) { importReceipt = ''; suffix += ` The Kdenlive outcome could not be written to its companion receipt: ${(error as Error).message}` }
      }
      return { ok: true, answer: `Downloaded the one approved source and saved its URL/hash receipt.${importReceipt ? ' The requested Kdenlive import outcome has a separate durable companion receipt.' : ''}${evidenceAnswer}${imported ? ` Imported it into Kdenlive as bin ${importOutcome!.binId} without timeline placement${importOutcome!.ready ? ' and Kdenlive reported it ready' : ', but readiness was not confirmed'}.${suffix}` : suffix}`, path, sourceUrl: approval.source.toString(), receipt: receipt.path, imported, ...(importOutcome ? { binId: importOutcome.binId } : {}), evidence }
    } catch (error) { return { ok: false, answer: controller.signal.aborted ? (path ? `Stop arrived after the source completed. The file remains at ${path}; receipt/import did not finish.` : 'Stopped. The incomplete source transfer was removed.') : `${(error as Error).message}${path ? ` The completed source remains at ${path}, but its receipt/import did not finish.` : ''}` } }
    finally { if (staging) await rm(staging, { recursive: true, force: true }).catch(() => undefined); if (transfers.get(owner) === controller) transfers.delete(owner) }
  }

  const prepareDesignKit = async (owner: number, format: DesignKitFormat): Promise<DesignKitReview> => {
    prune()
    if (!['vertical', 'landscape'].includes(format)) return { ok: false, error: 'Choose a vertical or landscape design kit.' }
    if (!await realFolder(preferences.projectFolder)) return { ok: false, error: 'Choose an existing Kdenlive project folder first.' }
    const token = randomUUID(), expires = now() + 5 * 60_000, folder = `oddbrain-${format}-kit-${randomUUID().slice(0, 8)}`, destination = join(preferences.projectFolder, 'OddBrain Assets', 'Design Kits', folder)
    designKits.set(token, { owner, format, destination, preferences: preferencesDigest(preferences), expires })
    return { ok: true, token, destination, files: [...Object.keys(localDesignFiles(format)), 'manifest.json'], consequence: 'Create one new local design-kit folder containing editable title/lower-third, shape and gradient SVGs, two caption families, a colour LUT, native Kdenlive title/transition/effect recipes, instructions, and a hash manifest. Nothing is downloaded or overwritten. Recipes still require an exact reviewed plan, and Kdenlive performs and previews every animation or effect.', expiresAt: expiresAt(expires) }
  }
  const decideDesignKit = async (owner: number, token: string, decision: 'allow' | 'deny', importTitleIntoKdenlive: boolean): Promise<AssetInstallAnswer> => {
    prune(); const ticket = designKits.get(token); designKits.delete(token)
    if (!ticket || ticket.owner !== owner) return { ok: false, answer: 'That design-kit review expired. Nothing was created.' }
    if (decision !== 'allow') return { ok: true, answer: 'Cancelled. No design files were created.' }
    if (ticket.preferences !== preferencesDigest(preferences)) return { ok: false, answer: 'Project settings changed after review. Nothing was created.' }
    let folder = ''
    try {
      folder = await safeProjectDirectory('OddBrain Assets', 'Design Kits', basename(ticket.destination))
      const files = localDesignFiles(ticket.format), manifest: Array<{ file: string; bytes: number; sha256: string }> = []
      for (const [name, content] of Object.entries(files)) { const bytes = Buffer.from(content); await writeFile(join(folder, name), bytes, { mode: 0o600, flag: 'wx' }); manifest.push({ file: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }) }
      const receipt = join(folder, 'manifest.json'); await writeFile(receipt, `${JSON.stringify({ schema: 1, generatedAt: new Date(now()).toISOString(), generator: 'OddBrain local design kit v1', format: ticket.format, licence: 'Owner-created local output; review before reuse or distribution.', files: manifest }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      let imported = false, importOutcome: { binId: string; ready: boolean; duration?: number } | undefined, importError = '', outcomeRecorded = false, suffix = ''
      if (importTitleIntoKdenlive) try { importOutcome = await importAsset(join(folder, 'title-card.svg')); imported = true } catch (error) { importError = (error as Error).message; suffix = ` ${importError}` }
      if (importTitleIntoKdenlive) try { await writeFile(join(folder, 'kdenlive-import.json'), `${JSON.stringify({ schema: 1, recordedAt: new Date(now()).toISOString(), requested: true, succeeded: imported, ...(importOutcome || {}), ...(importError ? { error: importError } : {}) }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' }); outcomeRecorded = true } catch (error) { suffix += ` The Kdenlive outcome receipt could not be saved: ${(error as Error).message}` }
      return { ok: true, answer: `Created the reviewed local ${ticket.format} design kit with a hash manifest.${outcomeRecorded ? ' Saved the requested Kdenlive import outcome.' : ''}${imported ? ` Imported its title card into Kdenlive as bin ${importOutcome!.binId} without timeline placement.${suffix}` : suffix}`, path: folder, imported, ...(importOutcome ? { binId: importOutcome.binId } : {}), receipt }
    } catch (error) { if (folder) await rm(folder, { recursive: true, force: true }).catch(() => undefined); return { ok: false, answer: `The new design kit could not be completed and its new partial folder was removed: ${(error as Error).message}` } }
  }

  const withoutSession = (state: KdenliveProjectSnapshot): Omit<KdenliveProjectSnapshot, 'sessionId'> => {
    const { sessionId: _sessionId, ...visible } = state
    return visible
  }

  const historyFrom = (value: any): KdenliveHistoryEntry[] => (Array.isArray(value?.entries) ? value.entries : Array.isArray(value?.history) ? value.history : []).slice(-100).flatMap((entry: any) => {
    if (!entry || !Number.isSafeInteger(Number(entry.undoIndex))) return []
    return [{ undoIndex: Number(entry.undoIndex), text: text(entry.text, 500), state: text(entry.state, 100), origin: text(entry.origin, 100), ...(text(entry.timestamp, 100) ? { timestamp: text(entry.timestamp, 100) } : {}), ...(text(entry.command, 100) ? { command: text(entry.command, 100) } : {}) }]
  })

  const captureKdenliveFrame = async (positionInput: number): Promise<import('../../shared/lib/videoStudio').KdenliveFrameCapture> => {
    const position = Number(positionInput)
    if (!Number.isSafeInteger(position) || position < 0) return { ok: false, position: 0, error: 'Choose a non-negative timeline frame.' }
    try {
      const connection = await nativeConnection(), called = await mcpRequest('tools/call', { name: 'desktop_frame_capture', arguments: { position, width: 960 } }, connection.session)
      if (called.value?.isError) throw Error('Kdenlive reported that frame capture failed.')
      const image = Array.isArray(called.value?.content) ? called.value.content.find((item: any) => item?.type === 'image' && typeof item.data === 'string' && typeof item.mimeType === 'string') : null
      if (!image || image.data.length > 6_000_000 || !/^image\/(?:png|jpeg)$/.test(image.mimeType)) throw Error('Kdenlive returned no bounded PNG/JPEG frame.')
      return { ok: true, position, mime: image.mimeType, data: image.data }
    } catch (error) { return { ok: false, position, error: (error as Error).message } }
  }

  const prepareKdenliveRender = async (owner: number, mode: KdenliveRenderMode, startInput?: number, endInput?: number, intentInput: KdenliveOutputIntent = 'current-sequence'): Promise<KdenliveRenderReview> => {
    prune()
    if (!['preview', 'export'].includes(mode)) return { ok: false, error: 'Choose a short preview or final export.' }
    const intent: KdenliveOutputIntent = mode === 'preview' ? 'current-sequence' : intentInput
    if (!['vertical-short', 'current-sequence'].includes(intent)) return { ok: false, error: 'Choose a vertical short or current-sequence export review.' }
    try {
      if (!await realFolder(preferences.projectFolder)) throw Error('Choose an existing project folder before rendering.')
      const connection = await nativeConnection(), state = await readNativeState(connection)
      if (!state.documentUrl) throw Error('Save the visible Kdenlive project before rendering.')
      if (mode === 'export' && intent === 'vertical-short' && (!state.profile.width || !state.profile.height || state.profile.width >= state.profile.height)) throw Error(`The visible ${state.profile.width || '?'}×${state.profile.height || '?'} sequence is not portrait. Reframe or change the Kdenlive project profile through a separately reviewed edit before a vertical-short export.`)
      const durationSeconds = state.profile.duration && state.profile.fps ? state.profile.duration / state.profile.fps : undefined
      let range: { start: number; end: number } | undefined
      if (mode === 'preview') {
        const start = Number(startInput), end = Number(endInput)
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) throw Error('Choose a valid preview frame range with an exclusive end frame.')
        if (!state.profile.fps) throw Error('Kdenlive did not report the project frame rate, so the ten-second preview limit cannot be verified.')
        if (end - start > Math.floor(state.profile.fps * 10)) throw Error(`Keep the preview to ten seconds or less (at most ${Math.floor(state.profile.fps * 10)} frames for this project).`)
        if (state.profile.duration && end > state.profile.duration) throw Error(`The preview end exceeds the visible ${state.profile.duration}-frame sequence.`)
        range = { start, end }
      }
      const root = await realpath(preferences.projectFolder), folder = mode === 'preview' ? 'OddBrain Previews' : 'OddBrain Exports'
      const destination = join(root, folder, `${mode === 'export' ? intent : mode}-${new Date(now()).toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.mp4`)
      const token = randomUUID(), expires = now() + 5 * 60_000
      renderApprovals.set(token, { owner, mode, intent, state, destination, ...(range ? { range } : {}), preferences: preferencesDigest(preferences), expires })
      const profile = { width: state.profile.width, height: state.profile.height, ...(state.profile.fps ? { fps: state.profile.fps } : {}), ...(durationSeconds ? { durationSeconds } : {}) }
      return { ok: true, token, mode, intent, destination, profile, ...(range ? { range } : {}), consequence: mode === 'preview' ? `Kdenlive will render only frames ${range!.start}–${range!.end} with mixed timeline audio to one new review file. It will not overwrite a file or change the playhead.` : intent === 'vertical-short' ? `Kdenlive will render the complete visible ${state.profile.width}×${state.profile.height} portrait sequence${durationSeconds ? ` (${durationSeconds.toFixed(1)} seconds)` : ''} to a new MP4. This checks shape, not changing platform upload rules; inspect the platform’s current duration/codec requirements before publishing.` : `Kdenlive will render the complete visible ${state.profile.width}×${state.profile.height} sequence${durationSeconds ? ` (${durationSeconds.toFixed(1)} seconds)` : ''} to one new MP4. Existing files are not overwritten.`, expiresAt: expiresAt(expires) }
    } catch (error) { return { ok: false, error: (error as Error).message } }
  }

  const decideKdenliveRender = async (owner: number, token: string, decision: 'allow' | 'deny'): Promise<{ ok: boolean; answer: string }> => {
    prune(); const ticket = renderApprovals.get(token); renderApprovals.delete(token)
    if (!ticket || ticket.owner !== owner) return { ok: false, answer: 'That render review expired or belongs to another window. Nothing was rendered.' }
    if (decision !== 'allow') return { ok: true, answer: 'Denied. No render was started.' }
    if (ticket.preferences !== preferencesDigest(preferences)) return { ok: false, answer: 'Kdenlive settings changed after review. Nothing was rendered.' }
    const controller = new AbortController(); mcpJobs.get(owner)?.abort(); mcpJobs.set(owner, controller)
    try {
      const connection = await nativeConnection(), current = await readNativeState(connection, controller.signal)
      if (current.sessionId !== ticket.state.sessionId || current.sequenceId !== ticket.state.sequenceId || current.documentUrl !== ticket.state.documentUrl || current.revision !== ticket.state.revision || current.profile.width !== ticket.state.profile.width || current.profile.height !== ticket.state.profile.height || current.profile.fps !== ticket.state.profile.fps) throw Error('The visible Kdenlive project or output profile changed after render review. Review a fresh render; nothing was started.')
      const folder = await safeProjectDirectory(ticket.mode === 'preview' ? 'OddBrain Previews' : 'OddBrain Exports'), destination = join(folder, basename(ticket.destination))
      if (destination !== ticket.destination) throw Error('The reviewed render destination changed. Nothing was started.')
      const tool = ticket.mode === 'preview' ? 'desktop_preview_render' : 'desktop_render'
      const args: Record<string, unknown> = { sessionId: current.sessionId, expectedRevision: current.revision, requestId: randomUUID(), path: destination, ...(ticket.range ? { start: ticket.range.start, end: ticket.range.end, width: 640 } : {}) }
      const receipt = { owner, mode: ticket.mode, ...(ticket.range ? { range: ticket.range } : {}), startedAt: new Date(now()).toISOString(), status: 'starting' }
      activeRenders.set(destination, receipt)
      try { saveRenderReceipts() } catch (error) { activeRenders.delete(destination); throw error }
      try { await callTool(connection, tool, args, controller.signal); receipt.status = 'started'; saveRenderReceipts() }
      catch (error) { receipt.status = 'start-failed-or-uncertain'; try { saveRenderReceipts() } catch {}; throw error }
      return { ok: true, answer: `${ticket.mode === 'preview' ? 'Short preview' : 'Final export'} started in Kdenlive at ${destination}. Refresh render status rather than assuming completion.` }
    } catch (error) { return { ok: false, answer: controller.signal.aborted ? 'Stop was requested while Kdenlive was starting the render. The outcome is uncertain; refresh native render status before retrying.' : (error as Error).message } }
    finally { if (mcpJobs.get(owner) === controller) mcpJobs.delete(owner) }
  }

  const kdenliveRenderStatus = async (): Promise<KdenliveRenderStatus> => {
    if (!activeRenders.size) return { ok: true, jobs: [], answer: 'No retained owner-approved render receipt is available.' }
    try {
      const connection = await nativeConnection(), value = await callTool(connection, 'desktop_render_status', {})
      const reported = Array.isArray(value?.jobs) ? value.jobs : Array.isArray(value?.renders) ? value.renders : []
      const jobs: KdenliveRenderJob[] = []
      for (const [path, retained] of activeRenders) {
        const raw = reported.find((item: any) => item && item.path === path) || {}; let status = text(raw.status || raw.state, 100) || retained.status || 'unknown'
        retained.status = status
        let verification: Record<string, unknown> | undefined
        if (retained.verified) verification = { verified: true, retainedReceipt: true }
        else if (/^(?:complete|completed|done|finished|succeeded|unconfirmed|interrupted)$/i.test(status)) {
          try {
            const checked = await callTool(connection, 'desktop_render_verify', { path, includeAudio: false })
            verification = { verified: checked?.verified === true, fullDecode: checked?.fullDecode === true, hasAudio: checked?.hasAudio === true, ...(Number.isFinite(Number(checked?.expectedFrames)) ? { expectedFrames: Number(checked.expectedFrames) } : {}), ...(Number.isFinite(Number(checked?.actualFrames)) ? { actualFrames: Number(checked.actualFrames) } : {}), ...(Number.isFinite(Number(checked?.width)) ? { width: Number(checked.width) } : {}), ...(Number.isFinite(Number(checked?.height)) ? { height: Number(checked.height) } : {}), ...(text(checked?.format, 100) ? { format: text(checked.format, 100) } : {}) }
            if (checked?.verified === true) { status = 'finished'; retained.status = status; retained.verified = true }
          } catch (error) { verification = { verified: false, error: (error as Error).message.slice(0, 1000) } }
        }
        jobs.push({ path, mode: retained.mode, ...(retained.range ? { range: retained.range } : {}), status, ...(Number.isFinite(Number(raw.progress)) ? { progress: Number(raw.progress) } : {}), ...(text(raw.error, 1000) ? { error: text(raw.error, 1000) } : {}), startedAt: retained.startedAt, ...(verification ? { verification } : {}) })
      }
      saveRenderReceipts()
      return { ok: true, jobs, answer: jobs.some(job => /^(?:complete|completed|done|finished|succeeded)$/i.test(job.status) && job.verification?.verified === true) ? 'Kdenlive reports a completed render and verification metadata is available.' : 'Render status refreshed from Kdenlive. A started job is not called complete until Kdenlive reports and verifies it.' }
    } catch (error) { return { ok: false, jobs: [], answer: (error as Error).message } }
  }

  const prepareKdenlivePreviewInspection = async (owner: number, pathInput: string, videoOcr = false): Promise<KdenlivePreviewInspectionReview> => {
    prune()
    try {
      const path = text(pathInput, 4096), retained = activeRenders.get(path)
      if (videoOcr && options.videoOcrAvailable?.() !== true) throw Error('Reviewed DeepSeek-OCR-2 is not configured. Turn off OCR for this preview or configure the existing adapter first.')
      if (!path || !retained || retained.mode !== 'preview' || !retained.verified || !/^(?:complete|completed|done|finished|succeeded)$/i.test(retained.status)) throw Error('Choose a retained Kdenlive preview that has completed native verification first.')
      if (retained.owner !== -1 && retained.owner !== owner) throw Error('That preview belongs to another window.')
      const folder = await safeProjectDirectory('OddBrain Previews'), actual = await realpath(path), relativePath = relative(folder, actual)
      if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath) || !await regularFile(actual)) throw Error('The completed preview is no longer a regular file in the reviewed preview folder.')
      const info = await lstat(actual)
      const token = randomUUID(), expires = now() + 5 * 60_000
      previewInspections.set(token, { owner, path: actual, videoOcr: videoOcr === true, size: info.size, dev: info.dev, ino: info.ino, mtimeMs: info.mtimeMs, preferences: preferencesDigest(preferences), expires })
      return { ok: true, token, path: actual, consequence: `Read this verified preview as a new, durable local evidence map: complete audio/transcript and delivery, scenes, adaptive frames${videoOcr ? ' and reviewed DeepSeek-OCR-2 frame text' : ''}. The original source evidence stays separate. No Kdenlive edit is applied.`, expiresAt: expiresAt(expires) }
    } catch (error) { return { ok: false, error: (error as Error).message } }
  }

  const decideKdenlivePreviewInspection = async (owner: number, token: string, decision: 'allow' | 'deny'): Promise<{ ok: boolean; answer: string; evidence?: VideoEvidenceSummary }> => {
    prune(); const ticket = previewInspections.get(token); previewInspections.delete(token)
    if (!ticket || ticket.owner !== owner) return { ok: false, answer: 'That preview-inspection review expired or belongs to another window. Nothing was read.' }
    if (decision !== 'allow') return { ok: true, answer: 'Cancelled. The preview file remains untouched and no evidence map was created.' }
    if (ticket.preferences !== preferencesDigest(preferences)) return { ok: false, answer: 'Project settings changed after review. Nothing was read.' }
    const retained = activeRenders.get(ticket.path)
    if (!retained?.verified || retained.mode !== 'preview' || !/^(?:complete|completed|done|finished|succeeded)$/i.test(retained.status)) return { ok: false, answer: 'The retained preview is no longer verified as complete. Refresh Kdenlive render status before trying again.' }
    try {
      const folder = await safeProjectDirectory('OddBrain Previews'), actual = await realpath(ticket.path), relativePath = relative(folder, actual)
      if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath) || !await regularFile(actual)) throw Error('The reviewed preview is no longer a regular file in the preview folder.')
      const info = await lstat(actual)
      if (info.size !== ticket.size || info.dev !== ticket.dev || info.ino !== ticket.ino || info.mtimeMs !== ticket.mtimeMs) throw Error('The preview file changed after review. Refresh native render status and review inspection again; nothing was read.')
      const ready = storedEvidence.find(item => item.status === 'ready' && item.sourcePath === actual)
      if (ready) return ticket.videoOcr && ready.raw.videoOcr !== true ? { ok: false, answer: 'That exact preview already has a ready evidence map created without OCR. OddBrain kept it unchanged instead of destructively replacing it; use its retained frames or render a new preview for a separate OCR review.', evidence: publicEvidence(ready) } : { ok: true, answer: 'That exact Kdenlive preview already has a ready evidence map. Nothing was reprocessed.', evidence: publicEvidence(ready) }
      const name = `Kdenlive preview · ${basename(actual)}`, input = { sourceKind: 'file' as const, receipt: renderReceiptFile, videoOcr: ticket.videoOcr, dedupe: false as const }
      const intake = registerEvidenceIntake(actual, name, input)
      if (!options.analyzeVideo) {
        const evidence = recordEvidenceFailure(actual, name, input, 'This runtime has no connected local evidence reader.')
        return { ok: false, answer: 'The preview intake was retained, but this runtime has no connected local evidence reader. Retry remains available.', evidence }
      }
      try {
        const evidence = await recordEvidence(owner, actual, await options.analyzeVideo(owner, actual, ticket.videoOcr), input)
        return { ok: true, answer: 'The verified preview now has a separate complete evidence map. Ask what changed, inspect timestamps, then propose a new reviewed improvement pass.', evidence }
      } catch (error) {
        const evidence = recordEvidenceFailure(actual, name, input, (error as Error).message)
        return { ok: false, answer: `The preview file and durable intake remain available, but inspection was blocked: ${(error as Error).message}`, evidence }
      }
    } catch (error) { return { ok: false, answer: (error as Error).message } }
  }

  const workspace = async (): Promise<VideoStudioWorkspace> => {
    let project: Omit<KdenliveProjectSnapshot, 'sessionId'> | null = null, history: KdenliveHistoryEntry[] = [], notice = lastNotice
    try {
      const connection = await nativeConnection(), state = await readNativeState(connection)
      project = withoutSession(state); history = historyFrom(await callTool(connection, 'desktop_history', { limit: 100, includeUndone: true }))
    } catch (error) { notice = `${notice ? `${notice} ` : ''}${(error as Error).message}` }
    return { evidence: storedEvidence.map(publicEvidence).reverse(), proposedPlan, creativeProposal, project, history, notice }
  }

  const prepareEditPlan = async (owner: number, candidate?: KdenliveEditPlan): Promise<KdenlivePlanReview> => {
    prune()
    try {
      const plan = normalizeEditPlan(candidate || proposedPlan)
      if (plan.assetNeeds.length) return { ok: false, plan, commandSummary: commandSummary(plan.commands), error: `This plan still has ${plan.assetNeeds.length} unresolved Creative Library asset need${plan.assetNeeds.length === 1 ? '' : 's'}. Search, approve and import exact assets first; then re-read the Kdenlive bin and submit a new plan with real bin IDs.` }
      const unknownEvidence = plan.sourceEvidenceIds.filter(sourceId => !storedEvidence.some(item => item.id === sourceId && item.status === 'ready'))
      if (unknownEvidence.length) return { ok: false, plan, commandSummary: commandSummary(plan.commands), error: `The plan cites ${unknownEvidence.length} missing or non-ready evidence source${unknownEvidence.length === 1 ? '' : 's'}. Nothing was validated or applied.` }
      const connection = await nativeConnection(), state = await readNativeState(connection)
      if (!state.documentUrl) return { ok: false, error: 'Save the visible Kdenlive project before reviewing an edit plan.' }
      if (plan.expectedProject.documentUrl !== state.documentUrl || plan.expectedProject.sequenceId !== state.sequenceId || plan.expectedProject.revision !== state.revision) return { ok: false, error: 'The plan names a different project, sequence, or revision than the one now visible in Kdenlive. Re-read state and regenerate the plan; nothing was applied.' }
      let validation = { valid: false, issues: [] as string[], unsupported: false }
      try {
        const checked = await callTool(connection, 'desktop_batch_validate', { commands: plan.commands })
        const rawIssues = Array.isArray(checked.issues) ? checked.issues : []
        validation = { valid: checked.valid === true, issues: rawIssues.map((issue: any) => typeof issue === 'string' ? issue.slice(0, 1000) : JSON.stringify(issue).slice(0, 1000)), unsupported: rawIssues.some((issue: any) => /VALIDATION_UNSUPPORTED/.test(typeof issue === 'string' ? issue : JSON.stringify(issue))) }
      } catch (error) {
        if (/VALIDATION_UNSUPPORTED/.test((error as Error).message)) validation = { valid: false, issues: [(error as Error).message], unsupported: true }
        else throw error
      }
      if (!validation.valid && !validation.unsupported) return { ok: false, plan, project: withoutSession(state), commandSummary: commandSummary(plan.commands), validation, error: 'Kdenlive rejected this batch during preflight. Fix every reported issue before review.' }
      const token = randomUUID(), expires = now() + 5 * 60_000
      editPlans.set(token, { owner, plan, state, validation, preferences: preferencesDigest(preferences), expires })
      return { ok: true, token, plan, project: withoutSession(state), commandSummary: commandSummary(plan.commands), validation, consequence: `${plan.commands.length} exact command${plan.commands.length === 1 ? '' : 's'} will be sent as one native Kdenlive batch and one shared Undo step. ${plan.sourceEvidenceIds.length ? `${plan.sourceEvidenceIds.length} ready source-evidence map${plan.sourceEvidenceIds.length === 1 ? ' is' : 's are'} cited.` : 'No Video Studio evidence map is cited; review whether this is intentionally a project-only edit.'} ${validation.valid ? 'Kdenlive preflight accepted the supported insertions.' : 'Kdenlive reports that separate preflight does not cover one or more command types; the native batch still validates its schema and rolls back atomically on failure.'} Any project change invalidates this one-use approval.`, expiresAt: expiresAt(expires) }
    } catch (error) { return { ok: false, error: (error as Error).message } }
  }

  const decideEditPlan = async (owner: number, token: string, decision: 'allow' | 'deny'): Promise<{ ok: boolean; answer: string; project?: Omit<KdenliveProjectSnapshot, 'sessionId'> }> => {
    prune(); const ticket = editPlans.get(token); editPlans.delete(token)
    if (!ticket || ticket.owner !== owner) return { ok: false, answer: 'That edit-plan approval expired or belongs to another window. Nothing was sent.' }
    if (decision !== 'allow') return { ok: true, answer: 'Denied. Nothing was sent to Kdenlive.' }
    if (ticket.preferences !== preferencesDigest(preferences)) return { ok: false, answer: 'Kdenlive settings changed after review. Nothing was sent.' }
    const controller = new AbortController(); mcpJobs.get(owner)?.abort(); mcpJobs.set(owner, controller)
    try {
      const connection = await nativeConnection(), current = await readNativeState(connection, controller.signal)
      if (current.sessionId !== ticket.state.sessionId || current.sequenceId !== ticket.state.sequenceId || current.documentUrl !== ticket.state.documentUrl || current.revision !== ticket.state.revision) throw Error('The visible Kdenlive project changed after review. Re-read and review a fresh plan; nothing was applied.')
      const applied = await callTool(connection, 'desktop_batch', { sessionId: current.sessionId, expectedRevision: current.revision, requestId: randomUUID(), commands: ticket.plan.commands }, controller.signal)
      const next = projectSnapshot(applied)
      proposedPlan = null
      return { ok: true, answer: `Kdenlive reported that the reviewed ${ticket.plan.commands.length}-command batch completed as one Undo step. Revision ${current.revision} → ${next.revision}. Inspect captured frames and the result in Kdenlive’s monitor before exporting.`, project: withoutSession(next) }
    } catch (error) {
      return { ok: false, answer: controller.signal.aborted ? 'Stop was requested while Kdenlive was answering. The outcome is uncertain; OddBrain will not retry. Refresh project state and history before doing anything else.' : (error as Error).message }
    } finally { if (mcpJobs.get(owner) === controller) mcpJobs.delete(owner) }
  }

  const aiToolDefinitions = [
    { name: 'oddbrain_kdenlive_state', description: 'Read the visible Kdenlive project identity, revision, profile, Undo state and shared history through OddBrain. No editing session secret is returned.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
    { name: 'oddbrain_kdenlive_timeline', description: 'Read selected bounded sections of the visible Kdenlive sequence/bin for exact planning. Request only needed tracks, clips, compositions, markers, subtitles, bin, sequences, effects, or media. Native session secrets and bin file paths are removed.', inputSchema: { type: 'object', properties: { include: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string', enum: ['tracks', 'clips', 'compositions', 'markers', 'subtitles', 'bin', 'sequences', 'effects', 'media'] } }, trackId: { type: 'string', maxLength: 100 }, range: { type: 'object', properties: { start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 1 } }, required: ['start', 'end'], additionalProperties: false }, binIds: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 200 } } }, required: ['include'], additionalProperties: false } },
    { name: 'oddbrain_kdenlive_frame', description: 'Capture one rendered frame from the visible Kdenlive timeline without moving the playhead or editing the project.', inputSchema: { type: 'object', properties: { position: { type: 'integer', minimum: 0 } }, required: ['position'], additionalProperties: false } },
    { name: 'oddbrain_kdenlive_transcript', description: 'Read an already-existing Kdenlive clip/bin/range transcript when the reviewed native server exposes it. This never starts transcription or installs a model; request bounded word/segment evidence only.', inputSchema: { type: 'object', properties: { binId: { type: 'string', maxLength: 200 }, clipId: { type: 'integer', minimum: 0 }, range: { type: 'object', properties: { start: { type: 'integer', minimum: 0 }, end: { type: 'integer', minimum: 1 }, trackIds: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 100 } } }, required: ['start', 'end'], additionalProperties: false }, format: { type: 'string', enum: ['words', 'segments', 'text', 'srt'] }, minPause: { type: 'number', minimum: 0, maximum: 30 } }, additionalProperties: false } },
    { name: 'oddbrain_kdenlive_review_output', description: 'Read path-free native verification metadata for a completed owner-approved short preview. Media evidence is available only after the owner separately approves Inspect verified preview, which creates a normal durable evidence map; this tool cannot start, cancel, approve, or expose the output file.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
    { name: 'oddbrain_video_sources', description: 'List durable source-linked video evidence maps. Read only; returns summaries, not full transcripts.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
    { name: 'oddbrain_video_evidence', description: 'Read named complete transcript sections, delivery intervals, scene timestamps, and up to six already-retained frames from one evidence map. Call once without selections to list the map, then request only relevant complete sections/frames.', inputSchema: { type: 'object', properties: { sourceId: { type: 'string' }, sectionIds: { type: 'array', maxItems: 40, items: { type: 'string' } }, momentTimestamps: { type: 'array', maxItems: 6, items: { type: 'number', minimum: 0 } } }, required: ['sourceId'], additionalProperties: false } },
    { name: 'oddbrain_video_locate', description: 'Run a local literal-word search over complete transcript sections, retained OCR, and unconfirmed visual notes to suggest timestamp windows. This is retrieval, not semantic interpretation; use returned candidates to request exact evidence.', inputSchema: { type: 'object', properties: { sourceId: { type: 'string' }, query: { type: 'string', minLength: 2, maxLength: 500 }, maxResults: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['sourceId', 'query'], additionalProperties: false } },
    { name: 'oddbrain_video_evidence_expand', description: 'Retrieve 1–6 additional local frames and matching short audio windows at question-relevant timestamps from an already approved source. Does not edit Kdenlive or upload media.', inputSchema: { type: 'object', properties: { sourceId: { type: 'string' }, moments: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'number', minimum: 0 } }, question: { type: 'string', minLength: 2, maxLength: 1000 } }, required: ['sourceId', 'moments', 'question'], additionalProperties: false } },
    { name: 'oddbrain_video_evidence_note', description: 'Preserve AI visual descriptions as unconfirmed derived notes linked to exact timestamps and the question. It never confirms them for the owner.', inputSchema: { type: 'object', properties: { sourceId: { type: 'string' }, question: { type: 'string' }, observations: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'object', properties: { at: { type: 'number' }, description: { type: 'string' } }, required: ['at', 'description'], additionalProperties: false } } }, required: ['sourceId', 'question', 'observations'], additionalProperties: false } },
    { name: 'oddbrain_creative_search', description: 'Search live legal/free Creative Library providers for an edit need. Returns provenance for ranking and downloads nothing.', inputSchema: { type: 'object', properties: { query: { type: 'string', minLength: 2, maxLength: 160 }, kind: { type: 'string', enum: ['image', 'video', 'audio'] }, purpose: { type: 'string', minLength: 2, maxLength: 1000 }, maxResults: { type: 'integer', minimum: 1, maximum: 12 }, page: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['query', 'kind', 'purpose'], additionalProperties: false } },
    { name: 'oddbrain_edit_plan_propose', description: 'Submit an exact native Kdenlive batch for visible owner review. This does not validate or apply it. Read safe state and bounded timeline/bin sections first, cite real ready evidence IDs, and include the exact documentUrl, sequenceId and revision. Non-empty assetNeeds deliberately block Apply until exact assets are approved/imported and the plan is regenerated with real bin IDs.', inputSchema: { type: 'object', properties: { plan: { type: 'object' } }, required: ['plan'], additionalProperties: false } },
  ]

  const safeNativeRead = (value: unknown, depth = 0): unknown => {
    if (depth > 16) throw Error('The selected Kdenlive state is nested too deeply. Request a narrower section.')
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
    if (typeof value === 'string') { if (value.length > 100_000) throw Error('One selected Kdenlive state value exceeds 100,000 characters. Request a narrower section.'); return value }
    if (Array.isArray(value)) { if (value.length > 10_000) throw Error('The selected Kdenlive state has more than 10,000 entries. Request a narrower range.'); return value.map(item => safeNativeRead(item, depth + 1)) }
    if (!plain(value) || Object.keys(value).length > 500) throw Error('The selected Kdenlive state has an unsupported shape.')
    return Object.fromEntries(Object.entries(value).filter(([key, item]) => {
      const lowered = key.toLowerCase()
      if (['sessionid', 'requestid', 'url', 'path', 'filepath', 'proxypath', 'originalpath', 'token', 'authorization', 'headers'].includes(lowered) || /(?:token|secret|password|authorization|cookie)$/.test(lowered)) return false
      if (['resource', 'proxy', 'originalurl'].includes(lowered) && typeof item === 'string' && (/^(?:file:\/\/|[a-z]:[\\/]|\/)/i.test(item) || item.includes('\\'))) return false
      return true
    }).map(([key, item]) => [key, safeNativeRead(item, depth + 1)]))
  }

  const aiResult = (id: unknown, payload: unknown, images: Array<{ mime: string; data: string }> = [], audio: Array<{ mime: string; data: string }> = []): AiMcpReply => ({ status: 200, body: { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(payload) }, ...images.map(image => ({ type: 'image', mimeType: image.mime, data: image.data })), ...audio.map(item => ({ type: 'audio', mimeType: item.mime, data: item.data }))], isError: false } } })
  const aiError = (id: unknown, message: string, code = -32602): AiMcpReply => ({ status: 200, body: { jsonrpc: '2.0', id, error: { code, message: message.slice(0, 2000) } } })
  const aiMcp = async (request: unknown, session = ''): Promise<AiMcpReply> => {
    prune()
    if (!request || typeof request !== 'object' || Array.isArray(request)) return aiError(null, 'Invalid JSON-RPC request.', -32600)
    const message = request as Record<string, any>, id = message.id ?? null, method = message.method, params = message.params || {}
    if (method === 'initialize') {
      const allocated = randomUUID(); aiSessions.set(allocated, now())
      return { status: 200, session: allocated, body: { jsonrpc: '2.0', id, result: { protocolVersion: NATIVE_KDENLIVE_REFERENCE.protocol, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'oddbrain-video-review', version: '1.0.0' }, instructions: 'Use the complete time-map index, local literal locator, relevant full transcript intervals (or existing Kdenlive word evidence when available), retained frames, and question-driven frame/audio retrieval in that order. Surface uncertainty and never infer continuous vision from samples. Search live resources, then read only the needed bounded Kdenlive timeline/bin sections so plans use real IDs. Submit exact plans only after enough evidence. No tool here downloads an asset, starts a render, approves preview inspection, or edits Kdenlive; the owner reviews those actions in Video Studio. Do not judge preview media until its separately approved durable evidence map exists.' } } }
    }
    if (!session || !aiSessions.has(session)) return aiError(id, 'A valid MCP session is required.', -32600)
    aiSessions.set(session, now())
    if (method === 'notifications/initialized') return { status: 202, body: '' }
    if (method === 'tools/list') return { status: 200, body: { jsonrpc: '2.0', id, result: { tools: aiToolDefinitions } } }
    if (method !== 'tools/call' || typeof params.name !== 'string' || !params.arguments || typeof params.arguments !== 'object') return aiError(id, 'Unknown MCP method or invalid tool call.', -32601)
    const args = params.arguments as Record<string, any>
    try {
      if (params.name === 'oddbrain_kdenlive_state') {
        const connection = await nativeConnection(), state = await readNativeState(connection), history = historyFrom(await callTool(connection, 'desktop_history', { limit: 100, includeUndone: true }))
        return aiResult(id, { project: withoutSession(state), history, note: 'Read-only state. Submit any proposed batch through oddbrain_edit_plan_propose; no editing session secret is exposed.' })
      }
      if (params.name === 'oddbrain_kdenlive_timeline') {
        const allowed = new Set(['tracks', 'clips', 'compositions', 'markers', 'subtitles', 'bin', 'sequences', 'effects', 'media']), include = Array.isArray(args.include) ? [...new Set(args.include)] : []
        if (!include.length || include.length > 6 || include.some(value => typeof value !== 'string' || !allowed.has(value))) throw Error('Choose 1–6 supported Kdenlive state sections.')
        const request: Record<string, unknown> = { include }
        if (args.trackId !== undefined) { const trackId = text(args.trackId, 100); if (!trackId) throw Error('The Kdenlive track identifier is invalid.'); request.trackId = trackId }
        if (args.range !== undefined) { const start = Number(args.range?.start), end = Number(args.range?.end); if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start) throw Error('Choose a valid Kdenlive frame range.'); request.range = { start, end } }
        if (args.binIds !== undefined) { const binIds = Array.isArray(args.binIds) ? args.binIds : []; if (binIds.length > 50 || binIds.some((value: unknown) => typeof value !== 'string' || !value || value.length > 200 || /[\u0000-\u001f]/.test(value))) throw Error('Choose at most 50 valid Kdenlive bin IDs.'); request.binIds = binIds }
        const connection = await nativeConnection(), raw = await callTool(connection, 'desktop_state', request), project = withoutSession(projectSnapshot(raw)), snapshot = safeNativeRead(raw), encoded = JSON.stringify(snapshot)
        if (encoded.length > 300_000) throw Error('That complete Kdenlive state selection exceeds 300,000 characters. Request fewer sections, one track, or a narrower range; nothing was clipped.')
        return aiResult(id, { project, snapshot, note: 'Read-only bounded native state. Bin file paths and editing session secrets were removed. Use exact returned IDs in a proposal; do not guess.' })
      }
      if (params.name === 'oddbrain_kdenlive_frame') {
        const frame = await captureKdenliveFrame(Number(args.position)); if (!frame.ok || !frame.mime || !frame.data) throw Error(frame.error || 'Frame capture failed.')
        return aiResult(id, { position: frame.position, note: 'Rendered read-only Kdenlive timeline frame.' }, [{ mime: frame.mime, data: frame.data }])
      }
      if (params.name === 'oddbrain_kdenlive_transcript') {
        const selectors = [typeof args.binId === 'string' && args.binId, Number.isSafeInteger(args.clipId), args.range && typeof args.range === 'object'].filter(Boolean)
        if (selectors.length !== 1) throw Error('Choose exactly one Kdenlive bin, clip, or timeline range transcript.')
        const request: Record<string, unknown> = { format: ['words', 'segments', 'text', 'srt'].includes(args.format) ? args.format : 'words' }
        if (typeof args.binId === 'string' && args.binId.length <= 200 && !/[\u0000-\u001f]/.test(args.binId)) request.binId = args.binId
        else if (Number.isSafeInteger(args.clipId) && args.clipId >= 0) request.clipId = args.clipId
        else {
          const start = Number(args.range?.start), end = Number(args.range?.end), trackIds = Array.isArray(args.range?.trackIds) ? args.range.trackIds : undefined
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || trackIds?.length > 20 || trackIds?.some((track: unknown) => typeof track !== 'string' || track.length > 100)) throw Error('Choose a valid bounded Kdenlive transcript range.')
          request.range = { start, end, ...(trackIds ? { trackIds } : {}) }
        }
        if (Number.isFinite(Number(args.minPause))) request.minPause = Math.max(0, Math.min(30, Number(args.minPause)))
        const connection = await nativeConnection(); if (!connection.tools.some(tool => tool.name === 'desktop_transcript')) throw Error('This reviewed Kdenlive server does not expose transcript readback.')
        const transcript = safeNativeRead(await callTool(connection, 'desktop_transcript', request)), encoded = JSON.stringify(transcript)
        if (encoded.length > 120_000) throw Error('That complete Kdenlive transcript response exceeds 120,000 characters. Request a smaller clip or range; nothing was clipped.')
        return aiResult(id, { transcript, note: 'Read-only Kdenlive transcript evidence. Preserve its engine/language/timing disclosures and do not invent speaker identity.' })
      }
      if (params.name === 'oddbrain_kdenlive_review_output') {
        const status = await kdenliveRenderStatus(), complete = [...status.jobs].reverse().find(job => job.mode === 'preview' && /^(?:complete|completed|done|finished|succeeded)$/i.test(job.status) && job.verification?.verified === true)
        if (!complete) return aiResult(id, { ok: status.ok, answer: status.answer, job: null, note: 'No completed owner-approved and natively verified preview is available.' })
        const { path: _privatePath, error: _privateError, ...safeJob } = complete, evidence = storedEvidence.find(item => item.sourcePath === complete.path && item.status === 'ready')
        return aiResult(id, { ok: status.ok, answer: status.answer, job: safeJob, evidence: evidence ? publicEvidence(evidence) : null, note: evidence ? 'The owner separately approved complete evidence inspection. Read its exact sections and frames through the normal evidence tools.' : 'Only path-free technical verification is available. Ask the owner to approve Inspect verified preview before judging audio, motion, transcript, or delivery.' })
      }
      if (params.name === 'oddbrain_video_sources') return aiResult(id, { sources: storedEvidence.map(publicEvidence) })
      if (params.name === 'oddbrain_video_evidence') {
        const item = storedEvidence.find(value => value.id === args.sourceId); if (!item) throw Error('Unknown video evidence source.')
        if (item.status !== 'ready') throw Error('That video intake is not ready. The owner can retry its retained source in Video Studio.')
        const requested = Array.isArray(args.sectionIds) ? args.sectionIds : [], requestedMoments = Array.isArray(args.momentTimestamps) ? [...new Set(args.momentTimestamps.map(Number))] : []
        if (!requested.length && !requestedMoments.length) return aiResult(id, { source: publicEvidence(item), sections: item.transcriptSegments.map(section => ({ id: section.id, label: section.label, characters: section.text.length })), audioWindows: item.audioWindows, scenes: item.scenes, moments: publicEvidence(item).moments, unconfirmedDescriptions: item.unconfirmed.descriptions, note: 'This is the complete local time-map index. Request only needed complete sections and up to six retained frames; use locate or question-driven expansion when the map is insufficient.' })
        const sections = requested.map((sectionId: unknown) => item.transcriptSegments.find(section => section.id === sectionId)).filter(Boolean)
        if (sections.length !== requested.length) throw Error('One or more requested transcript section IDs do not exist.')
        const characters = sections.reduce((total, section) => total + section!.text.length, 0); if (characters > 120_000) throw Error('Those complete sections exceed the 120,000-character tool response budget. Request fewer complete sections; none were clipped.')
        if (requestedMoments.length > 6 || requestedMoments.some(at => !Number.isFinite(at))) throw Error('Request at most six valid retained-frame timestamps.')
        const selectedFrames = requestedMoments.map(at => item.frameFiles.find(frame => Math.abs(frame.at - at) < .001))
        if (selectedFrames.some(frame => !frame)) throw Error('One or more requested timestamps is not a retained frame. Use a listed timestamp or question-driven expansion.')
        const images: Array<{ mime: string; data: string }> = []; let imageBytes = 0
        for (const frame of selectedFrames) { const bytes = await readFile(frame!.path); imageBytes += bytes.length; if (bytes.length > 2_000_000 || imageBytes > 6_000_000) throw Error('Those retained frames exceed the six-megabyte evidence response budget. Request fewer frames; none were clipped.'); images.push({ mime: frame!.mime, data: bytes.toString('base64') }) }
        return aiResult(id, { source: publicEvidence(item), sections, frames: requestedMoments.map(at => publicEvidence(item).moments.find(moment => Math.abs(moment.at - at) < .001)) }, images)
      }
      if (params.name === 'oddbrain_video_locate') {
        const item = storedEvidence.find(value => value.id === args.sourceId); if (!item || item.status !== 'ready') throw Error('Unknown or non-ready video evidence source.')
        const query = text(args.query, 500), terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [])], max = Number.isSafeInteger(args.maxResults) ? Math.max(1, Math.min(20, args.maxResults)) : 10
        if (!query || !terms.length) throw Error('Provide literal words to locate in the video evidence.')
        const candidates = item.transcriptSegments.map((section, index) => {
          const haystack = section.text.toLowerCase(), hits = terms.reduce((sum, term) => sum + (haystack.split(term).length - 1), 0), offset = item.transcriptSegments[0]?.id === 'audio-delivery-summary' ? 1 : 0, window = index >= offset ? item.audioWindows[index - offset] : undefined
          return { kind: 'transcript' as const, sectionId: section.id, label: section.label, ...(window ? { start: window.start, end: window.end } : {}), hits }
        }).filter(candidate => candidate.hits > 0)
        const visual = item.moments.map(moment => { const description = item.unconfirmed.descriptions.filter(note => Math.abs(note.at - moment.at) < .001).map(note => note.description).join(' '), haystack = `${moment.ocr || ''} ${description}`.toLowerCase(), hits = terms.reduce((sum, term) => sum + (haystack.split(term).length - 1), 0); return { kind: 'visual' as const, at: moment.at, hits, hasOcr: Boolean(moment.ocr), descriptionState: moment.descriptionState || 'none' } }).filter(candidate => candidate.hits > 0)
        const results = [...candidates, ...visual].sort((a, b) => b.hits - a.hits).slice(0, max)
        return aiResult(id, { query, terms, results, note: 'Literal local retrieval only. Missing results do not prove the subject is absent; inspect complete sections or request question-driven evidence when needed.' })
      }
      if (params.name === 'oddbrain_video_evidence_expand') {
        const answer = await expandEvidence(-1, String(args.sourceId || ''), args.moments, String(args.question || '')); if (!answer.ok) throw Error(answer.answer)
        return aiResult(id, { answer: answer.answer, moments: answer.moments }, (answer.images || []).map(image => ({ mime: image.mime, data: image.data })), (answer.audio || []).map(audio => ({ mime: audio.mime, data: audio.data })))
      }
      if (params.name === 'oddbrain_video_evidence_note') {
        const item = storedEvidence.find(value => value.id === args.sourceId); if (!item) throw Error('Unknown video evidence source.')
        if (item.status !== 'ready') throw Error('Only ready source evidence can receive derived notes.')
        const question = text(args.question, 1000), observations = Array.isArray(args.observations) ? args.observations : []
        if (!question || observations.length < 1 || observations.length > 50) throw Error('Provide a question and 1–50 observations.')
        for (const observation of observations) {
          const at = Number(observation?.at), description = text(observation?.description, 2000)
          if (!Number.isFinite(at) || at < 0 || at > item.duration || !description) throw Error('Each description needs a valid source timestamp and bounded text.')
          item.unconfirmed.descriptions.push({ at, description, question, createdAt: new Date(now()).toISOString() })
          const moment = item.moments.find(value => Math.abs(value.at - at) < 0.001); if (moment) { moment.description = description; moment.descriptionState = 'unconfirmed' }
        }
        saveEvidence(); return aiResult(id, { saved: observations.length, state: 'unconfirmed', sourceId: item.id })
      }
      if (params.name === 'oddbrain_creative_search') {
        const kind = args.kind as CreativeKind, query = text(args.query, 160), purpose = text(args.purpose, 1000), max = Number.isSafeInteger(args.maxResults) ? Math.max(1, Math.min(12, args.maxResults)) : 8, page = Number.isSafeInteger(args.page) ? Math.max(1, Math.min(20, args.page)) : 1
        if (!query || !purpose || !['image', 'video', 'audio'].includes(kind)) throw Error('Provide a valid query, kind, and edit purpose.')
        const found = await search(-1, query, kind, page), ranked = found.assets.slice(0, max); creativeProposal = { query, kind, purpose, assets: ranked, createdAt: new Date(now()).toISOString() }
        return aiResult(id, { ...found, assets: ranked, purpose, note: 'Nothing was downloaded. The owner must approve one exact result in Video Studio.' })
      }
      if (params.name === 'oddbrain_edit_plan_propose') {
        proposedPlan = normalizeEditPlan(args.plan); lastNotice = `AI proposed “${proposedPlan.title}” with ${proposedPlan.commands.length} exact Kdenlive command(s). It has not been validated or applied.`
        return aiResult(id, { acceptedForReview: true, planId: proposedPlan.id, commandCount: proposedPlan.commands.length, note: 'No Kdenlive action occurred. The owner must validate and approve this exact plan in Video Studio.' })
      }
      throw Error('Unknown OddBrain video tool.')
    } catch (error) { return aiError(id, (error as Error).message) }
  }

  const actionTools: Record<KdenliveAction, string[]> = {
    undo: ['desktop_undo', 'desktop_timeline_undo', 'timeline_undo', 'undo'],
    redo: ['desktop_redo', 'desktop_timeline_redo', 'timeline_redo', 'redo'],
    'save-version': ['desktop_project_save_as'],
  }
  const prepareKdenliveAction = async (owner: number, action: KdenliveAction): Promise<KdenliveToolReview> => {
    prune()
    if (!actionTools[action]) return { ok: false, error: 'Unknown Kdenlive action.' }
    try {
      const connection = lastConnection || await connectMcp(), tool = connection.tools.find(item => actionTools[action].includes(item.name))
      if (!tool) return { ok: false, error: `This Kdenlive MCP server does not expose a reviewed ${action === 'undo' ? 'Undo' : action === 'redo' ? 'Redo' : 'save-version'} tool. Use Kdenlive’s own control instead.` }
      let args: Record<string, unknown> = {}
      if (connection.native.compatible && (tool.name === 'desktop_undo' || tool.name === 'desktop_redo')) {
        const state = await readNativeState(connection)
        if (tool.name === 'desktop_undo' && !state.undo.canUndo) return { ok: false, error: 'The visible Kdenlive project has nothing to Undo.' }
        if (tool.name === 'desktop_redo' && !state.undo.canRedo) return { ok: false, error: 'The visible Kdenlive project has nothing to Redo.' }
        args = { sessionId: state.sessionId, expectedRevision: state.revision, requestId: randomUUID(), count: 1 }
      } else if (connection.native.compatible && tool.name === 'desktop_project_save_as') {
        if (!await realFolder(preferences.projectFolder)) return { ok: false, error: 'Choose an existing project folder before saving a version.' }
        const state = await readNativeState(connection)
        if (!state.documentUrl) return { ok: false, error: 'Save the visible Kdenlive project before creating a version.' }
        const root = await realpath(preferences.projectFolder), destination = join(root, 'OddBrain Versions', `version-${new Date(now()).toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.kdenlive`)
        args = { sessionId: state.sessionId, expectedRevision: state.revision, requestId: randomUUID(), path: destination }
      } else if (tool.inputSchema?.required?.length) return { ok: false, error: `${tool.name} needs server-specific inputs. OddBrain will not guess them; use Kdenlive or a reviewed native protocol.` }
      const token = randomUUID(), expires = now() + 2 * 60_000
      editorActions.set(token, { owner, action, tool: tool.name, args, preferences: preferencesDigest(preferences), expires })
      const label = action === 'undo' ? 'Undo the latest visible shared-history step' : action === 'redo' ? 'Redo the next visible shared-history step' : 'Save a recoverable project version and keep editing that new copy'
      return { ok: true, token, tool: tool.name, summary: `${label} using ${tool.name}${typeof args.path === 'string' ? ` at ${args.path}` : ''}. This is one-use approval; a native revision conflict fails instead of guessing.`, expiresAt: expiresAt(expires) }
    } catch (error) { return { ok: false, error: (error as Error).message } }
  }
  const decideKdenliveAction = async (owner: number, token: string, decision: 'allow' | 'deny'): Promise<{ ok: boolean; answer: string }> => {
    prune(); const ticket = editorActions.get(token); editorActions.delete(token)
    if (!ticket || ticket.owner !== owner) return { ok: false, answer: 'That Kdenlive action review expired. Nothing was changed.' }
    if (decision !== 'allow') return { ok: true, answer: 'Denied. Nothing was sent to Kdenlive.' }
    if (ticket.preferences !== preferencesDigest(preferences)) return { ok: false, answer: 'Kdenlive settings changed after review. Nothing was sent.' }
    const controller = new AbortController(); mcpJobs.get(owner)?.abort(); mcpJobs.set(owner, controller)
    try {
      const connection = lastConnection || await connectMcp()
      if (!connection.tools.some(item => item.name === ticket.tool)) throw Error('The reviewed tool is no longer exposed by this Kdenlive server.')
      if (connection.native.compatible && ['desktop_undo', 'desktop_redo', 'desktop_project_save_as'].includes(ticket.tool)) {
        const expected = Number(ticket.args.expectedRevision), current = await readNativeState(connection, controller.signal)
        if (current.sessionId !== ticket.args.sessionId || current.revision !== expected) throw Error('The Kdenlive project changed after review. Nothing was sent; review again.')
        if (ticket.tool === 'desktop_project_save_as') {
          const folder = await safeProjectDirectory('OddBrain Versions'), destination = join(folder, basename(String(ticket.args.path || '')))
          if (destination !== ticket.args.path) throw Error('The reviewed version destination changed. Nothing was saved.')
        }
      }
      if (connection.native.compatible) await callTool(connection, ticket.tool, ticket.args, controller.signal)
      else {
        const called = await mcpRequest('tools/call', { name: ticket.tool, arguments: ticket.args }, connection.session, false, controller.signal)
        if (called.value?.isError) throw Error('Kdenlive MCP reported that the action failed.')
      }
      return { ok: true, answer: ticket.action === 'undo' ? 'Kdenlive reported that the reviewed Undo completed.' : ticket.action === 'redo' ? 'Kdenlive reported that the reviewed Redo completed.' : 'Kdenlive reported that the reviewed project-version save completed.' }
    } catch (error) { return { ok: false, answer: controller.signal.aborted ? 'Stop was requested while Kdenlive was answering. The outcome is uncertain; refresh state and history before retrying.' : (error as Error).message } }
    finally { if (mcpJobs.get(owner) === controller) mcpJobs.delete(owner) }
  }

  return {
    read: view,
    update: async (patch: Partial<VideoStudioPreferences>) => { save(patch); lastNotice = 'Video settings saved. No connection or download was started.'; return view() },
    saveSecret: async (kind: 'mcp' | 'pixabay', value: string) => { if (!['mcp', 'pixabay'].includes(kind)) throw Error('Unknown video credential kind.'); const key = String(value || '').trim(); if (!key || key.length > 4096 || /[\u0000\r\n]/.test(key)) throw Error('Paste one valid key or token.'); const store = options.keys(); if (!store) throw Error('Secure credential storage is not ready. Nothing was saved.'); store.set(kind === 'mcp' ? MCP_KEY : PIXABAY_KEY, key); lastConnection = null; lastNotice = `${kind === 'mcp' ? 'MCP token' : 'Pixabay key'} saved ${store.encryption === 'os' ? 'with OS protection' : 'for this run only'}.`; return view() },
    clearSecret: async (kind: 'mcp' | 'pixabay') => { if (!['mcp', 'pixabay'].includes(kind)) throw Error('Unknown video credential kind.'); const store = options.keys(); if (!store) throw Error('Secure credential storage is not ready. Nothing changed.'); store.clear(kind === 'mcp' ? MCP_KEY : PIXABAY_KEY); lastConnection = null; lastNotice = 'Credential removed.'; return view() },
    testKdenlive,
    openKdenlive: async (): Promise<{ ok: boolean; answer: string }> => {
      if (!await regularFile(preferences.kdenlive)) return { ok: false, answer: 'Choose and verify Kdenlive first.' }
      try { (options.launch || ((command, args) => { const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: false, shell: false }); child.unref() }))(preferences.kdenlive, []); return { ok: true, answer: 'Opened Kdenlive. Live edits still require the reviewed loopback MCP connection.' } }
      catch (error) { return { ok: false, answer: `Kdenlive could not be opened: ${(error as Error).message}` } }
    },
    search, preview, prepareAsset, decideAsset, preflightUrl, acquireUrl, workspace, captureKdenliveFrame, prepareKdenliveRender, decideKdenliveRender, kdenliveRenderStatus, prepareKdenlivePreviewInspection, decideKdenlivePreviewInspection, expandEvidence, readEvidenceFrame, retryEvidence, confirmEvidenceDescription, prepareEditPlan, decideEditPlan, prepareKdenliveAction, decideKdenliveAction, prepareDesignKit, decideDesignKit, aiMcp,
    registerLocalIntake: (_owner: number, path: string, input: { name: string; sha256: string; videoOcr?: boolean }) => registerEvidenceIntake(path, input.name, { sourceKind: 'file', sha256: input.sha256, videoOcr: input.videoOcr }),
    markLocalEvidenceFailure: (sha256: string, error: string): VideoEvidenceSummary | undefined => {
      const item = storedEvidence.find(value => value.sourceKind === 'file' && value.sha256 === sha256 && value.status === 'processing')
      return item ? recordEvidenceFailure(item.sourcePath, item.name, { sourceKind: 'file', sha256 }, error) : undefined
    },
    recordLocalEvidence: (owner: number, path: string, result: MediaResult) => recordEvidence(owner, path, result, { sourceKind: 'file' }),
    setAiToolsUrl: (url: string): void => { aiToolsUrl = url },
    stop: async (owner: number): Promise<{ ok: boolean; answer: string }> => {
      const transfer = transfers.get(owner), operation = mcpJobs.get(owner), aiOperation = mcpJobs.get(-1), render = [...activeRenders].reverse().find(([, value]) => (value.owner === owner || value.owner === -1) && !/^(?:complete|completed|done|finished|succeeded|failed|cancelled|canceled)$/i.test(value.status))
      transfer?.abort(); operation?.abort(); aiOperation?.abort(); options.stopVideoAnalysis?.(owner)
      let renderAnswer = ''
      if (render) try { const connection = await nativeConnection(); await callTool(connection, 'desktop_render_cancel', { path: render[0] }); render[1].status = 'aborted'; renderAnswer = ` Kdenlive reported that render cancellation was requested for ${render[0]}.`; try { saveRenderReceipts() } catch (error) { renderAnswer += ` The recovered receipt could not be updated: ${(error as Error).message}` } } catch (error) { renderAnswer = ` The render cancellation could not be confirmed: ${(error as Error).message}` }
      if (!transfer && !operation && !aiOperation && !render) return { ok: true, answer: 'No Video Studio transfer, evidence retrieval, Kdenlive operation, or owner-approved render is known to be running. Any local media analysis owned by this window was also asked to stop.' }
      return { ok: true, answer: `Stop requested for ${[transfer ? 'transfer' : '', operation || aiOperation ? 'evidence/editor operation' : '', render ? 'native render' : ''].filter(Boolean).join(', ')}. An interrupted editor call stays uncertain until state and history are refreshed.${renderAnswer}` }
    },
    forget: (owner: number): void => { transfers.get(owner)?.abort(); transfers.delete(owner); mcpJobs.get(owner)?.abort(); mcpJobs.delete(owner); for (const [key, value] of assets) if (value.owner === owner) assets.delete(key); for (const [key, value] of approvals) if (value.owner === owner) approvals.delete(key); for (const [key, value] of urls) if (value.owner === owner) urls.delete(key); for (const [key, value] of editorActions) if (value.owner === owner) editorActions.delete(key); for (const [key, value] of editPlans) if (value.owner === owner) editPlans.delete(key); for (const [key, value] of renderApprovals) if (value.owner === owner) renderApprovals.delete(key); for (const [key, value] of previewInspections) if (value.owner === owner) previewInspections.delete(key); for (const [key, value] of designKits) if (value.owner === owner) designKits.delete(key) },
    setKdenlive: (path: string) => save({ kdenlive: path }), setProjectFolder: (path: string) => save({ projectFolder: path }), setYtDlp: (path: string) => save({ ytDlp: path }),
  }
}
