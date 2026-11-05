import type { OllamaMessage } from '../types'

export type ContextCapacitySource = 'reported' | 'observed' | 'owner' | 'unknown'
export type ModelContextOverride = {
  mode: 'auto' | 'manual'
  /** Manual input capacity. Absent in Auto mode. */
  limitTokens?: number
  /** Space the owner wants left for the answer. */
  outputReserveTokens?: number
  /** Learned only from an explicit provider context-limit rejection. */
  observedTokens?: number
}
export type ModelContextOverrides = Record<string, ModelContextOverride>
export type ResolvedModelContext = {
  key: string
  label: string
  mode: 'auto' | 'manual'
  capacityTokens: number | null
  outputReserveTokens: number
  source: ContextCapacitySource
}

export type PackedContextMessage = { id: string; message: OllamaMessage; required?: boolean }
export type PackedModelContext = {
  messages: PackedContextMessage[]
  omitted: Array<{ id: string; reason: 'model-context-budget' | 'provider-overflow' }>
  estimatedInputTokens: number
}

export type ModelContextReceipt = {
  model: string
  capacity: { source: ContextCapacitySource; tokens: number | null; mode: 'auto' | 'manual' }
  estimate: { inputTokens: number; exact: false; method: string }
  includedMessages: number
  omitted: Array<{ id: string; reason: 'model-context-budget' | 'provider-overflow' }>
  attempts: number
  overflowRetry: boolean
  workingNotes?: 'included-draft' | 'omitted-draft' | 'none'
  note: string
}

const MIN_CAPACITY = 256
const MAX_CAPACITY = 10_000_000
const DEFAULT_OUTPUT_RESERVE = 1024

const integer = (value: unknown, min: number, max: number): number | undefined => {
  const result = Number(value)
  return Number.isSafeInteger(result) && result >= min && result <= max ? result : undefined
}

export function modelContextKey(route: string, model: string): string {
  const cleanRoute = String(route || 'unknown').trim().slice(0, 200)
  const cleanModel = String(model || 'provider default').trim().slice(0, 300)
  return JSON.stringify([cleanRoute, cleanModel])
}

/** Damaged rows are ignored individually; valid owner choices remain available. */
export function normalizeModelContextOverrides(value: unknown): ModelContextOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: ModelContextOverrides = Object.create(null)
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key || key.length > 1_000 || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const row = raw as Record<string, unknown>
    const mode = row.mode === 'manual' ? 'manual' : 'auto'
    const limitTokens = integer(row.limitTokens, MIN_CAPACITY, MAX_CAPACITY)
    const outputReserveTokens = integer(row.outputReserveTokens, 64, MAX_CAPACITY)
    const observedTokens = integer(row.observedTokens, MIN_CAPACITY, MAX_CAPACITY)
    if (mode === 'manual' && limitTokens === undefined) continue
    result[key] = {
      mode,
      ...(limitTokens !== undefined && mode === 'manual' ? { limitTokens } : {}),
      ...(outputReserveTokens !== undefined ? { outputReserveTokens } : {}),
      ...(observedTokens !== undefined ? { observedTokens } : {}),
    }
  }
  return result
}

/** Unknown + Auto deliberately has no guessed cap. */
export function resolveModelContext(input: {
  key: string
  label: string
  reportedTokens?: number | null
  override?: ModelContextOverride
}): ResolvedModelContext {
  const override = normalizeModelContextOverrides({ [input.key]: input.override })[input.key]
  const reserve = override?.outputReserveTokens ?? DEFAULT_OUTPUT_RESERVE
  if (override?.mode === 'manual') return { key: input.key, label: input.label, mode: 'manual', capacityTokens: override.limitTokens!, outputReserveTokens: reserve, source: 'owner' }
  const reported = integer(input.reportedTokens, MIN_CAPACITY, MAX_CAPACITY)
  if (reported !== undefined) return { key: input.key, label: input.label, mode: 'auto', capacityTokens: reported, outputReserveTokens: reserve, source: 'reported' }
  if (override?.observedTokens !== undefined) return { key: input.key, label: input.label, mode: 'auto', capacityTokens: override.observedTokens, outputReserveTokens: reserve, source: 'observed' }
  return { key: input.key, label: input.label, mode: 'auto', capacityTokens: null, outputReserveTokens: reserve, source: 'unknown' }
}

/** Conservative, inspectable estimate; not presented as provider tokenization. */
export function estimateModelTokens(text: string): number {
  return Math.max(1, Math.ceil(new TextEncoder().encode(text).length / 3))
}

const messageTokens = (message: OllamaMessage): number => estimateModelTokens(message.content) + (message.images?.length || 0) * 256 + 4

/** Keep mandatory envelopes and the newest complete conversation groups. */
export function packModelContext(items: PackedContextMessage[], profile: ResolvedModelContext, reason: 'model-context-budget' | 'provider-overflow' = 'model-context-budget'): PackedModelContext {
  const available = profile.capacityTokens === null ? null : Math.max(0, profile.capacityTokens - profile.outputReserveTokens)
  if (available === null) return { messages: items, omitted: [], estimatedInputTokens: items.reduce((sum, item) => sum + messageTokens(item.message), 0) }
  const required = items.filter(item => item.required)
  const optional = items.filter(item => !item.required)
  const requiredTokens = required.reduce((sum, item) => sum + messageTokens(item.message), 0)
  if (requiredTokens > available) throw Error(`Essential request context is estimated at ${requiredTokens.toLocaleString()} tokens, above this model profile’s ${available.toLocaleString()}-token input allowance. Nothing essential was clipped.`)
  let used = requiredTokens
  const kept = new Set(required.map(item => item.id))
  // Walk backward in user-led groups so the retained history never begins with
  // an orphan assistant answer.
  const groups: PackedContextMessage[][] = []
  let group: PackedContextMessage[] = []
  for (const item of optional) {
    if (item.message.role === 'user' && group.length) { groups.push(group); group = [] }
    group.push(item)
  }
  if (group.length) groups.push(group)
  for (const candidate of groups.reverse()) {
    const tokens = candidate.reduce((sum, item) => sum + messageTokens(item.message), 0)
    if (used + tokens <= available) { candidate.forEach(item => kept.add(item.id)); used += tokens }
  }
  const messages = items.filter(item => kept.has(item.id))
  const omitted = items.filter(item => !kept.has(item.id)).map(item => ({ id: item.id, reason }))
  return { messages, omitted, estimatedInputTokens: messages.reduce((sum, item) => sum + messageTokens(item.message), 0) }
}

/** Only definite context-window errors qualify for automatic repacking. */
export function parseContextOverflow(error: unknown): { overflow: boolean; limitTokens: number | null } {
  const message = error instanceof Error ? error.message : String(error || '')
  const overflow = /(?:context (?:length|window|size)|prompt (?:is )?too (?:long|large)|too many (?:input )?tokens|input.{0,30}(?:exceeds|longer than).{0,30}(?:context|token))/i.test(message)
  if (!overflow) return { overflow: false, limitTokens: null }
  const candidates = [...message.matchAll(/(?:maximum|max(?:imum)?|limit|supports?|context(?: window)?(?: is| of)?)[^0-9]{0,24}([0-9][0-9_,]{2,})/gi)]
    .map(match => Number(match[1].replace(/[_,]/g, '')))
    .filter(value => Number.isSafeInteger(value) && value >= MIN_CAPACITY && value <= MAX_CAPACITY)
  return { overflow: true, limitTokens: candidates.length ? Math.min(...candidates) : null }
}

/** Generic overflow with no stated limit: remove the oldest complete group. */
export function trimOneContextGroup(items: PackedContextMessage[]): PackedModelContext {
  const firstOptionalUser = items.findIndex(item => !item.required && item.message.role === 'user')
  if (firstOptionalUser < 0) throw Error('The provider rejected the essential request context. Nothing essential was clipped.')
  let end = firstOptionalUser + 1
  while (end < items.length && !items[end].required && items[end].message.role !== 'user') end++
  const removed = new Set(items.slice(firstOptionalUser, end).map(item => item.id))
  const messages = items.filter(item => !removed.has(item.id))
  return {
    messages,
    omitted: items.filter(item => removed.has(item.id)).map(item => ({ id: item.id, reason: 'provider-overflow' as const })),
    estimatedInputTokens: messages.reduce((sum, item) => sum + messageTokens(item.message), 0),
  }
}

export function validModelContextReceipt(value: unknown): value is ModelContextReceipt {
  const v = value as ModelContextReceipt
  return !!v && typeof v === 'object' && typeof v.model === 'string' && v.model.length <= 300 &&
    !!v.capacity && ['reported', 'observed', 'owner', 'unknown'].includes(v.capacity.source) && ['auto', 'manual'].includes(v.capacity.mode) && (v.capacity.tokens === null || integer(v.capacity.tokens, MIN_CAPACITY, MAX_CAPACITY) !== undefined) &&
    !!v.estimate && v.estimate.exact === false && Number.isSafeInteger(v.estimate.inputTokens) && v.estimate.inputTokens >= 0 && typeof v.estimate.method === 'string' && v.estimate.method.length <= 500 &&
    Number.isSafeInteger(v.includedMessages) && v.includedMessages >= 0 && Array.isArray(v.omitted) && v.omitted.length <= 10_000 && v.omitted.every(row => row && typeof row.id === 'string' && ['model-context-budget', 'provider-overflow'].includes(row.reason)) &&
    Number.isSafeInteger(v.attempts) && v.attempts >= 1 && v.attempts <= 2 && typeof v.overflowRetry === 'boolean' && (v.workingNotes === undefined || ['included-draft', 'omitted-draft', 'none'].includes(v.workingNotes)) && typeof v.note === 'string' && v.note.length <= 2_000
}
