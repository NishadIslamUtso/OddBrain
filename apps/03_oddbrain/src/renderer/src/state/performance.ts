/**
 * The stored side of Settings > Performance.
 *
 * inference.ts owns what these values MEAN — which profile, and what goes to
 * Ollama with every message. This module owns what is kept between launches:
 * the same shape, normalised, plus the small edits the dialog needs. A profile
 * id on its own is a complete stored answer, which is why the default is one
 * field and not a table.
 *
 * Typed numbers are stored as they were typed and clamped when the field loses
 * focus, not while somebody is halfway through typing "8192".
 */

import {
  DEFAULT_PROFILE_ID,
  INFERENCE_LIMITS,
  INFERENCE_PROFILES,
  type InferenceSettings,
} from '@shared/lib/inference'
import type { InferenceOptions } from '@shared/types'

export const INFERENCE_KEY = 'ai-assistant.inference'

export const DEFAULT_INFERENCE: InferenceSettings = Object.freeze({ profile: DEFAULT_PROFILE_ID })

const CUSTOM_KEYS: readonly (keyof InferenceOptions)[] = Object.freeze([
  'num_ctx',
  'num_batch',
  'num_predict',
  'num_gpu',
])

/** What each custom field is called. Labels only: the value and the range the
 *  field accepts are the explanation. */
export const CUSTOM_FIELDS: readonly {
  key: keyof InferenceOptions
  label: string
}[] = Object.freeze([
  { key: 'num_ctx', label: 'Context window' },
  { key: 'num_batch', label: 'Prompt batch' },
  { key: 'num_predict', label: 'Longest reply' },
  { key: 'num_gpu', label: 'Layers on the GPU' },
])

export function profileFor(id: string): (typeof INFERENCE_PROFILES)[number] | undefined {
  return INFERENCE_PROFILES.find(profile => profile.id === id)
}

/** Anything unrecognised becomes the 4 GB profile rather than something blank. */
export function normalizeInference(value: unknown): InferenceSettings {
  const input = (value && typeof value === 'object' ? value : {}) as InferenceSettings
  const profile =
    typeof input.profile === 'string' && profileFor(input.profile) ? input.profile : DEFAULT_PROFILE_ID
  const raw = (
    input.customOptions && typeof input.customOptions === 'object' ? input.customOptions : {}
  ) as Record<string, unknown>
  const customOptions: Record<string, string> = {}
  for (const key of CUSTOM_KEYS) {
    const entry = raw[key]
    if (typeof entry === 'number' && Number.isFinite(entry)) customOptions[key] = String(entry)
    else if (typeof entry === 'string' && entry.trim() !== '' && Number.isFinite(Number(entry))) {
      customOptions[key] = entry.trim()
    }
  }
  // Custom numbers are kept even while another profile is chosen, so switching
  // away and back does not silently throw away what somebody typed.
  return Object.keys(customOptions).length ? { profile, customOptions } : { profile }
}

/**
 * Switch profile. Choosing Custom starts from the numbers that were in use, so
 * there is something to edit rather than four empty boxes.
 */
export function withProfile(value: InferenceSettings, id: string): InferenceSettings {
  const existing = value.customOptions || {}
  if (id !== 'custom') {
    return Object.keys(existing).length ? { profile: id, customOptions: { ...existing } } : { profile: id }
  }
  if (Object.keys(existing).length > 0) return { profile: 'custom', customOptions: { ...existing } }
  const base = profileFor(value.profile || DEFAULT_PROFILE_ID) || INFERENCE_PROFILES[0]
  const seeded: Record<string, string> = {}
  for (const key of CUSTOM_KEYS) {
    const number = base.options[key]
    if (typeof number === 'number') seeded[key] = String(number)
  }
  return { profile: 'custom', customOptions: seeded }
}

export function withCustomOption(
  value: InferenceSettings,
  key: keyof InferenceOptions,
  raw: string
): InferenceSettings {
  const customOptions = { ...(value.customOptions || {}) }
  if (raw.trim() === '') delete customOptions[key]
  else customOptions[key] = raw
  return { profile: 'custom', customOptions }
}

/** Pull a field back into the range the request is actually held to. */
export function clampCustomOption(
  value: InferenceSettings,
  key: keyof InferenceOptions
): InferenceSettings {
  const raw = (value.customOptions || {})[key]
  if (raw === undefined || raw === null) return value
  const number = Math.round(Number(raw))
  if (!Number.isFinite(number)) return withCustomOption(value, key, '')
  const [min, max] = INFERENCE_LIMITS[key]
  return withCustomOption(value, key, String(Math.min(max, Math.max(min, number))))
}

export function customValue(value: InferenceSettings, key: keyof InferenceOptions): string {
  const raw = (value.customOptions || {})[key]
  return raw === undefined || raw === null ? '' : String(raw)
}

export function customRange(key: keyof InferenceOptions): string {
  const [min, max] = INFERENCE_LIMITS[key]
  return `${min}–${max}`
}
