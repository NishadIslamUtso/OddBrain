import { createHash, randomUUID } from 'node:crypto'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { lstat, mkdir, open, realpath, rename, rm, statfs, writeFile } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, relative } from 'node:path'
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
  type KdenliveAction,
  type KdenliveToolReview,
  type VideoStudioPreferences,
  type VideoStudioView,
  type VideoUrlAcquireAnswer,
  type VideoUrlPreflight,
} from '../../shared/lib/videoStudio'

type PrivateAsset = { public: CreativeAsset; previewUrl: string; downloadUrl: string; expires: number; owner: number }
type AssetApproval = { asset: PrivateAsset; destination: string; preferences: string; expires: number; owner: number }
type UrlApproval = { preflight: VideoUrlPreflight; source: URL; expires: number; owner: number }
type McpTool = { name: string; description?: string; inputSchema?: { properties?: Record<string, unknown>; required?: string[] } }
type McpConnection = { session: string; tools: McpTool[] }

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
  return { 'title-card.svg': title, 'lower-third.svg': lowerThird, 'captions.ass': captions, 'soft-warm.cube': `${lut.join('\n')}\n`, 'README.md': `# OddBrain ${format} design kit\n\nLocally generated, reusable starting assets for Kdenlive. The SVG title card and lower third are editable source artwork; captions.ass contains one subtitle style; soft-warm.cube is a restrained 3D LUT. Kdenlive remains responsible for animation, transitions, effects, preview, undo, rendering, and export. Review colours, fonts, safe areas, contrast, caption timing, and the LUT on the actual footage before publishing.\n` }
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
}) {
  const fetchImpl = options.fetchImpl || fetch, runCommand = options.runCommand || runMediaCommand, now = options.now || clock, checkRemote = options.assertRemote || assertPublicHttps
  let preferences = { ...DEFAULT_VIDEO_STUDIO }
  try { preferences = readRecoverableJson(options.file, normalizeVideoStudio, DEFAULT_VIDEO_STUDIO).value } catch {}
  let lastVersion = '', lastConnection: McpConnection | null = null, lastNotice = ''
  const assets = new Map<string, PrivateAsset>(), approvals = new Map<string, AssetApproval>(), urls = new Map<string, UrlApproval>()
  const editorActions = new Map<string, { owner: number; action: KdenliveAction; tool: string; preferences: string; expires: number }>(), designKits = new Map<string, { owner: number; format: DesignKitFormat; destination: string; preferences: string; expires: number }>(), transfers = new Map<number, AbortController>()

  const prune = (): void => {
    const at = now()
    for (const [key, value] of assets) if (value.expires <= at) assets.delete(key)
    for (const [key, value] of approvals) if (value.expires <= at) approvals.delete(key)
    for (const [key, value] of urls) if (value.expires <= at) urls.delete(key)
    for (const [key, value] of editorActions) if (value.expires <= at) editorActions.delete(key)
    for (const [key, value] of designKits) if (value.expires <= at) designKits.delete(key)
  }
  const save = (patch: Partial<VideoStudioPreferences>): VideoStudioPreferences => {
    for (const key of ['kdenlive', 'projectFolder', 'ytDlp'] as const) if (patch[key] !== undefined && (typeof patch[key] !== 'string' || patch[key]!.length > 4096 || /[\u0000\r\n]/.test(patch[key]!))) throw Error('Video path setting is invalid. Nothing was saved.')
    if (patch.mcpUrl !== undefined && normalizeMcpUrl(patch.mcpUrl) !== String(patch.mcpUrl).trim()) throw Error('Kdenlive MCP must be credential-free loopback HTTP, such as http://127.0.0.1:8766/mcp. Nothing was saved.')
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

  const mcpRequest = async (method: string, params: unknown, session = '', notification = false): Promise<{ value: any; session: string }> => {
    const url = new URL(preferences.mcpUrl)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.protocol !== 'http:') throw Error('Kdenlive MCP must use loopback HTTP.')
    const key = options.keys()?.get(MCP_KEY) || ''
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }
    if (key) headers.Authorization = `Bearer ${key}`
    if (session) headers['Mcp-Session-Id'] = session
    const request = { jsonrpc: '2.0', ...(notification ? {} : { id: randomUUID() }), method, params }
    const response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(request), redirect: 'error', signal: AbortSignal.timeout(20_000) })
    const raw = await boundedResponse(response, 2_000_000, 'Kdenlive MCP response exceeded 2 MB.')
    if (!response.ok) throw Error(`Kdenlive MCP refused the request (HTTP ${response.status}).`)
    const value = parseMcp(raw), nextSession = response.headers.get('mcp-session-id') || session
    if (value?.error?.message) throw Error(`Kdenlive MCP: ${String(value.error.message).slice(0, 500)}`)
    return { value: value?.result, session: nextSession }
  }

  const connectMcp = async (): Promise<McpConnection> => {
    const initialized = await mcpRequest('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'OddBrain', version: '0.9.0' } })
    await mcpRequest('notifications/initialized', {}, initialized.session, true)
    const listed = await mcpRequest('tools/list', {}, initialized.session)
    const reported = Array.isArray(listed.value?.tools) ? listed.value.tools : []
    if (reported.length > 500) throw Error('Kdenlive MCP exposed more than 500 tools; the inventory was refused as unsafe.')
    const tools = reported.filter((item: any) => item && typeof item.name === 'string' && item.name.length <= 200 && !/[\u0000-\u001f]/.test(item.name)).map((item: any) => ({ name: item.name, description: text(item.description, 1000), inputSchema: item.inputSchema && typeof item.inputSchema === 'object' ? item.inputSchema : undefined }))
    lastConnection = { session: listed.session, tools }; return lastConnection
  }

  const view = async (): Promise<VideoStudioView> => {
    const keys = options.keys(), kdenliveReady = await regularFile(preferences.kdenlive), projectReady = await realFolder(preferences.projectFolder)
    return { preferences: { ...preferences }, kdenliveVersion: lastVersion, kdenliveReady, mcpConnected: !!lastConnection, mcpTools: (lastConnection?.tools || []).map(tool => tool.name), projectReady, hasMcpToken: !!keys?.has(MCP_KEY), hasPixabayKey: !!keys?.has(PIXABAY_KEY), keyEncryption: keys?.encryption || 'none', notice: lastNotice }
  }

  const testKdenlive = async (): Promise<VideoStudioView> => {
    lastNotice = ''
    if (!await regularFile(preferences.kdenlive)) { lastVersion = ''; lastConnection = null; lastNotice = 'Choose the Kdenlive executable first.'; return view() }
    const signal = new AbortController().signal
    try {
      const raw = await runCommand(preferences.kdenlive, ['--version'], signal, 15_000, 200_000)
      lastVersion = raw.toString('utf8').trim().replace(/\s+/g, ' ').slice(0, 300) || 'Kdenlive responded without a version label.'
    } catch (error) { lastVersion = ''; lastNotice = `Kdenlive could not be verified: ${(error as Error).message}`; return view() }
    try { const connected = await connectMcp(); lastNotice = `Kdenlive verified. MCP exposed ${connected.tools.length} tool${connected.tools.length === 1 ? '' : 's'}.` }
    catch (error) { lastConnection = null; lastNotice = `Kdenlive verified, but live MCP is unavailable: ${(error as Error).message}` }
    return view()
  }

  const rememberAsset = (owner: number, record: Omit<PrivateAsset, 'owner' | 'expires'>): CreativeAsset => {
    const token = randomUUID(), publicValue = { ...record.public, token }
    assets.set(token, { ...record, public: publicValue, owner, expires: now() + 15 * 60_000 }); return publicValue
  }

  const searchOpenverse = async (owner: number, query: string, kind: CreativeKind): Promise<CreativeAsset[]> => {
    const endpoint = kind === 'audio' ? 'audio' : 'images'
    if (kind === 'video') return []
    const data = await fetchFixedJson(fetchImpl, `https://api.openverse.org/v1/${endpoint}/?q=${encodeURIComponent(query)}&page_size=8&mature=false`, 'Openverse')
    return (Array.isArray(data?.results) ? data.results : []).flatMap((item: any) => {
      const id = text(item.id, 200), url = text(item.url, 4096), page = text(item.foreign_landing_url || item.detail_url, 4096), preview = text(item.thumbnail || item.url, 4096)
      if (!id || !url || !page || !preview) return []
      const licence = [text(item.license, 100).toUpperCase(), text(item.license_version, 50)].filter(Boolean).join(' ') || 'See source'
      const creator = text(item.creator, 300) || 'Unknown creator', title = text(item.title, 300) || `Openverse ${kind}`
      return [rememberAsset(owner, { previewUrl: preview, downloadUrl: url, public: publicAsset({ provider: 'openverse', providerId: id, kind, title, creator, sourcePage: page, licence, licenceUrl: text(item.license_url, 4096), attribution: `${title} — ${creator} — ${licence}`, width: finite(item.width), height: finite(item.height), duration: finite(item.duration), previewAvailable: true }, '') })]
    })
  }

  const searchWikimedia = async (owner: number, query: string, kind: CreativeKind): Promise<CreativeAsset[]> => {
    if (kind !== 'image') return []
    const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: `filetype:bitmap ${query}`, gsrnamespace: '6', gsrlimit: '8', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '480', format: 'json', origin: '*' })
    const data = await fetchFixedJson(fetchImpl, `https://commons.wikimedia.org/w/api.php?${params}`, 'Wikimedia Commons')
    return Object.values(data?.query?.pages || {}).flatMap((page: any) => {
      const info = page?.imageinfo?.[0], metadata = info?.extmetadata || {}, id = String(page?.pageid || ''), url = text(info?.url, 4096), preview = text(info?.thumburl || info?.url, 4096)
      if (!id || !url || !preview) return []
      const title = text(String(page?.title || '').replace(/^File:/, ''), 300) || 'Wikimedia image', creator = text(metadata.Artist?.value?.replace(/<[^>]+>/g, ' '), 300) || 'See file page', licence = text(metadata.LicenseShortName?.value, 200) || 'See file page', pageUrl = `https://commons.wikimedia.org/?curid=${encodeURIComponent(id)}`
      return [rememberAsset(owner, { previewUrl: preview, downloadUrl: url, public: publicAsset({ provider: 'wikimedia', providerId: id, kind: 'image', title, creator, sourcePage: pageUrl, licence, licenceUrl: text(metadata.LicenseUrl?.value, 4096), attribution: text(metadata.Credit?.value?.replace(/<[^>]+>/g, ' '), 500) || `${title} — ${creator} — ${licence}`, width: finite(info?.width), height: finite(info?.height), previewAvailable: true }, '') })]
    })
  }

  const searchPixabay = async (owner: number, query: string, kind: CreativeKind): Promise<CreativeAsset[]> => {
    const key = options.keys()?.get(PIXABAY_KEY) || ''; if (!key) throw Error('Pixabay is not configured; Openverse and Wikimedia were still searched.')
    const endpoint = kind === 'video' ? 'https://pixabay.com/api/videos/' : 'https://pixabay.com/api/'
    if (kind === 'audio') return []
    const params = new URLSearchParams({ key, q: query, safesearch: 'true', per_page: '8', ...(kind === 'image' ? { image_type: 'all' } : {}) })
    const data = await fetchFixedJson(fetchImpl, `${endpoint}?${params}`, 'Pixabay')
    return (Array.isArray(data?.hits) ? data.hits : []).flatMap((item: any) => {
      const id = String(item?.id || ''), page = text(item?.pageURL, 4096), creator = text(item?.user, 300) || 'Pixabay contributor'
      const download = kind === 'video' ? text(item?.videos?.medium?.url || item?.videos?.small?.url || item?.videos?.large?.url, 4096) : text(item?.largeImageURL || item?.webformatURL, 4096)
      const preview = kind === 'video' && item?.picture_id ? `https://i.vimeocdn.com/video/${encodeURIComponent(String(item.picture_id))}_640x360.jpg` : text(item?.previewURL || item?.webformatURL, 4096)
      if (!id || !page || !download || !preview) return []
      const title = text(item?.tags, 300) || `Pixabay ${kind}`
      return [rememberAsset(owner, { previewUrl: preview, downloadUrl: download, public: publicAsset({ provider: 'pixabay', providerId: id, kind, title, creator, sourcePage: page, licence: 'Pixabay Content License', licenceUrl: 'https://pixabay.com/service/license-summary/', attribution: `${title} — ${creator} via Pixabay`, width: finite(item?.imageWidth || item?.videos?.medium?.width), height: finite(item?.imageHeight || item?.videos?.medium?.height), duration: finite(item?.duration), previewAvailable: true }, '') })]
    })
  }

  const search = async (owner: number, queryInput: string, kind: CreativeKind): Promise<CreativeSearchAnswer> => {
    prune(); const query = text(queryInput, 160)
    if (!query || query.length < 2 || !['image', 'video', 'audio'].includes(kind)) return { ok: false, assets: [], problems: ['Enter at least two normal search characters.'], notice: 'Nothing was searched.' }
    const jobs = [searchOpenverse(owner, query, kind), searchWikimedia(owner, query, kind), searchPixabay(owner, query, kind)]
    const settled = await Promise.allSettled(jobs), found: CreativeAsset[] = [], problems: string[] = []
    for (const result of settled) result.status === 'fulfilled' ? found.push(...result.value) : problems.push((result.reason as Error).message)
    return { ok: found.length > 0 || problems.length < jobs.length, assets: found.slice(0, 24), problems: [...new Set(problems)], notice: found.length ? `${found.length} live result${found.length === 1 ? '' : 's'}. Nothing has been downloaded. ${[...new Set(found.map(item => providerNotice(item.provider)))].join(' ')}` : 'No matching licensed assets were returned. Nothing was downloaded.' }
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
    if (!asset || asset.owner !== owner) return { ok: false, token, error: 'That search result expired. Search again.' }
    try { return { ok: true, token, ...(await fetchImage(asset.previewUrl)) } } catch (error) { return { ok: false, token, error: (error as Error).message } }
  }

  const extensionFor = (asset: CreativeAsset, url: URL): string => {
    const ext = extname(url.pathname).toLowerCase()
    if (/^\.[a-z0-9]{2,5}$/.test(ext)) return ext
    return asset.kind === 'image' ? '.jpg' : asset.kind === 'video' ? '.mp4' : '.audio'
  }
  const assetDestination = (asset: CreativeAsset): string => join(preferences.projectFolder, 'OddBrain Assets', `${asset.provider}-${safePart(asset.providerId)}-${safePart(asset.title)}${extensionFor(asset, new URL(assets.get(asset.token)!.downloadUrl))}`)

  const prepareAsset = async (owner: number, token: string): Promise<AssetReview> => {
    prune(); const asset = assets.get(token)
    if (!asset || asset.owner !== owner) return { ok: false, error: 'That search result expired. Search again.' }
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
    if (expected && mediaType && mediaType !== 'application/octet-stream' && !mediaType.startsWith(`${expected}/`)) throw Error(`The selected ${expected} download returned ${mediaType}; it was refused before writing.`)
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

  const importAsset = async (path: string): Promise<boolean> => {
    const connection = lastConnection || await connectMcp()
    const tool = connection.tools.find(item => ['desktop_media_import', 'media_import', 'import_media', 'bin_import_clip'].includes(item.name))
    if (!tool) throw Error('Connected Kdenlive MCP exposes no supported media-import tool. The asset is downloaded but was not imported.')
    const properties = tool.inputSchema?.properties || {}
    const key = ['path', 'file', 'file_path', 'media_path'].find(name => Object.prototype.hasOwnProperty.call(properties, name)) || 'path'
    const called = await mcpRequest('tools/call', { name: tool.name, arguments: { [key]: path } }, connection.session)
    if (called.value?.isError) throw Error('Kdenlive MCP reported that media import failed.')
    return true
  }

  const decideAsset = async (owner: number, token: string, decision: 'allow' | 'deny', importIntoKdenlive: boolean): Promise<AssetInstallAnswer> => {
    prune(); const approval = approvals.get(token); approvals.delete(token)
    if (!approval || approval.owner !== owner) return { ok: false, answer: 'That asset approval expired. Nothing was downloaded.' }
    if (decision !== 'allow') return { ok: true, answer: 'Cancelled. Nothing was downloaded or imported.' }
    if (approval.preferences !== preferencesDigest(preferences)) return { ok: false, answer: 'Kdenlive or project settings changed after review. Review the asset again; nothing was downloaded.' }
    const controller = new AbortController(); transfers.get(owner)?.abort(); transfers.set(owner, controller); let downloadedPath = ''
    try {
      const result = await download(approval.asset.downloadUrl, approval.destination, controller.signal, 'OddBrain Assets', approval.asset.public.kind), receiptFolder = await safeProjectDirectory('OddBrain Assets', 'asset-receipts'); downloadedPath = result.path
      const receipt = join(receiptFolder, `${result.sha256}-${randomUUID().slice(0, 8)}.json`)
      await writeFile(receipt, `${JSON.stringify({ schema: 1, acquiredAt: new Date(now()).toISOString(), file: basename(result.path), bytes: result.bytes, sha256: result.sha256, requestedUrl: result.requestedUrl, resolvedUrl: result.resolvedUrl, asset: approval.asset.public }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      let imported = false, suffix = ''
      if (importIntoKdenlive) try { imported = await importAsset(result.path) } catch (error) { suffix = ` ${(error as Error).message}` }
      return { ok: true, path: result.path, imported, receipt, answer: `Downloaded the selected asset and saved its source/licence receipt.${imported ? ' Imported it into Kdenlive.' : suffix || ' It was not imported.'}` }
    } catch (error) { return { ok: false, answer: controller.signal.aborted ? 'Stopped. The incomplete transfer was removed.' : `${(error as Error).message}${downloadedPath ? ` The completed file remains at ${downloadedPath}, but its receipt/import did not finish.` : ''}` } }
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

  const receiptForSource = async (path: string, sourceUrl: string, provider: string, resolvedUrl = sourceUrl): Promise<string> => {
    const file = await open(path, 'r'); const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024); let bytes = 0
    try { for (;;) { const part = await file.read(buffer, 0, buffer.length, bytes); if (!part.bytesRead) break; hash.update(buffer.subarray(0, part.bytesRead)); bytes += part.bytesRead } } finally { await file.close() }
    const folder = await safeProjectDirectory('OddBrain Sources', 'source-receipts'); const sha256 = hash.digest('hex'), receipt = join(folder, `${sha256}-${randomUUID().slice(0, 8)}.json`)
    await writeFile(receipt, `${JSON.stringify({ schema: 1, acquiredAt: new Date(now()).toISOString(), sourceUrl, resolvedUrl, provider, file: basename(path), bytes, sha256 }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    return receipt
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
      const receipt = await receiptForSource(path, approval.source.toString(), approval.preflight.provider, resolvedUrl)
      let imported = false, suffix = ''
      if (importIntoKdenlive) try { imported = await importAsset(path) } catch (error) { suffix = ` ${(error as Error).message}` }
      return { ok: true, answer: `Downloaded the one approved source and saved its URL/hash receipt. It has not been interpreted as an instruction.${imported ? ' Imported it into Kdenlive without placing it on the timeline.' : suffix}`, path, sourceUrl: approval.source.toString(), receipt, imported }
    } catch (error) { return { ok: false, answer: controller.signal.aborted ? (path ? `Stop arrived after the source completed. The file remains at ${path}; receipt/import did not finish.` : 'Stopped. The incomplete source transfer was removed.') : `${(error as Error).message}${path ? ` The completed source remains at ${path}, but its receipt/import did not finish.` : ''}` } }
    finally { if (staging) await rm(staging, { recursive: true, force: true }).catch(() => undefined); if (transfers.get(owner) === controller) transfers.delete(owner) }
  }

  const prepareDesignKit = async (owner: number, format: DesignKitFormat): Promise<DesignKitReview> => {
    prune()
    if (!['vertical', 'landscape'].includes(format)) return { ok: false, error: 'Choose a vertical or landscape design kit.' }
    if (!await realFolder(preferences.projectFolder)) return { ok: false, error: 'Choose an existing Kdenlive project folder first.' }
    const token = randomUUID(), expires = now() + 5 * 60_000, folder = `oddbrain-${format}-kit-${randomUUID().slice(0, 8)}`, destination = join(preferences.projectFolder, 'OddBrain Assets', 'Design Kits', folder)
    designKits.set(token, { owner, format, destination, preferences: preferencesDigest(preferences), expires })
    return { ok: true, token, destination, files: [...Object.keys(localDesignFiles(format)), 'manifest.json'], consequence: 'Create one new local design-kit folder containing editable SVG title/lower-third artwork, an ASS caption style, a restrained 3D LUT, instructions, and a hash manifest. Nothing is downloaded and no existing file is replaced. Kdenlive must still animate and preview these assets.', expiresAt: expiresAt(expires) }
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
      let imported = false, suffix = ''
      if (importTitleIntoKdenlive) try { imported = await importAsset(join(folder, 'title-card.svg')) } catch (error) { suffix = ` ${(error as Error).message}` }
      return { ok: true, answer: `Created the reviewed local ${ticket.format} design kit with a hash manifest.${imported ? ' Imported its title card into Kdenlive without timeline placement.' : suffix}`, path: folder, imported, receipt }
    } catch (error) { if (folder) await rm(folder, { recursive: true, force: true }).catch(() => undefined); return { ok: false, answer: `The new design kit could not be completed and its new partial folder was removed: ${(error as Error).message}` } }
  }

  const actionTools: Record<KdenliveAction, string[]> = {
    undo: ['desktop_timeline_undo', 'timeline_undo', 'undo'],
    'save-version': ['desktop_project_checkpoint', 'project_checkpoint', 'checkpoint_save', 'save_version'],
  }
  const prepareKdenliveAction = async (owner: number, action: KdenliveAction): Promise<KdenliveToolReview> => {
    prune()
    try {
      const connection = lastConnection || await connectMcp(), tool = connection.tools.find(item => actionTools[action].includes(item.name))
      if (!tool) return { ok: false, error: `This Kdenlive MCP server does not expose a reviewed ${action === 'undo' ? 'Undo' : 'save-version'} tool. Use Kdenlive’s own control instead.` }
      if (tool.inputSchema?.required?.length) return { ok: false, error: `${tool.name} needs server-specific inputs. OddBrain will not guess them; use Kdenlive or reviewed AI chat.` }
      const token = randomUUID(), expires = now() + 2 * 60_000
      editorActions.set(token, { owner, action, tool: tool.name, preferences: preferencesDigest(preferences), expires })
      const description = tool.description ? ` Server description: ${tool.description}` : ' The server supplied no description.'
      return { ok: true, token, tool: tool.name, summary: (action === 'undo' ? `Ask the connected Kdenlive server to undo its latest editor change using ${tool.name}.` : `Ask the connected Kdenlive server to save a recoverable project version using ${tool.name}.`) + description, expiresAt: expiresAt(expires) }
    } catch (error) { return { ok: false, error: (error as Error).message } }
  }
  const decideKdenliveAction = async (owner: number, token: string, decision: 'allow' | 'deny'): Promise<{ ok: boolean; answer: string }> => {
    prune(); const ticket = editorActions.get(token); editorActions.delete(token)
    if (!ticket || ticket.owner !== owner) return { ok: false, answer: 'That Kdenlive action review expired. Nothing was changed.' }
    if (decision !== 'allow') return { ok: true, answer: 'Denied. Nothing was sent to Kdenlive.' }
    if (ticket.preferences !== preferencesDigest(preferences)) return { ok: false, answer: 'Kdenlive settings changed after review. Nothing was sent.' }
    try {
      const connection = lastConnection || await connectMcp()
      if (!connection.tools.some(item => item.name === ticket.tool)) throw Error('The reviewed tool is no longer exposed by this Kdenlive server.')
      const result = await mcpRequest('tools/call', { name: ticket.tool, arguments: {} }, connection.session)
      if (result.value?.isError) throw Error('Kdenlive MCP reported that the action failed.')
      return { ok: true, answer: ticket.action === 'undo' ? 'Kdenlive reported that the reviewed Undo completed.' : 'Kdenlive reported that the reviewed project-version save completed.' }
    } catch (error) { return { ok: false, answer: (error as Error).message } }
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
    search, preview, prepareAsset, decideAsset, preflightUrl, acquireUrl, prepareKdenliveAction, decideKdenliveAction, prepareDesignKit, decideDesignKit,
    stop: (owner: number): { ok: boolean; answer: string } => { const active = transfers.get(owner); if (!active) return { ok: true, answer: 'No video transfer is running.' }; active.abort(); return { ok: true, answer: 'Stop requested. The current transfer will report its final state.' } },
    forget: (owner: number): void => { transfers.get(owner)?.abort(); transfers.delete(owner); for (const [key, value] of assets) if (value.owner === owner) assets.delete(key); for (const [key, value] of approvals) if (value.owner === owner) approvals.delete(key); for (const [key, value] of urls) if (value.owner === owner) urls.delete(key); for (const [key, value] of editorActions) if (value.owner === owner) editorActions.delete(key); for (const [key, value] of designKits) if (value.owner === owner) designKits.delete(key) },
    setKdenlive: (path: string) => save({ kdenlive: path }), setProjectFolder: (path: string) => save({ projectFolder: path }), setYtDlp: (path: string) => save({ ytDlp: path }),
  }
}
