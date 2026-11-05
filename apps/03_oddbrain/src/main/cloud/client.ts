/**
 * The cloud side of the app, in the main process.
 *
 * Two reasons it lives here and not in the interface:
 *
 *   1. The key never crosses into the renderer. The interface asks this what it
 *      can reach and what a reply says; it is never handed the material that
 *      would let it talk to a provider on its own.
 *   2. A cloud answer is streamed back as the same NDJSON records Ollama
 *      produces — provider events are translated here — so the interface keeps
 *      exactly one streaming path. Nothing in the UI knows which provider, or
 *      that there are providers at all.
 *
 * Nothing here is called unless a person has saved a key. There is no code path
 * that reaches a provider with no key: a model only appears in the list when its
 * provider is one the person enabled.
 */
import {
  baseUrlFor,
  buildChatRequest,
  buildModelsRequest,
  createSseParser,
  parseCloudModel,
  providerById,
  readModelNames,
  translateSseEvent,
  CLOUD_PROVIDERS,
  type CloudModelView,
  type CloudProvider,
  type CloudProviderView,
} from '../../shared/lib/providers'
import type { OllamaMessage, OllamaRecord } from '../../shared/types'
import { cloudEnabled, DEFAULT_PERMISSIONS, type Permissions } from '../../shared/lib/permissions'
import type { KeyStore } from './keys'
import { boundedResponse } from '../network/boundedResponse'

export type CloudModel = CloudModelView

export type CloudClient = {
  providers: () => CloudProviderView[]
  /** Every model reachable with the keys that are saved, with per-provider problems. */
  models: () => Promise<{ models: CloudModel[]; problems: { provider: string; error: string }[] }>
  /** One provider's list, for the Test button. */
  listModels: (id: string) => Promise<CloudModel[]>
  /** A cloud reply, as the same records the rest of the app already reads. */
  stream: (input: {
    model: string
    messages: OllamaMessage[]
    maxTokens: number
    signal?: AbortSignal
  }) => AsyncGenerator<OllamaRecord>
}

/** How much of a reply is asked for. Cloud providers require a ceiling. */
const MAX_TOKENS = 4096
/** A model list is a small document; these are guards, not budgets. */
const LIST_TIMEOUT_MS = 20_000
const MAX_LIST_BYTES = 2_000_000
const MAX_ERROR_BYTES = 64_000
const MAX_STREAM_BYTES = 16_000_000

/**
 * API keys and conversation text may only cross authenticated transport.
 * Plain HTTP remains useful for a provider running on this machine, but it is
 * never accepted for a remote host. Credentials/query fragments are refused
 * because concatenating API paths onto those URLs is ambiguous and can leak.
 */
function safeBaseUrl(provider: CloudProvider, raw: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`${provider.label} needs a valid base URL.`)
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || (loopback && url.protocol === 'http:'))) {
    throw new Error(`${provider.label} needs HTTPS, or HTTP on loopback, with no credentials, query or fragment in its base URL.`)
  }
  return url.toString().replace(/\/+$/, '')
}

function sentence(provider: CloudProvider, status: number, detail: string): string {
  if (status === 401 || status === 403) {
    return `That key was refused by ${provider.label}. Check it in Settings > Models.`
  }
  if (status === 404) {
    return `${provider.label} does not have that there${detail ? ` (${detail})` : ''}. A model id usually has to match exactly.`
  }
  if (status === 429) {
    return `${provider.label} is rate-limiting this key right now. Nothing was sent again automatically.`
  }
  return `${provider.label} answered ${status}${detail ? `: ${detail}` : '.'}`
}

async function failureText(response: Response): Promise<string> {
  try {
    const text = await boundedResponse(response, MAX_ERROR_BYTES)
    if (!text) return ''
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string }
      const error = parsed?.error
      return String(
        (typeof error === 'string' ? error : error?.message) || parsed?.message || ''
      ).slice(0, 300)
    } catch {
      return text.slice(0, 300)
    }
  } catch {
    return ''
  }
}

export function createCloudClient(options: {
  keys: KeyStore
  /** The custom provider's base URL and model come from the machine's settings. */
  config?: () => { custom?: { baseUrl?: string; model?: string } }
  /**
   * What the person allowed, read fresh on every call: switching a provider off in
   * Settings has to take effect at once, not at the next launch.
   */
  permissions?: () => Permissions
  env?: Record<string, string | undefined>
  fetchImpl?: typeof fetch
}): CloudClient {
  const keys = options.keys
  const env = options.env || process.env
  const request = options.fetchImpl || fetch
  const config: () => { custom?: { baseUrl?: string; model?: string } } = options.config || (() => ({}))
  const permissions: () => Permissions = options.permissions || (() => DEFAULT_PERMISSIONS)

  const baseFor = (provider: CloudProvider): string =>
    baseUrlFor(provider, { env, custom: config().custom })

  function keyFor(provider: CloudProvider): string {
    return keys.get(provider.id)
  }

  /**
   * A provider that is switched off in Settings > Agent access is not reachable
   * at all — no model list, no test, no reply. The key stays saved: taking a key
   * away and stopping its use are different decisions.
   */
  function switchedOff(provider: CloudProvider): string {
    return keys.has(provider.id) && !cloudEnabled(permissions(), provider.id, true)
      ? `${provider.label} is switched off in Settings > Agent access. Turn it on there, or nothing is sent to it.`
      : ''
  }

  async function listFor(provider: CloudProvider): Promise<CloudModel[]> {
    const off = switchedOff(provider)
    if (off) throw new Error(off)
    const apiKey = keyFor(provider)
    if (!apiKey) throw new Error(`No key is saved for ${provider.label}.`)
    const configuredBase = baseFor(provider)
    if (!configuredBase) throw new Error(`${provider.label} needs a base URL. Set it in Settings > Models.`)
    const baseUrl = safeBaseUrl(provider, configuredBase)
    const spec = buildModelsRequest(provider, apiKey, baseUrl)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS)
    try {
      let response: Response
      try {
        response = await request(spec.url, { method: spec.method, headers: spec.headers, redirect: 'error', signal: controller.signal })
      } catch (error) {
        const reason = (error as Error).name === 'AbortError' ? 'it did not answer in 20 seconds' : (error as Error).message
        throw new Error(`Could not reach ${provider.label}: ${reason}.`)
      }
      if (!response.ok) throw new Error(sentence(provider, response.status, await failureText(response)))
      let payload: unknown
      try {
        payload = JSON.parse(await boundedResponse(response, MAX_LIST_BYTES))
      } catch {
        if (controller.signal.aborted) throw new Error(`${provider.label} did not finish its model list in 20 seconds.`)
        throw new Error(`${provider.label} sent a model list this app could not read within the ${MAX_LIST_BYTES.toLocaleString()}-byte limit.`)
      }
      return readModelNames(payload).map(model => ({
        name: `${provider.id}/${model}`,
        provider: provider.id,
        label: model,
      }))
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    providers: () =>
      CLOUD_PROVIDERS.map(provider => ({
        id: provider.id,
        label: provider.label,
        keysUrl: provider.keysUrl,
        custom: Boolean(provider.custom),
        baseUrl: provider.custom ? config().custom?.baseUrl || '' : baseFor(provider),
        hasKey: keys.has(provider.id),
        sessionOnly: keys.has(provider.id) && !keys.persisted(provider.id),
        enabled: cloudEnabled(permissions(), provider.id, keys.has(provider.id)),
      })),

    models: async () => {
      const models: CloudModel[] = []
      const problems: { provider: string; error: string }[] = []
      // Only the providers that may answer: a switched-off one is not asked for
      // its models, so its models never appear in the composer.
      const enabled = CLOUD_PROVIDERS.filter(provider => cloudEnabled(permissions(), provider.id, keys.has(provider.id)))
      // In parallel: a provider that is slow or down must not hold up the rest,
      // and each failure is reported against its own provider.
      const results = await Promise.all(
        enabled.map(async provider => {
          try {
            return { provider, models: await listFor(provider) }
          } catch (error) {
            return { provider, error: (error as Error).message }
          }
        })
      )
      for (const result of results) {
        if ('models' in result && result.models) models.push(...result.models)
        else problems.push({ provider: result.provider.id, error: String((result as { error: string }).error) })
      }
      return { models, problems }
    },

    listModels: async (id: string) => {
      const provider = providerById(id)
      if (!provider) throw new Error(`There is no provider called ${id}.`)
      return listFor(provider)
    },

    stream: async function* stream(input) {
      const parsed = parseCloudModel(input.model)
      if (!parsed) throw new Error(`That is not a cloud model: ${input.model}.`)
      const { provider, model } = parsed
      const off = switchedOff(provider)
      if (off) throw new Error(off)
      const apiKey = keyFor(provider)
      if (!apiKey) throw new Error(`No key is saved for ${provider.label}. Add one in Settings > Models.`)
      const configuredBase = baseFor(provider)
      if (!configuredBase) throw new Error(`${provider.label} needs a base URL. Set it in Settings > Models.`)
      const baseUrl = safeBaseUrl(provider, configuredBase)
      const spec = buildChatRequest({
        provider,
        model,
        apiKey,
        baseUrl,
        messages: input.messages,
        maxTokens: input.maxTokens || MAX_TOKENS,
      })
      let response: Response
      try {
        response = await request(spec.url, {
          method: spec.method,
          headers: spec.headers,
          body: spec.body,
          redirect: 'error',
          signal: input.signal,
        })
      } catch (error) {
        if ((error as Error).name === 'AbortError') throw error
        throw new Error(`Could not reach ${provider.label}: ${(error as Error).message}.`)
      }
      if (!response.ok || !response.body) {
        throw new Error(sentence(provider, response.status, await failureText(response)))
      }

      const parser = createSseParser()
      const decoder = new TextDecoder()
      const reader = response.body.getReader()
      let stopped = false
      let received = 0
      try {
        for (;;) {
          const { value, done } = await reader.read()
          received += value?.byteLength ?? 0
          if (received > MAX_STREAM_BYTES) throw new Error(`${provider.label} streamed more than the ${MAX_STREAM_BYTES.toLocaleString()}-byte reply limit.`)
          const text = done ? decoder.decode() : decoder.decode(value, { stream: true })
          for (const event of parser.push(text)) {
            const delta = translateSseEvent(provider.wire, event)
            if (!delta) continue
            if (delta.error) throw new Error(`${provider.label} refused that request: ${delta.error}`)
            const record: OllamaRecord = {}
            if (delta.content || delta.thinking) {
              record.message = { content: delta.content || '', thinking: delta.thinking || '' }
            }
            if (delta.inputTokens || delta.outputTokens) {
              record.usage = { input_tokens: delta.inputTokens, output_tokens: delta.outputTokens }
            }
            if (delta.done) {
              record.done = true
              stopped = true
            }
            if (record.message || record.done || record.usage) yield record
          }
          if (done) break
        }
      } finally {
        // Cancelling a completed stream is harmless; on a size/parser failure it
        // stops the provider from continuing to feed bytes we already refused.
        await reader.cancel().catch(() => undefined)
        try {
          reader.releaseLock()
        } catch {
          // The stream is already closed; nothing to release.
        }
      }
      // A provider that simply stops sending is still a finished answer. Saying
      // "done" here is what stops the interface reporting a good reply as a
      // dropped connection.
      if (!stopped) yield { done: true }
    },
  }
}
