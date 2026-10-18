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

export const DEFAULT_PROFILE_ID = '4gb'

/**
 * `num_ctx` is the big one. `num_batch` is second: a smaller batch uses less
 * memory during prompt evaluation. `num_gpu` controls how many layers go on the
 * card — lowering it trades speed for room. 0 means CPU only, which is slow but
 * always works.
 */
export const INFERENCE_PROFILES = Object.freeze([
  {
    id: '4gb',
    label: '4 GB VRAM (recommended)',
    hint: 'For a GTX/RTX 3050 laptop. Small context, small batch — fits alongside the weights.',
    options: { num_ctx: 4096, num_batch: 256, num_predict: 1024 },
    keepAlive: '5m',
  },
  {
    id: '6gb',
    label: '6 GB VRAM',
    hint: 'Mid-range cards. A larger context without spilling into shared memory.',
    options: { num_ctx: 8192, num_batch: 512, num_predict: 2048 },
    keepAlive: '10m',
  },
  {
    id: '8gb',
    label: '8 GB VRAM',
    hint: 'Comfortable. Long conversations stay on the card.',
    options: { num_ctx: 16384, num_batch: 512, num_predict: 2048 },
    keepAlive: '15m',
  },
  {
    id: 'cpu',
    label: 'CPU only (safest)',
    hint: 'No GPU layers at all. Slow, but it runs on anything and cannot run out of VRAM.',
    options: { num_ctx: 2048, num_batch: 128, num_predict: 1024, num_gpu: 0 },
    keepAlive: '5m',
  },
  {
    id: 'custom',
    label: 'Custom',
    hint: 'Your own values.',
    options: { num_ctx: 4096, num_batch: 256, num_predict: 1024 },
    keepAlive: '5m',
  },
])

const LIMITS = Object.freeze({
  num_ctx: [512, 32768],
  num_batch: [64, 2048],
  num_predict: [128, 8192],
  num_gpu: [0, 999],
})

const clamp = (value, [min, max], fallback) => {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function profileById(id) {
  return INFERENCE_PROFILES.find(entry => entry.id === id) || INFERENCE_PROFILES[0]
}

/**
 * Accepts either a stored settings object or a bare id, and always returns
 * something Ollama will accept. A corrupt or half-written preference degrades
 * to the 4 GB profile rather than sending `undefined` to the API.
 */
export function resolveInference(settings) {
  const input = settings && typeof settings === 'object' ? settings : {}
  const id = typeof settings === 'string' ? settings : input.profile
  const base = profileById(id || DEFAULT_PROFILE_ID)
  if (base.id !== 'custom') {
    return { profile: base.id, options: { ...base.options }, keepAlive: base.keepAlive }
  }
  const raw = input.customOptions && typeof input.customOptions === 'object' ? input.customOptions : {}
  const options = {}
  for (const [key, range] of Object.entries(LIMITS)) {
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
 * A plain-language warning when the chosen context is likely to exceed the
 * card. Deliberately conservative: on this hardware a false warning costs a
 * sentence, and a missed one costs a machine that appears to hang.
 */
export function vramWarning(settings, modelSizeBytes = 0) {
  const { options } = resolveInference(settings)
  if (options.num_gpu === 0) return ''
  const weightsGb = modelSizeBytes ? modelSizeBytes / 1e9 : 1.9
  // Rough KV-cache cost: ~0.5 MB per token of context for a small dense model.
  const contextGb = (options.num_ctx * 0.5) / 1024
  const total = weightsGb + contextGb + 0.4
  if (total <= 3.6) return ''
  return `This context needs roughly ${total.toFixed(1)} GB with the model loaded, which may not fit in 4 GB of VRAM. If replies stall, lower the context or switch to the CPU-only profile.`
}
