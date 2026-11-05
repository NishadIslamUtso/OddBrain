/**
 * Engine-notes proposal-only writer.
 *
 * This is the one place memory is drafted for the brain — and it NEVER
 * confirms anything. Every draft becomes a pending proposal in the Review
 * workspace with an exact quotation from a real observation; only the owner's
 * decision in the Review screen ever confirms it (the workspace re-checks the
 * quotation at approval time).
 *
 * The pipeline is the app's own, ported — never a second system:
 *   brain chats → immutable sources in 02 Sources/Conversations/App/… →
 *   discover() jobs → complete() batches (parseMemoryProposals validates
 *   kinds, subjects, dates, and quote ⊆ evidence) → Review → project()
 *   appends approved engine-notes lines to 06 Review/Memory/engine-notes.md.
 *
 * Two drafters, one law:
 *  - a deterministic quote pass (no model needed): proposes the owner's own
 *    words, unedited, for lines worth keeping;
 *  - an optional connected model (OpenAI-compatible endpoint configured via
 *    ODDBRAIN_MODEL_BASE_URL / _API_KEY / _NAME — e.g. the free Ollama Cloud
 *    allowance): drafts richer interpretations through the same parser.
 * Model output holds zero authority: garbage is blocked for explicit retry,
 * never auto-retried, and the evidence/quote checks run either way.
 */
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { createChatStore } from '../chats/store'
import { createVaultFiles } from '../vault/files'
import { createMemoryWorkspace } from '../memory/workspace'
import { ORGANIZER_SYSTEM } from '../../shared/lib/memoryWorkspace'
import { buildMemoryOrder } from '../../shared/lib/memory'

const sha = (value: string): string => createHash('sha256').update(value).digest('hex')

export type EngineNotesResult = {
  chats: number
  sources: number
  jobs: number
  queued: number
  drafted: number
  blocked: number
  pending: number
  model: string
  warnings: string[]
}

type ModelConfig = { base: string; key: string; name: string }

const readModelConfig = (): ModelConfig | null => {
  const base = (process.env.ODDBRAIN_MODEL_BASE_URL || '').trim()
  if (!base) return null
  return { base, key: (process.env.ODDBRAIN_MODEL_API_KEY || '').trim(), name: (process.env.ODDBRAIN_MODEL_NAME || 'connected model').trim() }
}

/** Brain chats become immutable observations in the app's own source layout. */
export function materializeChatSources(brainRoot: string): { chats: number; sources: number } {
  const files = createVaultFiles(brainRoot, () => new Date())
  const snapshot = createChatStore(join(brainRoot, 'chats')).read()
  let chats = 0, sources = 0
  for (const chat of snapshot.chats) {
    // A trashed chat is recoverable Trash, never a memory source.
    if (chat.lifecycle === 'trash') continue
    const messages = (chat.messages || []).filter(message => (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string' && message.content.trim())
    if (!messages.length) continue
    chats += 1
    const provider = chat.id.startsWith('goose-') ? 'goose' : 'oddbrain'
    const base = `02 Sources/Conversations/App/${sha(chat.id)}`
    if (!files.exists(`${base}/conversation.json`)) {
      files.writeOnce(`${base}/conversation.json`, JSON.stringify({ key: chat.id, title: chat.title || 'Conversation', provider, adapter: provider, original: '', url: '' }))
    }
    for (const message of messages) {
      const observation = { id: message.id, role: message.role, text: message.content, speaker: '', timestamp: typeof message.at === 'string' ? message.at : '' }
      const record = { message: observation, hash: sha(JSON.stringify(observation)), observed_at: typeof message.at === 'string' && message.at ? message.at : new Date().toISOString() }
      const body = JSON.stringify(record)
      // Revisions are immutable: an edited message is a NEW observation; the
      // original bytes stay exactly where they are.
      const existed = files.writeOnce(`${base}/revisions/${sha(message.id)}-${record.hash}.json`, body)
      files.writeOnce(`${base}/messages/${sha(message.id)}.json`, body)
      if (!existed) sources += 1
    }
  }
  return { chats, sources }
}

/**
 * Deterministic quote pass: the owner's own words, unedited. Each proposal's
 * text is a verbatim sentence from the observation, so the quotation check at
 * approval time can never disagree with the proposal.
 */
function quotePass(text: string): string {
  const signals = [
    /\bremember\b[,:]?\s*/gi,
    /\bnote\s+that\b/gi,
    /\bfrom\s+now\s+on\b/gi,
    /\bi\s+(?:prefer|hate|like|love|want|need|usually|always|never)\b/gi,
    /\b(?:don't|do\s+not)\s+(?:ask|tell|share|send|mention|use|put|ever)\b/gi,
    /\bnever\s+(?:use|show|send|tell|ask|delete|put|share)\b/gi,
    /\balways\s+(?:use|show|send|tell|ask|keep|start)\b/gi,
    /\bmy\s+(?:preference|birthday|deadline|timezone|address|plan)\b/gi,
    /\b(?:decision|deadline|launch|release|meeting|appointment|schedule)\b[^.?!]{0,80}\b(?:is|was|moved|at|on|to)\b/gi,
    /\bdecided\s+(?:to|that|on)\b/gi,
    /\bwe\s+(?:agreed|settled|chose)\b/gi,
    /\b(?:next\s+steps?|left\s+open|still\s+todo|work\s+left)\b/gi,
  ]
  const spans: Array<{ start: number; end: number }> = []
  for (const pattern of signals) {
    pattern.lastIndex = 0
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      if (spans.length >= 3) break
      // Expand to the sentence around the signal; the quote stays an exact slice.
      let start = match.index
      while (start > 0 && !/[.?!]\s|\n/.test(text.slice(start - 1, start + 1))) start -= 1
      let end = match.index + match[0].length
      while (end < text.length && !/[.?!]/.test(text[end])) end += 1
      if (end < text.length && /[.?!]/.test(text[end])) end += 1
      const quote = text.slice(start, end).trim()
      const sliceStart = text.indexOf(quote)
      if (!quote || quote.length < 15 || quote.length > 400 || sliceStart < 0) continue
      if (spans.some(span => span.start <= sliceStart && sliceStart < span.end)) continue
      spans.push({ start: sliceStart, end: sliceStart + quote.length })
    }
    if (spans.length >= 3) break
  }
  const proposals = spans.map(span => {
    const quote = text.slice(span.start, span.end)
    return {
      kind: 'note', subject: 'self',
      title: `Engine note · ${quote.slice(0, 70).trim()}${quote.length > 70 ? '…' : ''}`,
      text: quote, quote,
      date: '', uncertainty: 'Your own words, unedited. Drafted automatically without a model; confirm to keep this line.',
    }
  })
  return JSON.stringify({ proposals })
}

async function runModel(model: ModelConfig, order: string, text: string): Promise<string> {
  const response = await fetch(`${model.base.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(model.key ? { authorization: `Bearer ${model.key}` } : {}) },
    body: JSON.stringify({
      model: model.name,
      temperature: 0.2,
      messages: [
        { role: 'system', content: ORGANIZER_SYSTEM },
        { role: 'user', content: `${order}\n\nSource evidence (quote exactly from this):\n${text}` },
      ],
    }),
  })
  if (!response.ok) throw Error(`Model endpoint answered ${response.status}.`)
  const data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw Error('The model returned no proposals.')
  return content
}

/** Discover chats and draft proposals. Proposal-only: nothing is confirmed here. */
export async function draftEngineNotes(brainRoot: string): Promise<EngineNotesResult> {
  const materialized = materializeChatSources(brainRoot)
  const files = createVaultFiles(brainRoot, () => new Date())
  const store = createMemoryWorkspace(files)
  const before = store.discover()
  const model = readModelConfig()
  const result: EngineNotesResult = {
    chats: materialized.chats, sources: materialized.sources, jobs: before.jobs.length,
    queued: 0, drafted: 0, blocked: 0, pending: 0,
    model: model ? model.name : '', warnings: [],
  }
  const order = buildMemoryOrder('06 Review/Memory')
  for (const job of before.jobs.filter(job => job.state === 'queued')) {
    // The quote pass drafts the owner's own words only. Assistant messages
    // stay queued for a connected model (capsules) or for the owner to read.
    if (!model && job.source.role !== 'user') continue
    result.queued += 1
    try {
      const text = store.evidence(job.source)
      if (model) {
        // Connected model: richer drafts; the parser still holds every check.
        // Output that fails a check blocks the job for explicit retry — there
        // is no automatic retry loop.
        store.complete(job.id, await runModel(model, order, text), `${model.name} (connected model)`)
        result.drafted += 1
      } else {
        const raw = quotePass(text)
        const count = (JSON.parse(raw) as { proposals: unknown[] }).proposals.length
        if (count) {
          store.complete(job.id, raw, 'engine-notes quote pass (no model connected)')
          result.drafted += 1
        }
        // No memory-worthy line in this message: leave the job queued so a
        // connected model can still interpret it later.
      }
    } catch (error) {
      const message = (error as Error).message
      if (model) {
        store.fail(job.id, message)
        result.blocked += 1
      } else {
        result.warnings.push(`${job.id}: ${message}`)
      }
    }
  }
  result.pending = store.read().proposals.filter(proposal => proposal.state === 'pending').length
  return result
}
