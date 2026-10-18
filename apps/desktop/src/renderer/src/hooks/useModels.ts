import { useCallback, useEffect, useRef, useState } from 'react'
import type { ModelCapabilities } from '@shared/types'
import { getCapabilities, isRemoteModel, listModels, showModel } from '@shared/lib/ollama'
import { parseCloudModel } from '@shared/lib/providers'
import { DEFAULT_PERMISSIONS, type Permissions } from '@shared/lib/permissions'
import { bridge, isDemo } from '../platform/bridge'

/** Nothing is assumed about a model until Ollama's own metadata says so. */
const UNVERIFIED: ModelCapabilities = { verified: false, vision: false, thinking: false }

export type InstalledModel = {
  name: string
  size?: number
  /** True for a model that answers online, through a provider whose key is saved. */
  cloud?: boolean
  provider?: string
}

export type ModelState = {
  model: string
  select: (name: string) => void
  models: InstalledModel[]
  status: 'loading' | 'online' | 'offline'
  /** A sentence the interface can show as-is. Empty when everything is fine. */
  error: string
  capabilities: ModelCapabilities
  refresh: () => void
  /** True only when the selected model is installed, verified and local. */
  available: boolean
}

/**
 * The models this app can use: the ones installed on this machine, and the ones a
 * saved key reaches.
 *
 * Two things here are deliberate. Cloud entries that *Ollama* lists are filtered
 * out — nothing is sent anywhere on Ollama's say-so. Online models come from the
 * providers themselves, through the main process, and only for providers whose
 * key a person saved in Settings; that key stays there. And vision or thinking
 * support is taken from Ollama's capability list, never from a model's name —
 * `qwen3-vl` looking like "vision" proves nothing about what is installed.
 */
export default function useModels(
  model: string,
  setModel: (name: string) => void,
  /** What the person allowed in Settings > Agent access. */
  permissions: Permissions = DEFAULT_PERMISSIONS
): ModelState {
  const [local, setLocal] = useState<InstalledModel[]>([])
  const [online, setOnline] = useState<InstalledModel[]>([])
  const [status, setStatus] = useState<ModelState['status']>('loading')
  const [error, setError] = useState('')
  const [capabilities, setCapabilities] = useState<ModelCapabilities>(UNVERIFIED)
  const [verification, setVerification] = useState({ name: '', local: false, error: '' })
  const refreshRef = useRef<AbortController | null>(null)

  /**
   * Which online models are reachable. Asked in parallel with Ollama rather than
   * after it: a provider having a slow day must not hold up the local list, and a
   * machine with no keys never waits at all.
   */
  const loadOnline = useCallback(async (): Promise<void> => {
    if (isDemo || typeof bridge.cloud?.models !== 'function') {
      setOnline([])
      return
    }
    try {
      const answer = await bridge.cloud.models()
      setOnline(
        answer?.ok
          ? answer.models.map(entry => ({ name: entry.name, cloud: true, provider: entry.provider }))
          : []
      )
    } catch {
      // A provider list that cannot be fetched is not an error in the interface:
      // Settings > Models is where a provider's own problem is reported, in the
      // provider's own words. Here it simply means no online models right now.
      setOnline([])
    }
  }, [])

  const refresh = useCallback(async () => {
    refreshRef.current?.abort()
    const controller = new AbortController()
    refreshRef.current = controller
    const timer = setTimeout(() => controller.abort(), 8000)
    setStatus('loading')
    void loadOnline()
    // The web demo has no Ollama behind it: asking would 404 into the console
    // on every load. The desktop app (not a demo) owns this request.
    if (isDemo) {
      setLocal([])
      setStatus('offline')
      return
    }
    try {
      const data = await listModels(controller.signal)
      if (!Array.isArray(data.models)) throw new Error('Ollama returned an invalid model list.')
      if (controller.signal.aborted || refreshRef.current !== controller) return
      // Ollama can list cloud models too. They are NOT authorized by that alone.
      setLocal(
        data.models.filter(
          (item): item is InstalledModel =>
            typeof item.name === 'string' && !isRemoteModel(item.name, item as never)
        )
      )
      setStatus('online')
      setError('')
    } catch (failure) {
      if (refreshRef.current === controller) {
        setLocal([])
        setStatus('offline')
        const problem = failure as Error
        setError(
          problem.name === 'AbortError' ? 'Ollama did not respond within 8 seconds.' : problem.message
        )
      }
    } finally {
      clearTimeout(timer)
    }
  }, [loadOnline])

  useEffect(() => {
    void refresh()
    return () => refreshRef.current?.abort()
  }, [refresh])

  const models: InstalledModel[] = [...local, ...online]
  const inList = models.some(item => item.name === model)
  const cloudName = parseCloudModel(model) !== null
  const isCloud = online.some(item => item.name === model)

  useEffect(() => {
    setCapabilities(UNVERIFIED)
    setVerification({ name: model, local: false, error: '' })
    // An online model has no Ollama metadata to read; its provider is the one
    // that reported it, and the key for it is already saved — that IS the
    // approval, made by hand in Settings. Vision and thinking stay unverified,
    // which is the truth: nothing here can see or think on a promise.
    if (cloudName) {
      setVerification({
        name: model,
        local: isCloud,
        error: isCloud
          ? ''
          : `${model} is not available right now: no key is saved for it, or its provider is switched off in Settings > Agent access.`,
      })
      return
    }
    if (status !== 'online' || !local.some(item => item.name === model)) return
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort('timeout'), 8000)
    showModel(model, controller.signal)
      .then(metadata => {
        if (controller.signal.aborted) return
        const remote = isRemoteModel(model, metadata as never)
        setCapabilities(remote ? UNVERIFIED : getCapabilities(metadata))
        setVerification({
          name: model,
          local: !remote,
          error: remote
            ? 'This Ollama entry uses a remote/cloud model. It is disabled: no cloud destination has been approved.'
            : '',
        })
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted || controller.signal.reason === 'timeout') {
          setVerification({
            name: model,
            local: false,
            error:
              controller.signal.reason === 'timeout'
                ? 'Ollama model verification timed out. Refresh models and try again.'
                : `Could not verify the selected model: ${failure.message}`,
          })
        }
      })
      .finally(() => clearTimeout(timer))
    return () => controller.abort()
  }, [model, local, status, cloudName, isCloud])

  const localError = verification.name === model ? verification.error : ''

  return {
    model,
    select: setModel,
    models,
    status,
    error:
      // A local answer switched off is said plainly, and it is the reason a send
      // is refused — the switch is not decoration.
      !cloudName && !permissions.local
        ? 'Answering with the local model is switched off in Settings > Agent access.'
        :
      // An online model is unaffected by Ollama being down, and saying otherwise
      // would be a warning about something that is not in the way.
      cloudName
        ? localError
        : error ||
          localError ||
          (status === 'online' && !inList
            ? `Selected model ${model} is not installed locally. Choose an installed model; nothing is downloaded or switched automatically.`
            : ''),
    capabilities,
    refresh: () => void refresh(),
    available: isCloud
      ? true
      : permissions.local && status === 'online' && inList && verification.name === model && verification.local,
  }
}
