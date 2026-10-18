import type { Attachment } from '@shared/types'

export type AudioModelDisclosure = {
  state: 'unselected' | 'not-enabled' | 'unverified'
  message: string
}

export type ImageModelDisclosure = {
  state: 'unsupported' | 'unverified'
  message: string
}

/**
 * The provider's model listing has no audio-capability field. Keep the selected
 * destination explicit and report that missing evidence instead of inferring
 * support from a model name.
 */
export function audioModelDisclosure(
  selected: string,
  enabledModels: ReadonlyArray<{ name: string }>,
): AudioModelDisclosure {
  const prefix = 'openai/'
  const modelId = selected.startsWith(prefix) ? selected.slice(prefix.length) : ''
  if (!modelId) {
    return {
      state: 'unselected',
      message: 'Choose an enabled OpenAI model before sending audio. No model is selected automatically.',
    }
  }

  const available = enabledModels.some(({ name }) =>
    (name.startsWith(prefix) ? name.slice(prefix.length) : name) === modelId,
  )
  if (!available) {
    return {
      state: 'not-enabled',
      message: `${prefix}${modelId} is not in the current enabled OpenAI model list. Refresh or choose an enabled model; nothing will be rerouted.`,
    }
  }

  return {
    state: 'unverified',
    message: `Audio support for ${prefix}${modelId} is not reported by the provider model list. It may refuse this clip. It will be sent only to this exact model; there is no fallback.`,
  }
}

/**
 * Do not infer image capability from a model name. The AGY image refusal is
 * explicit in its engine; Claude Code's current model list has no capability
 * field, so it remains unverified and is named before the user sends.
 */
export function imageModelDisclosure(engineId: string, selectedModel: string): ImageModelDisclosure {
  if (engineId === 'agy') {
    return {
      state: 'unsupported',
      message: 'The agy engine cannot receive image attachments. Sampled video frames are images too. They remain attached; nothing is sent or switched.',
    }
  }
  if (engineId !== 'claude-code') {
    return {
      state: 'unverified',
      message: 'Image support for the selected engine is not verified. It may refuse these images or sampled video frames; nothing will be sent to another engine.',
    }
  }

  const model = selectedModel.trim()
  const target = model ? `claude-code model ${JSON.stringify(model)}` : 'current claude-code model'
  return {
    state: 'unverified',
    message: `Image support for the ${target} is not reported here. It may refuse these images or sampled video frames; nothing will be sent to another engine.`,
  }
}

/** Return the exact number of decoded bytes represented by canonical base64. */
export function base64PayloadBytes(value: string | undefined): number | null {
  if (!value) return null
  const comma = value.startsWith('data:') ? value.indexOf(',') : -1
  const encoded = comma >= 0 ? value.slice(comma + 1) : value
  if (!encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    return null
  }
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0
  return (encoded.length / 4) * 3 - padding
}

/** Exact outgoing image/audio bytes, not file-size guesses or RAM/VRAM estimates. */
export function preparedMediaPayloadBytes(
  attachment: Pick<Attachment, 'kind' | 'data' | 'audioData'>,
): number | null {
  if (attachment.kind === 'audio') return base64PayloadBytes(attachment.audioData)
  if (attachment.kind === 'image') return base64PayloadBytes(attachment.data)
  return null
}

export function formatExactBytes(bytes: number | null): string | null {
  if (bytes === null || !Number.isSafeInteger(bytes) || bytes < 0) return null
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(bytes)} B`
}

export function preparedMediaSizeLabel(
  attachment: Pick<Attachment, 'kind' | 'data' | 'audioData'>,
): string | null {
  return formatExactBytes(preparedMediaPayloadBytes(attachment))
}
