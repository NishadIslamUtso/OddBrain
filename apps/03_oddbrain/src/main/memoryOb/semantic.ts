/**
 * Memory_OB semantic search — a separate optional module beside the exact
 * word-match search. It helps FIND candidates by meaning; it never verifies
 * them. Every quoted answer still passes the hash-verified evidence tool, and
 * word-match search, authority labels and "not found over guessing" are
 * unchanged.
 *
 * Meaning comes from a connected embeddings endpoint (any OpenAI-compatible
 * `/embeddings` service — for example the owner's free Ollama Cloud allowance
 * if it offers embeddings). No local model is downloaded. Without a connected
 * endpoint the module says so plainly and nothing pretends to work.
 *
 * The vector index under `<brain>/store/semantic/` is a REBUILDABLE
 * DERIVATIVE — never the only copy of anything. Deleting it loses nothing.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createChatStore } from '../chats/store'
import { createMemoryObStore } from './store'

const sha = (value: string): string => createHash('sha256').update(value).digest('hex')

export type SemanticConfig = {
  enabled: boolean
  base: string
  key: string
  model: string
}

export type SemanticCandidate = { id: string; title: string; score: number; text: string; sha256: string }

export type SemanticStatus = {
  enabled: boolean
  connected: boolean
  model: string
  indexed: number
  updatedAt: string
  notice: string
}

const INDEX_FORMAT = 'memory-ob-semantic-v1'
const MAX_EMBED_CHARS = 8_000

type IndexEntry = { id: string; sha256: string; vector: number[] }
type IndexFile = { format: string; model: string; dims: number; updatedAt: string; entries: IndexEntry[] }

export function createSemantic(storeRoot: string, options: { store?: ReturnType<typeof import('./store').createMemoryObStore>, chatsRoot?: string } = {}) {
  // storeRoot is the Memory_OB store folder itself (…/store in a brain, or the
  // catalogue folder the adapter is pointed at). Everything semantic lives
  // inside it as a rebuildable derivative.
  const dir = join(storeRoot, 'semantic')
  const configFile = join(dir, 'config.json')
  const indexFile = join(dir, 'index.json')

  const config = (): SemanticConfig => {
    let enabled = false
    try { enabled = (JSON.parse(readFileSync(configFile, 'utf8')) as { enabled?: boolean }).enabled === true } catch { /* not enabled */ }
    return {
      enabled,
      base: (process.env.ODDBRAIN_MODEL_BASE_URL || '').trim().replace(/\/+$/, ''),
      key: (process.env.ODDBRAIN_MODEL_API_KEY || '').trim(),
      model: (process.env.ODDBRAIN_EMBED_MODEL || process.env.ODDBRAIN_MODEL_NAME || '').trim(),
    }
  }

  const readIndex = (): IndexFile | null => {
    try {
      const parsed = JSON.parse(readFileSync(indexFile, 'utf8')) as IndexFile
      return parsed && parsed.format === INDEX_FORMAT && Array.isArray(parsed.entries) ? parsed : null
    } catch { return null }
  }

  const store = options.store || createMemoryObStore(storeRoot)
  const memoryStore = (): typeof store => store
  // The brain keeps chat history beside the catalogue (brain/chats); hydrate
  // the store's chat view before any indexing or search.
  const chatsRoot = options.chatsRoot || join(storeRoot, 'chats')
  const hydrate = (): void => {
    try { store.syncChats(createChatStore(chatsRoot).read().chats) } catch { /* empty or missing chat store: index what the catalogue holds */ }
  }

  const embed = async (texts: string[], settings: SemanticConfig): Promise<number[][]> => {
    if (!settings.base || !settings.model) throw Error('Meaning search is not connected. Set ODDBRAIN_MODEL_BASE_URL and ODDBRAIN_EMBED_MODEL (for example to a free embeddings endpoint), then run rebuild.')
    const vectors: number[][] = []
    for (let start = 0; start < texts.length; start += 16) {
      const batch = texts.slice(start, start + 16).map(text => text.slice(0, MAX_EMBED_CHARS))
      const response = await fetch(`${settings.base}/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(settings.key ? { authorization: `Bearer ${settings.key}` } : {}) },
        body: JSON.stringify({ model: settings.model, input: batch }),
      })
      if (!response.ok) throw Error(`The embeddings endpoint answered ${response.status}. Nothing was indexed.`)
      const data = await response.json() as { data?: Array<{ embedding?: unknown }> }
      if (!Array.isArray(data.data) || data.data.length !== batch.length) throw Error('The embeddings endpoint returned an unexpected shape. Nothing was indexed.')
      for (const row of data.data) {
        const vector = row.embedding
        if (!Array.isArray(vector) || !vector.length || vector.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw Error('The embeddings endpoint returned an invalid vector. Nothing was indexed.')
        vectors.push(vector as number[])
      }
    }
    return vectors
  }

  const cosine = (a: number[], b: number[]): number => {
    let dot = 0, na = 0, nb = 0
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
    return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
  }

  const setEnabled = (enabled: boolean): void => {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    writeFileSync(configFile, JSON.stringify({ enabled }, null, 2) + '\n', { mode: 0o600 })
  }

  const status = (): SemanticStatus => {
    const settings = config(), index = readIndex()
    const connected = Boolean(settings.base && settings.model)
    return {
      enabled: settings.enabled,
      connected,
      model: settings.model,
      indexed: index ? index.entries.length : 0,
      updatedAt: index ? index.updatedAt : '',
      notice: !settings.enabled
        ? 'Meaning search is off. Enable it with: node semantic-search.mjs --enable'
        : !connected
          ? 'Meaning search is on but not connected. Set ODDBRAIN_MODEL_BASE_URL and ODDBRAIN_EMBED_MODEL to a free embeddings endpoint, then run: node semantic-search.mjs rebuild'
          : !index || !index.entries.length
            ? 'Meaning search is connected but nothing is indexed yet. Run: node semantic-search.mjs rebuild'
            : `Meaning search is active over ${index.entries.length} items (model: ${index.model}). Candidates are unverified; confirm exact wording with memory_ob_evidence.`,
    }
  }

  /** Rebuild the derivative index from the catalogue's own texts. */
  const rebuild = async (): Promise<{ indexed: number; model: string }> => {
    const settings = config()
    hydrate()
    const entries = memoryStore().indexables().filter(item => item.text.trim())
    const vectors = await embed(entries.map(item => item.text), settings)
    const index: IndexFile = {
      format: INDEX_FORMAT, model: settings.model, dims: vectors[0]?.length || 0,
      updatedAt: new Date().toISOString(),
      entries: entries.map((item, i) => ({ id: item.id, sha256: sha(item.text), vector: vectors[i] })),
    }
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    writeFileSync(indexFile, JSON.stringify(index), { mode: 0o600 })
    return { indexed: index.entries.length, model: settings.model }
  }

  /** Meaning candidates only — the caller keeps labels, hazards and evidence law. */
  const search = async (query: string, limit = 5): Promise<SemanticCandidate[]> => {
    const settings = config(), index = readIndex()
    if (!settings.enabled) return []
    if (!index || !index.entries.length) return []
    const [vector] = await embed([query], settings)
    hydrate()
    const texts = new Map(memoryStore().indexables().map(item => [item.id, item]))
    return index.entries
      .map(entry => ({ entry, score: cosine(vector, entry.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(20, limit)))
      .map(({ entry, score }) => {
        const item = texts.get(entry.id)
        return { id: entry.id, title: item?.title || entry.id, score, text: item?.text || '', sha256: entry.sha256 }
      })
      .filter(candidate => candidate.text && sha(candidate.text) === candidate.sha256)
  }

  return { config, status, setEnabled, rebuild, search, readIndex, indexPath: indexFile, configPath: configFile }
}

export type Semantic = ReturnType<typeof createSemantic>
