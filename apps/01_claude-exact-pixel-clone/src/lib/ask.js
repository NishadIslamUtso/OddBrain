import { splitThinking, streamChat } from './ollama.js'

/**
 * ask.js — one isolated local model call.
 *
 * The chat transcript, the vision bridge, sub-agents and the artifact
 * region-rewriter all need the same thing: send a message list that has nothing
 * to do with the open chat and collect the answer. Keeping it in one place means
 * the context budget is checked once, in the same way, for every caller.
 */
export const CHAR_BUDGET = 12_000

/** Conservative character guard — this is not a token counter. */
export function budgetOf(messages) {
  return messages.reduce((size, message) => size + String(message.content || '').length + (message.images?.length || 0) * 400, 0)
}

export function assertBudget(messages, label = 'This request') {
  const size = budgetOf(messages)
  if (size > CHAR_BUDGET) {
    throw new Error(`${label} is about ${size.toLocaleString()} characters, over the conservative ${CHAR_BUDGET.toLocaleString()}-character budget for the 4,096-token local context. Shorten the prompt or split the work.`)
  }
  return size
}

/**
 * Stream one completion and resolve with the final text.
 * `onChunk` receives { content, thinking } as they grow, so a caller can show
 * progress; nothing is written to the chat transcript unless the caller does it.
 */
export async function askLocal({ model, messages, think = false, signal, onChunk, timeoutMs = 300_000, budgetLabel, inference }) {
  assertBudget(messages, budgetLabel)
  let raw = ''
  let nativeThinking = ''
  const timer = setTimeout(() => {
    if (signal && !signal.aborted && typeof signal.throwIfAborted !== 'function') return
  }, timeoutMs)
  try {
    const piece = await Promise.race([
      streamChat({ model, messages, ...(think ? { think: true } : {}) }, signal, record => {
        raw += record.message?.content || ''
        nativeThinking += record.message?.thinking || ''
        if (onChunk) onChunk(splitThinking(raw, nativeThinking))
      }, inference),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`The model did not finish within ${Math.round(timeoutMs / 1000)} seconds.`)), timeoutMs)),
    ])
    void piece
    const result = splitThinking(raw, nativeThinking)
    return { content: result.content.trim(), thinking: result.thinking.trim(), raw }
  } finally {
    clearTimeout(timer)
  }
}

/** A model that echoes the instruction back is not an answer. */
export function looksLikeRefusal(text = '') {
  return /^(?:i (?:cannot|can't|can not|am unable to)|sorry,? i)/i.test(String(text).trim())
}
