/**
 * Store phase 2 — Claude Code's own plugin marketplaces as a labelled source.
 *
 * The rules (design, his go recorded 2026-10-17):
 * 1. The engine installs its own things — the app builds the EXACT claude
 *    CLI lines for a card and runs them through the engine's own binary.
 *    Plugin folders are never assembled by hand.
 * 2. Browse reads, install asks — reading an index is one capped GET, done
 *    only when the person adds or refreshes a source (list() never fetches).
 * 3. One page, labelled sources — every view carries its `source` label.
 * 4. No auto-sync, no auto-update — sources change only by explicit press.
 *
 * Pure-ish module: injected fetch/spawn/store path, so the tests drive it.
 */
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const MARKETPLACE_FETCH_BYTES = 2 * 1024 * 1024
export const MARKETPLACE_FETCH_MS = 8_000

export type MarketplacePlugin = {
  name: string
  author?: string
  description?: string
  source?: string
}

export type MarketplaceSource = {
  /** `owner/repo` — the same slug the claude CLI takes. */
  id: string
  url: string
  /** The marketplace's own name from its index (or the slug before first fetch). */
  marketplace: string
  owner: string
  addedAt: string
  fetchedAt: string | null
  plugins: MarketplacePlugin[]
  /** The last explicit refresh failure, kept honestly until one succeeds. */
  problem?: string
  source: 'Claude Code marketplace'
}

export type CommandLine = {
  label: string
  args: string[]
  /** The exact line a card shows before it is ever run. */
  line: string
}

export type FetchLike = (url: string) => Promise<{ ok: boolean; status?: number; body?: unknown }>
export type SpawnLike = (command: string, args: string[]) => { on(event: 'error' | 'close', listener: (...args: never[]) => void): unknown; stdout?: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown } | null; stderr?: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown } | null }

const SLUG = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** owner/repo (or a github.com URL of one) → the CLI's slug. Honest refusals otherwise. */
export function parseRepo(input: string): { ok: true; slug: string } | { ok: false; reason: string } {
  const text = input.trim()
  if (!text) return { ok: false, reason: 'Type a GitHub repository as owner/repo.' }
  let slug = text
  const url = /^https?:\/\/([^/]+)\/(.+)$/.exec(text)
  if (url) {
    const host = url[1].toLowerCase()
    if (host !== 'github.com' && host !== 'www.github.com') {
      return { ok: false, reason: `${url[1]} is not github.com — Claude Code marketplaces come from GitHub repositories, so nothing was fetched.` }
    }
    slug = url[2]
  }
  slug = slug.replace(/\.git$/, '').replace(/\/+$/, '').replace(/^\/+/, '')
  const segments = slug.split('/').filter(Boolean)
  if (segments.length !== 2) {
    return { ok: false, reason: `"${input.trim()}" is not a single owner/repo pair. Nothing was fetched.` }
  }
  slug = `${segments[0]}/${segments[1]}`
  if (!SLUG.test(slug)) {
    return { ok: false, reason: `"${slug}" has characters the CLI slug cannot carry. Nothing was fetched.` }
  }
  return { ok: true, slug }
}

async function readIndex(url: string, fetchImpl: FetchLike): Promise<
  { ok: true; raw: string } | { ok: false; reason: string }
> {
  let reply: Awaited<ReturnType<FetchLike>>
  try {
    reply = await fetchImpl(url)
  } catch (failure) {
    return { ok: false, reason: `${url} could not be reached (${(failure as Error).message}). Nothing was saved.` }
  }
  if (!reply.ok) {
    return { ok: false, reason: `${url} answered ${reply.status ?? 'with an error'}. Nothing was saved.` }
  }
  const body = reply.body
  if (typeof body !== 'string') {
    return { ok: false, reason: `${url} sent no readable body. Nothing was saved.` }
  }
  if (body.length > MARKETPLACE_FETCH_BYTES) {
    return { ok: false, reason: `${url} answered more than ${Math.floor(MARKETPLACE_FETCH_BYTES / (1024 * 1024))} MB. Nothing was saved.` }
  }
  return { ok: true, raw: body }
}

type IndexJson = {
  name?: unknown
  owner?: { name?: unknown; url?: unknown } | unknown
  plugins?: unknown
}

/** Parse `.claude-plugin/marketplace.json` honestly: only real fields become cards. */
export function parseMarketplaceIndex(raw: string): { ok: true; name: string; ownerName?: string; plugins: MarketplacePlugin[] } | { ok: false; reason: string } {
  let parsed: IndexJson
  try {
    parsed = JSON.parse(raw) as IndexJson
  } catch {
    return { ok: false, reason: 'the marketplace file is not valid JSON — the repository may be misconfigured.' }
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.plugins)) {
    return { ok: false, reason: 'the marketplace file has no "plugins" list — there is nothing to show.' }
  }
  const plugins: MarketplacePlugin[] = []
  for (const entry of parsed.plugins) {
    if (!entry || typeof entry !== 'object') continue
    const candidate = entry as Record<string, unknown>
    if (typeof candidate.name !== 'string' || !candidate.name.trim()) continue
    const plugin: MarketplacePlugin = { name: candidate.name.trim() }
    if (typeof candidate.description === 'string' && candidate.description.trim()) plugin.description = candidate.description.trim().slice(0, 400)
    const author = typeof candidate.author === 'string' ? candidate.author
      : candidate.author && typeof candidate.author === 'object' && typeof (candidate.author as { name?: unknown }).name === 'string'
        ? (candidate.author as { name: string }).name
        : undefined
    if (author && author.trim()) plugin.author = author.trim().slice(0, 120)
    if (typeof candidate.source === 'string') plugin.source = candidate.source.slice(0, 300)
    plugins.push(plugin)
  }
  if (!plugins.length) return { ok: false, reason: 'the marketplace file lists zero named plugins — there is nothing to show.' }
  const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim().slice(0, 120) : ''
  const ownerName = parsed.owner && typeof parsed.owner === 'object' && typeof (parsed.owner as { name?: unknown }).name === 'string'
    ? (parsed.owner as { name: string }).name.trim().slice(0, 120)
    : undefined
  return { ok: true, name, ownerName, plugins }
}

/** The carded lines, built in main from validated pieces — never from renderer text. */
export function marketplaceCommands(slug: string, marketplaceName: string, plugin?: string): { ok: true; lines: CommandLine[] } | { ok: false; reason: string } {
  if (!SLUG.test(slug)) return { ok: false, reason: 'that source is not an owner/repo slug — no command was built.' }
  const lines: CommandLine[] = [
    { label: 'Register this marketplace with Claude Code', args: ['plugin', 'marketplace', 'add', slug], line: `claude plugin marketplace add ${slug}` },
  ]
  if (plugin !== undefined) {
    if (!SAFE_NAME.test(plugin)) {
      return { ok: false, reason: `"${plugin}" cannot go on a command line — install it by hand from Claude Code's own prompt.` }
    }
    if (!marketplaceName || !SAFE_NAME.test(marketplaceName)) {
      return { ok: false, reason: `the marketplace's own name (${marketplaceName || 'unknown'}) is not command-safe — run the install from Claude Code's own prompt.` }
    }
    lines.push({
      label: `Install ${plugin}`,
      args: ['plugin', 'install', `${plugin}@${marketplaceName}`],
      line: `claude plugin install ${plugin}@${marketplaceName}`,
    })
  }
  return { ok: true, lines }
}

export function createMarketplaceStore(options: {
  /** Directory that holds `marketplaces.json`. */
  root: string
  fetchImpl?: FetchLike
  spawnImpl?: SpawnLike
  resolveClaude?: () => string
  now?: () => Date
} = {
  root: '',
}) {
  const fetchImpl: FetchLike = options.fetchImpl ?? (async (url) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), MARKETPLACE_FETCH_MS)
    try {
      const reply = await fetch(url, { redirect: 'follow', signal: controller.signal })
      const declared = Number(reply.headers.get('content-length') ?? '0')
      if (declared > MARKETPLACE_FETCH_BYTES) return { ok: false, status: reply.status, body: undefined }
      return { ok: reply.ok, status: reply.status, body: await reply.text() }
    } finally {
      clearTimeout(timer)
    }
  })
  const spawnImpl: SpawnLike = options.spawnImpl ?? ((command: string, args: string[]) =>
    spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] }) as unknown as ReturnType<SpawnLike>)
  const now = options.now ?? (() => new Date())
  const file = join(options.root, 'marketplaces.json')

  async function load(): Promise<MarketplaceSource[]> {
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown
      if (Array.isArray(parsed)) return parsed as MarketplaceSource[]
      return []
    } catch {
      return []
    }
  }

  async function save(sources: MarketplaceSource[]): Promise<void> {
    await mkdir(options.root, { recursive: true })
    await writeFile(file, JSON.stringify(sources, null, 2))
  }

  const indexUrl = (slug: string): string => `https://raw.githubusercontent.com/${slug}/HEAD/.claude-plugin/marketplace.json`

  type ParsedIndex = Extract<ReturnType<typeof parseMarketplaceIndex>, { ok: true }>
  async function pull(slug: string): Promise<{ ok: true; parsed: ParsedIndex } | { ok: false; reason: string }> {
    const read = await readIndex(indexUrl(slug), fetchImpl)
    if (!read.ok) return { ok: false, reason: read.reason }
    const parsed = parseMarketplaceIndex(read.raw)
    if (!parsed.ok) return { ok: false, reason: `${slug}: ${parsed.reason}` }
    return { ok: true, parsed }
  }

  return {
    /** Local only — a list call NEVER fetches. Explicit refresh is the only read. */
    async list(): Promise<MarketplaceSource[]> {
      return load()
    },

    async add(input: string): Promise<{ ok: boolean; answer: string; source?: MarketplaceSource }> {
      const slug = parseRepo(input)
      if (!slug.ok) return { ok: false, answer: slug.reason }
      const sources = await load()
      if (sources.some(source => source.id === slug.slug)) {
        return { ok: false, answer: `${slug.slug} is already a source. Press Refresh on it to re-read its index.` }
      }
      const pulled = await pull(slug.slug)
      if (!pulled.ok) return { ok: false, answer: pulled.reason }
      const source: MarketplaceSource = {
        id: slug.slug,
        url: `https://github.com/${slug.slug}`,
        marketplace: pulled.parsed.name || slug.slug.split('/')[1],
        owner: slug.slug.split('/')[0],
        addedAt: now().toISOString(),
        fetchedAt: now().toISOString(),
        plugins: pulled.parsed.plugins,
        source: 'Claude Code marketplace',
      }
      sources.push(source)
      await save(sources)
      return {
        ok: true,
        answer: `Source added: ${source.marketplace} (${slug.slug}), ${source.plugins.length} plugin${source.plugins.length === 1 ? '' : 's'} read from its index. Nothing was installed — installing is always its own card.`,
        source,
      }
    },

    async refresh(id: string): Promise<{ ok: boolean; answer: string; source?: MarketplaceSource }> {
      const slug = parseRepo(id)
      if (!slug.ok) return { ok: false, answer: slug.reason }
      const sources = await load()
      const at = sources.findIndex(source => source.id === slug.slug)
      if (at < 0) return { ok: false, answer: `${slug.slug} is not a source here — add it first.` }
      const pulled = await pull(slug.slug)
      if (!pulled.ok) {
        sources[at] = { ...sources[at], problem: pulled.reason }
        await save(sources)
        return { ok: false, answer: pulled.reason }
      }
      sources[at] = {
        ...sources[at],
        marketplace: pulled.parsed.name || sources[at].marketplace,
        fetchedAt: now().toISOString(),
        plugins: pulled.parsed.plugins,
      }
      delete sources[at].problem
      await save(sources)
      return {
        ok: true,
        answer: `${sources[at].marketplace} re-read: ${sources[at].plugins.length} plugin${sources[at].plugins.length === 1 ? '' : 's'} from its index.`,
        source: sources[at],
      }
    },

    async remove(id: string): Promise<{ ok: boolean; answer: string }> {
      const sources = await load()
      const next = sources.filter(source => source.id !== id)
      if (next.length === sources.length) return { ok: false, answer: `${id} was not a source here.` }
      await save(next)
      return { ok: true, answer: `${id} removed from the store's sources. Anything already installed in Claude Code stays where the engine put it — this button never uninstalls.` }
    },

    /** Exact carded lines for one source (optionally one plugin). */
    commands(id: string, plugin?: string): Promise<{ ok: boolean; answer?: string; lines: CommandLine[] }> {
      const slug = parseRepo(id)
      if (!slug.ok) return Promise.resolve({ ok: false, answer: slug.reason, lines: [] })
      return load().then(sources => {
        const source = sources.find(item => item.id === slug.slug)
        if (!source) return { ok: false, answer: `${slug.slug} is not a source here.`, lines: [] }
        const built = marketplaceCommands(slug.slug, source.marketplace, plugin)
        if (!built.ok) return { ok: false, answer: built.reason, lines: [] }
        return { ok: true, lines: built.lines }
      })
    },

    /**
     * Run one carded line through the engine's own binary. The renderer sends
     * WHICH source/plugin; main rebuilds the arguments from the saved source —
     * no text from the window ever reaches a command line.
     */
    async run(input: { id: string; plugin?: string; line: number }): Promise<{ ok: boolean; answer: string }> {
      const slug = parseRepo(input.id)
      if (!slug.ok) return { ok: false, answer: slug.reason }
      const sources = await load()
      const source = sources.find(item => item.id === slug.slug)
      if (!source) return { ok: false, answer: `${slug.slug} is not a source here.` }
      const built = marketplaceCommands(slug.slug, source.marketplace, input.plugin)
      if (!built.ok) return { ok: false, answer: built.reason }
      const chosen = built.lines[input.line]
      if (!chosen) return { ok: false, answer: 'that command does not exist for this card — nothing was run.' }
      const claude = options.resolveClaude ? options.resolveClaude() : 'claude'
      return new Promise(resolve => {
        let child: ReturnType<SpawnLike>
        try {
          child = spawnImpl(claude, chosen.args)
        } catch (failure) {
          resolve({ ok: false, answer: `${chosen.line} could not start: ${(failure as Error).message}. Nothing ran.` })
          return
        }
        let out = ''
        const take = (chunk: Buffer | string): void => { if (out.length < 4_000) out += String(chunk) }
        child.stdout?.on('data', take)
        child.stderr?.on('data', take)
        child.on('error', ((failure: Error) => {
          resolve({ ok: false, answer: `${chosen.line} could not start: ${failure.message}. Nothing ran.` })
        }) as never)
        child.on('close', ((code: number | null) => {
          const tail = out.trim().split(/\r?\n/).slice(-6).join(' ').slice(0, 600)
          if (code === 0) {
            resolve({ ok: true, answer: `${chosen.line} — Claude Code answered ok.${tail ? ` It said: ${tail}` : ''}` })
          } else {
            resolve({ ok: false, answer: `${chosen.line} — exited (${code ?? 'killed'}).${tail ? ` It said: ${tail}` : ' No output.'} Nothing else was changed by this app.` })
          }
        }) as never)
      })
    },

    /**
     * Phase 3's honest standing: ask the installed agy for its own help and
     * report what it actually offers. No catalog is ever invented.
     */
    async agyState(): Promise<{ ok: boolean; answer: string; hasCatalog: boolean }> {
      const spawn = options.spawnImpl
      if (!spawn) return { ok: false, answer: 'agy could not be asked from this window.', hasCatalog: false }
      return new Promise(resolve => {
        let child: ReturnType<SpawnLike>
        try {
          child = spawn('agy', ['--help'])
        } catch (failure) {
          resolve({ ok: false, answer: `agy did not start: ${(failure as Error).message}.`, hasCatalog: false })
          return
        }
        let out = ''
        const take = (chunk: Buffer | string): void => { if (out.length < 20_000) out += String(chunk) }
        child.stdout?.on('data', take)
        child.stderr?.on('data', take)
        child.on('error', ((failure: Error) => {
          resolve({ ok: false, answer: `agy did not start: ${failure.message}.`, hasCatalog: false })
        }) as never)
        child.on('close', ((code: number | null) => {
          if (code !== 0 && !out.trim()) {
            resolve({ ok: false, answer: `agy --help exited (${code ?? 'killed'}) with no output. The catalog stays closed until the CLI itself offers one.`, hasCatalog: false })
            return
          }
          const text = out
          const words = [...text.matchAll(/\b(extension|catalog|marketplace|store|plugin)\w*\b/gi)].map(m => m[0])
          const unique = [...new Set(words.map(word => word.toLowerCase()))]
          if (unique.length) {
            resolve({
              ok: true,
              answer: `agy's own help mentions: ${unique.join(', ')}. The store keeps phase 3 closed until the command surface is proven on a real signed-in run — nothing is offered from a help page alone.`,
              hasCatalog: false,
            })
          } else {
            resolve({
              ok: true,
              answer: `The installed agy's help lists no extension or catalog command. Phase 3 stays closed — the app will not invent a catalog the CLI does not offer.`,
              hasCatalog: false,
            })
          }
        }) as never)
      })
    },
  }
}
