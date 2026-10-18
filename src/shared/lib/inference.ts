/**
 * inference.js — Ollama options tuned for the machine you actually have.
 *
 * The idea is Atomic Chat's, and it is the one thing on their list genuinely
 * worth taking: the fastest way to make a small GPU feel bigger is not to swap
 * the engine, it is to stop asking for more memory than the card has.
 *
 * The target machine is a TUF A15 with 4 GB of VRAM. A 3B model at Q4_K_M is
 * about 1.9 GB of weights; a 32k context on top of that does not fit, so Ollama
 * spills to shared memory and every token crawls. Capping the context is worth
 * more here than any other single setting.
 *
 * These are plain Ollama options. Nothing exotic, nothing that needs a native
 * build, and every value is visible and editable in Settings > Performance.
 */

import type { InferenceOptions, InferenceProfile, InferenceState } from '../types'

/** A custom profile is user-entered, so a value can be blank or not a number. */
export type CustomOptions = Record<string, string | number | undefined | null>

export type InferenceSettings = Partial<InferenceState> & { customOptions?: CustomOptions }

export const DEFAULT_PROFILE_ID = '4gb'

/**
 * `num_ctx` is the big one. `num_batch` is second: a smaller batch uses less
 * memory during prompt evaluation. `num_gpu` controls how many layers go on the
 * card — lowering it trades speed for room. 0 means CPU only, which is slow but
 * always works.
 */
export const INFERENCE_PROFILES: readonly InferenceProfile[] = Object.freeze([
  {
    id: '4gb',
    label: '4 GB VRAM',
    options: { num_ctx: 4096, num_batch: 256, num_predict: 1024 },
    keepAlive: '5m',
  },
  {
    id: '6gb',
    label: '6 GB VRAM',
    options: { num_ctx: 8192, num_batch: 512, num_predict: 2048 },
    keepAlive: '10m',
  },
  {
    id: '8gb',
    label: '8 GB VRAM',
    options: { num_ctx: 16384, num_batch: 512, num_predict: 2048 },
    keepAlive: '15m',
  },
  {
    id: 'cpu',
    label: 'CPU only (safest)',
    options: { num_ctx: 2048, num_batch: 128, num_predict: 1024, num_gpu: 0 },
    keepAlive: '5m',
  },
  {
    id: 'custom',
    label: 'Custom',
    options: { num_ctx: 4096, num_batch: 256, num_predict: 1024 },
    keepAlive: '5m',
  },
])

const LIMITS: Record<keyof InferenceOptions, [number, number]> = Object.freeze({
  num_ctx: [512, 32768],
  num_batch: [64, 2048],
  num_predict: [128, 8192],
  num_gpu: [0, 999],
}) as Record<keyof InferenceOptions, [number, number]>

/**
 * The same ranges the request is held to, so Settings can show a person the
 * limits instead of describing them from memory.
 */
export const INFERENCE_LIMITS = LIMITS

const clamp = (value: unknown, [min, max]: [number, number], fallback: number): number => {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function profileById(id: string): InferenceProfile {
  return INFERENCE_PROFILES.find(entry => entry.id === id) || INFERENCE_PROFILES[0]
}

/**
 * Accepts either a stored settings object or a bare id, and always returns
 * something Ollama will accept. A corrupt or half-written preference degrades
 * to the 4 GB profile rather than sending `undefined` to the API.
 */
export function resolveInference(settings?: InferenceSettings | string): InferenceState {
  const input: InferenceSettings = settings && typeof settings === 'object' ? settings : {}
  const id = typeof settings === 'string' ? settings : input.profile
  const base = profileById(id || DEFAULT_PROFILE_ID)
  if (base.id !== 'custom') {
    return { profile: base.id, options: { ...base.options }, keepAlive: base.keepAlive }
  }
  const raw: CustomOptions =
    input.customOptions && typeof input.customOptions === 'object' ? input.customOptions : {}
  const options: InferenceOptions = {}
  for (const [key, range] of Object.entries(LIMITS) as [keyof InferenceOptions, [number, number]][]) {
    const value = raw[key]
    // Only send what the user actually set, so Ollama keeps its own defaults
    // for anything left blank.
    if (value !== '' && value !== null && value !== undefined) {
      options[key] = clamp(value, range, base.options[key] ?? range[0])
    }
  }
  return { profile: 'custom', options, keepAlive: input.keepAlive || base.keepAlive }
}

/**
 * What each profile's number actually leaves for weights and context. The card's
 * figure is not the budget: the display, the desktop and Ollama's own buffers
 * take a cut, so a "4 GB" profile budgets 3.6 GB for the model to sit in.
 *
 * `cpu` and `custom` make no claim about a card, so there is nothing to measure
 * them against — see fitCheck below.
 */
export const PROFILE_BUDGET_GB: Record<string, number> = Object.freeze({
  '4gb': 3.6,
  '6gb': 5.4,
  '8gb': 7.2,
  cpu: 0,
})

/**
 * Rough cost of one token of context, in GB, for the small dense models this app
 * runs (grouped-query attention, fp16 KV cache). An estimate, and deliberately a
 * high one: over-estimating costs one sentence offering to lower the context,
 * under-estimating costs a machine that appears to hang.
 */
const GB_PER_TOKEN = 0.08 / 1024

/** Everything Ollama needs besides the weights and the context. */
const MODEL_OVERHEAD_GB = 0.4

/** Used only when the size of the running model is not known yet. */
const UNKNOWN_MODEL_GB = 1.9

/** The context sizes worth offering: ones somebody would recognise, smallest last. */
const CONTEXT_LADDER = Object.freeze([512, 2048, 4096, 8192, 16384, 32768])

export type FitCheck = {
  /** What the model plus this context will ask the card for. */
  needGb: number
  /** What the chosen profile budgets for it; 0 when the choice claims nothing. */
  budgetGb: number
  /** True when the choice needs no attention at all. */
  fits: boolean
}

/**
 * The one place memory is worked out, so the sentence in Settings and the button
 * that fixes it can never disagree.
 */
export function fitCheck(settings?: InferenceSettings | string, modelSizeBytes = 0): FitCheck {
  const { profile, options } = resolveInference(settings)
  const needGb = (modelSizeBytes ? modelSizeBytes / 1e9 : UNKNOWN_MODEL_GB)
    + (options.num_ctx ?? 0) * GB_PER_TOKEN
    + MODEL_OVERHEAD_GB
  if (options.num_gpu === 0) return { needGb, budgetGb: 0, fits: true }
  const budgetGb = PROFILE_BUDGET_GB[profile] || 0
  return { needGb, budgetGb, fits: budgetGb === 0 || needGb <= budgetGb }
}

/**
 * A plain-language warning, and only when the profile that was chosen cannot
 * hold what is loaded in it. Choosing a profile IS the answer to "how much video
 * memory is there", so a person who picked 6 GB is never told about 4.
 */
export function vramWarning(settings?: InferenceSettings | string, modelSizeBytes = 0): string {
  const { needGb, budgetGb, fits } = fitCheck(settings, modelSizeBytes)
  if (fits) return ''
  const what = modelSizeBytes ? 'the loaded model' : 'a 3B model'
  return `About ${needGb.toFixed(1)} GB is needed with ${what}, and this profile budgets ${budgetGb} GB.`
}

/**
 * The numbers that would fit the profile that is already chosen, for the button
 * that fixes this in one click: a smaller context, everything else left alone.
 *
 * The context snaps down to a size a person would have typed themselves rather
 * than to the largest number that happens to fit, and it never goes below the
 * floor the request itself is held to.
 *
 * null means no context is small enough — the weights themselves do not fit, and
 * the honest answer then is the CPU-only profile rather than a pretend one.
 */
export function fitToProfile(
  settings?: InferenceSettings | string,
  modelSizeBytes = 0
): InferenceSettings | null {
  const { profile, options } = resolveInference(settings)
  if (options.num_gpu === 0) return null
  const budgetGb = PROFILE_BUDGET_GB[profile] || 0
  if (budgetGb === 0) return null
  const weightsGb = modelSizeBytes ? modelSizeBytes / 1e9 : UNKNOWN_MODEL_GB
  const roomGb = budgetGb - weightsGb - MODEL_OVERHEAD_GB
  const allowed = Math.floor(roomGb / GB_PER_TOKEN)
  const [minCtx, maxCtx] = LIMITS.num_ctx
  const fits = CONTEXT_LADDER.filter(ctx => ctx <= allowed && ctx <= maxCtx)
  if (allowed < minCtx || !fits.length) return null
  const customOptions: Record<string, string> = { num_ctx: String(fits[fits.length - 1]) }
  for (const key of ['num_batch', 'num_predict', 'num_gpu'] as const) {
    const value = options[key]
    if (typeof value === 'number') customOptions[key] = String(value)
  }
  return { profile: 'custom', customOptions }
}
