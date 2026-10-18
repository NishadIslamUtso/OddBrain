/**
 * Cloud providers, as data.
 *
 * Two wire formats cover every provider here: Anthropic's Messages API, and the
 * OpenAI chat-completions shape that OpenAI, Gemini (through its compatible
 * endpoint), OpenRouter, Groq, DeepSeek, xAI and any self-hosted server speak.
 *
 * Nothing in this file performs a request, and nothing here holds a key. The
 * main process owns the sockets and the key material; this file owns the shapes —
 * what to send, and how to read a provider's stream back into the same records
 * Ollama produces. That is deliberate: the interface has exactly one streaming
 * path whether an answer comes from a local model or a cloud one, and the shape
 * of that path is testable without a network.
 */

import type { OllamaMessage } from '../types'

export type WireFormat = 'anthropic' | 'openai'

export type CloudProvider = {
  id: string
  label: string
  wire: WireFormat
  /** Where requests go unless the person overrides it. */
  baseUrl: string
  /** Where a key comes from, shown in Settings so nobody has to go looking. */
  keysUrl: string
  /** The provider whose base URL and model a person types in themselves. */
  custom?: boolean
}

/**
 * The list is short on purpose: these are the endpoints that are stable enough to
 * ship a default for. Anything else is reachable through `custom`, which is also
 * how a self-hosted llama.cpp / vLLM / LM Studio server is used.
 */
export const CLOUD_PROVIDERS: readonly CloudProvider[] = Object.freeze([
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    wire: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    keysUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    label: 'GPT (OpenAI)',
    wire: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    keysUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'gemini',
    label: 'Gemini (Google)',
    wire: 'openai',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keysUrl: 'https://aistudio.google.com/apikey',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    wire: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    keysUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'groq',
    label: 'Groq',
    wire: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    keysUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    wire: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    keysUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'xai',
    label: 'Grok (xAI)',
    wire: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    keysUrl: 'https://console.x.ai',
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    wire: 'openai',
    baseUrl: '',
    keysUrl: '',
    custom: true,
  },
])

/**
 * How a provider is shown in Settings: what it is, where its key comes from,
 * whether one is saved, and whether that key is only in this run. The key itself
 * is never part of this — it does not leave the process that holds it.
 */
export type CloudProviderView = {
  id: string
  label: string
  keysUrl: string
  custom: boolean
  baseUrl: string
  hasKey: boolean
  sessionOnly: boolean
  /** Switched off in Settings > Agent access: the key is kept, and nothing is sent. */
  enabled: boolean
}

export type CloudView = {
  ok: boolean
  error?: string
  /** 'os' when this machine gave the app something to seal a key with. */
  encryption: 'os' | 'none'
  providers: CloudProviderView[]
}

/** One model a saved key can reach, named the way the composer shows it. */
export type CloudModelView = { name: string; provider: string; label: string }

export type CloudModelsAnswer = {
  ok: boolean
  error?: string
  models: CloudModelView[]
  problems: { provider: string; error: string }[]
}

export type CloudTestAnswer = { ok: boolean; error?: string; count?: number; first?: string }

/** The Anthropic API version this app speaks. Bump deliberately, never silently. */
export const ANTHROPIC_VERSION = '2023-06-01'

export function providerById(id: string): CloudProvider | undefined {
  return CLOUD_PROVIDERS.find(provider => provider.id === id)
}

/**
 * A cloud model is named `provider/model`, which is what the composer shows and
 * what every request is routed by. Only a known provider id matches, so an
 * Ollama name that happens to contain a slash is never mistaken for a cloud one.
 */
export const cloudModelName = (providerId: string, model: string): string => `${providerId}/${model}`

/**
 * Is this the name of a brain whose work leaves the machine? Two shapes say
 * so: a provider's own `provider/model` entry, and Ollama's `:cloud` suffix.
 * The badge, the trigger and the tests all ask this one function, so a model
 * can never look local in one list and cloud in another.
 */
export function isCloudModelName(name: unknown): boolean {
  const value = String(name ?? '')
  return parseCloudModel(value) !== null || /(?::|-)cloud(?:$|:)/i.test(value)
}

export function parseCloudModel(name: unknown): { provider: CloudProvider; model: string } | null {
  const value = String(name ?? '')
  const slash = value.indexOf('/')
  if (slash <= 0) return null
  const provider = providerById(value.slice(0, slash))
  const model = value.slice(slash + 1).trim()
  return provider && model ? { provider, model } : null
}

/**
 * Where a provider's requests actually go. Settings can point the custom
 * provider anywhere; an environment variable can redirect any of the others
 * (a proxy, a gateway, a self-hosted mirror) without editing code.
 */
export function baseUrlFor(
  provider: CloudProvider,
  overrides: { env?: Record<string, string | undefined>; custom?: { baseUrl?: string } } = {}
): string {
  const raw = provider.custom
    ? overrides.custom?.baseUrl || ''
    : overrides.env?.[`AI_ASSISTANT_${provider.id.toUpperCase()}_BASE_URL`] || provider.baseUrl
  return String(raw || '').replace(/\/+$/, '')
}

export type CloudRequest = {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: string
}

function authHeaders(provider: CloudProvider, apiKey: string): Record<string, string> {
  if (provider.wire === 'anthropic') {
    return { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION }
  }
  return { authorization: `Bearer ${apiKey}` }
}

/** The list of models the key can actually reach — never a hardcoded catalogue. */
export function buildModelsRequest(
  provider: CloudProvider,
  apiKey: string,
  baseUrl: string
): CloudRequest {
  return {
    url: `${baseUrl}/models`,
    method: 'GET',
    headers: { accept: 'application/json', ...authHeaders(provider, apiKey) },
  }
}

export function readModelNames(payload: unknown): string[] {
  const rows = (payload as { data?: unknown[] } | null)?.data
  const list = Array.isArray(rows)
    ? rows
    : Array.isArray((payload as { models?: unknown[] } | null)?.models)
      ? ((payload as { models: unknown[] }).models as unknown[])
      : []
  return list
    .map(row => String((row as { id?: string; name?: string })?.id || (row as { name?: string })?.name || ''))
    .filter(Boolean)
}

/** The system message is a message in one wire format and a field in the other. */
export function splitSystem(messages: OllamaMessage[]): { system: string; rest: OllamaMessage[] } {
  const rest: OllamaMessage[] = []
  const system: string[] = []
  for (const message of messages) {
    if (message.role === 'system') system.push(message.content)
    else rest.push(message)
  }
  return { system: system.join('\n\n'), rest }
}

export function buildChatRequest(input: {
  provider: CloudProvider
  model: string
  apiKey: string
  baseUrl: string
  messages: OllamaMessage[]
  /** The ceiling on one reply. Cloud providers require this field; local ones do not. */
  maxTokens: number
}): CloudRequest {
  const { system, rest } = splitSystem(input.messages)
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...authHeaders(input.provider, input.apiKey),
  }
  if (input.provider.wire === 'anthropic') {
    return {
      url: `${input.baseUrl}/messages`,
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: input.model,
        max_tokens: input.maxTokens,
        stream: true,
        ...(system ? { system } : {}),
        messages: rest.map(message => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
        })),
      }),
    }
  }
  return {
    url: `${input.baseUrl}/chat/completions`,
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: input.model,
      stream: true,
      max_tokens: input.maxTokens,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...rest.map(message => ({ role: message.role, content: message.content })),
      ],
    }),
  }
}

export type SseEvent = { event: string; data: string }

/**
 * Server-sent events, from a byte stream that arrives in arbitrary pieces.
 * A record is terminated by a blank line, which may be split across two reads,
 * so this keeps a buffer rather than parsing per chunk.
 */
export function createSseParser(): { push: (chunk: string) => SseEvent[] } {
  let buffer = ''
  return {
    push(chunk: string): SseEvent[] {
      buffer += chunk
      const events: SseEvent[] = []
      let separator = buffer.match(/\r?\n\r?\n/)
      while (separator && separator.index !== undefined) {
        const raw = buffer.slice(0, separator.index)
        buffer = buffer.slice(separator.index + separator[0].length)
        let event = ''
        const data: string[] = []
        for (const line of raw.split(/\r?\n/)) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
        }
        if (event || data.length) events.push({ event, data: data.join('\n') })
        separator = buffer.match(/\r?\n\r?\n/)
      }
      return events
    },
  }
}

export type CloudDelta = {
  content?: string
  thinking?: string
  inputTokens?: number
  outputTokens?: number
  done?: boolean
  error?: string
}

/**
 * One provider event, as something the app understands. Both formats are
 * translated here so the rest of the app never learns that providers differ.
 */
export function translateSseEvent(wire: WireFormat, event: SseEvent): CloudDelta | null {
  if (event.data === '[DONE]') return { done: true }
  let data: Record<string, any>
  try {
    data = JSON.parse(event.data)
  } catch {
    return null
  }
  if (data?.error) {
    const error = data.error
    return { error: String(typeof error === 'string' ? error : error?.message || 'The provider refused that request.') }
  }
  if (wire === 'anthropic') {
    const type = String(data.type || event.event || '')
    if (type === 'content_block_delta') {
      const delta = data.delta || {}
      if (typeof delta.text === 'string') return { content: delta.text }
      if (typeof delta.thinking === 'string') return { thinking: delta.thinking }
      return null
    }
    if (type === 'message_start') return { inputTokens: data.message?.usage?.input_tokens }
    if (type === 'message_delta') return { outputTokens: data.usage?.output_tokens }
    if (type === 'message_stop') return { done: true }
    return null
  }
  const choice = data.choices?.[0]
  const usage = data.usage
    ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
    : {}
  if (choice?.finish_reason) return { done: true, ...usage }
  const text = choice?.delta?.content
  if (typeof text === 'string' && text.length) return { content: text, ...usage }
  return Object.keys(usage).length ? usage : null
}
