import { useCallback, useEffect, useMemo, useState } from 'react'
import { getCapabilities, showModel } from '../lib/ollama.js'
import { pickBridgeModel } from '../lib/vision.js'

/**
 * useVisionBridge — which installed models can actually see.
 *
 * Capabilities come from Ollama's /api/show, never from a model's name, and the
 * answers are cached per model + size so a slow machine pays for the probe once.
 * The probe runs in the background after the model list loads, one model at a
 * time, and stops on the first error: /api/show is local and cheap, but it
 * should never compete with a running generation.
 */
const CACHE_KEY = 'claude_exact_model_capabilities'
const MAX_PROBES = 8

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch { return {} }
}

export default function useVisionBridge({ models, status, selected, preferred, enabled = true }) {
  const [cache, setCache] = useState(readCache)
  const [probing, setProbing] = useState(false)
  const persist = useCallback(value => {
    setCache(value)
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)) } catch { /* storage full: probing simply repeats */ }
  }, [])
  const key = model => `${model.name}@${model.size || 0}`
  const pending = useMemo(() => status === 'online'
    ? models.filter(model => typeof model?.name === 'string').slice(0, MAX_PROBES)
      .filter(model => !(key(model) in cache) || cache[key(model)]?.capabilities === undefined)
    : [], [models, status, cache])

  useEffect(() => {
    if (!enabled || status !== 'online' || !pending.length) return undefined
    const controller = new AbortController()
    let cancelled = false
    setProbing(true)
    ;(async () => {
      const next = { ...cache }
      for (const model of pending) {
        if (cancelled) break
        try {
          const metadata = await showModel(model.name, controller.signal)
          next[key(model)] = { capabilities: Array.isArray(metadata?.capabilities) ? metadata.capabilities : [], at: new Date().toISOString() }
        } catch (error) {
          if (error.name === 'AbortError') break
          // One unreachable model must not stop the rest; record it as unknown.
          next[key(model)] = { capabilities: [], at: new Date().toISOString() }
        }
      }
      if (!cancelled) persist(next)
    })().finally(() => { if (!cancelled) setProbing(false) })
    return () => { cancelled = true; controller.abort() }
  }, [enabled, status, pending, cache, persist])

  const visionModels = useMemo(() => models
    .filter(model => (cache[key(model)]?.capabilities || []).includes('vision'))
    .map(model => ({ name: model.name, size: model.size, details: model.details })), [models, cache])

  const bridgeModel = enabled ? pickBridgeModel(visionModels, preferred, selected) : ''
  const selectedVision = Boolean(cache[`${selected}@${models.find(model => model.name === selected)?.size || 0}`]?.capabilities?.includes('vision'))
  return {
    visionModels, bridgeModel, probing, cache,
    /** Images are usable if the selected model sees, or a verified bridge exists. */
    imageSupport: selectedVision ? 'direct' : bridgeModel ? 'bridge' : 'none',
    refresh: () => persist({ ...readCache() }),
    forget: modelName => {
      const next = { ...cache }
      for (const entry of Object.keys(next)) if (entry.startsWith(`${modelName}@`)) delete next[entry]
      persist(next)
    },
    capabilitiesOf: name => {
      const model = models.find(item => item.name === name)
      return getCapabilities({ capabilities: cache[`${name}@${model?.size || 0}`]?.capabilities })
    },
  }
}
