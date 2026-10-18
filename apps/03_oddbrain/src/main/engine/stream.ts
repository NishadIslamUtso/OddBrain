/**
 * The Claude Code wire protocol, parsed.
 *
 * Claude Code streams its life as one JSON sentence per line ("stream-json",
 * an official output mode). This parser turns those sentences into the app's
 * own engine events, and it is deliberately boring about everything it does
 * not recognise: a newer CLI adding new sentence types must never crash the
 * app — the unknown just passes by.
 *
 * Lines can arrive split across data chunks (the operating system chops TCP
 * and pipes wherever it likes), so unfinished text is kept for the next feed.
 */
import type { EngineEvent } from '../../shared/lib/engine'
import { toolDetail, toolSummary, type EngineUsage } from '../../shared/lib/engine'

export type EngineParser = {
  /** Feed raw output; returns every complete event found in it. */
  feed(chunk: string): EngineEvent[]
  /**
   * Call once when the engine closes: returns the event in a final line that
   * arrived without its newline, so a last "done" is never lost.
   */
  flush(): EngineEvent[]
}

type LooseRecord = Record<string, unknown>

const asRecord = (value: unknown): LooseRecord => (value && typeof value === 'object' ? (value as LooseRecord) : {})

export function createEngineParser(): EngineParser {
  let buffer = ''
  // What has already been shown through deltas for the message being
  // streamed. When the finished message arrives and says the same thing, it
  // is not news — showing both would print every answer twice.
  let streamed = ''
  // Same bookkeeping for the model's thinking: what the thinking deltas
  // already showed, so the finished thinking block is not printed twice.
  let streamedThinking = ''
  // How much of `buffer` is already known to hold no newline: everything
  // before this offset was scanned by an earlier feed. A line chopped at a
  // chunk boundary is therefore rescanned only in its new tail — a long-lived
  // engine feeding small chunks stays linear, not quadratic.
  let scanned = 0

  const parseLine = (line: string): EngineEvent[] => {
    const text = line.trim()
    if (!text) return []
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      // Not JSON — probably a stray console line. Ignored, never fatal.
      return []
    }
    const message = asRecord(parsed)

    if (message.type === 'system') {
      const subtype = typeof message.subtype === 'string' ? message.subtype : ''
      if (subtype === 'init') {
        // The session id makes this conversation resumable after the app or
        // the engine restarts — its own event so the back room can remember
        // it without the window having to care.
        const sessionId = typeof message.session_id === 'string' ? message.session_id : ''
        const opened: EngineEvent[] = sessionId ? [{ kind: 'session', id: sessionId }] : []
        return [...opened, { kind: 'status', text: 'engine ready' }]
      }
      // A denial the engine decided itself: shown, never swallowed — a person
      // must be able to see WHY nothing happened.
      if (subtype === 'permission_denied')
        return [{ kind: 'status', text: 'a tool use was denied by the engine\'s safe mode' }]
      // The brain not answering yet: say so, or the window looks frozen.
      // By the third try the owner needs the FIX, not another count — the
      // machine sat at "retry 1, 2, 3" with nothing actionable. The engine
      // is left alone to keep retrying; only the words change.
      if (subtype === 'api_retry') {
        const attempt = typeof message.attempt === 'number' ? message.attempt : null
        if (attempt !== null && attempt >= 3) {
          return [{
            kind: 'status',
            text:
              'the brain is still not answering \u2014 if this keeps failing: run `claude` once in a terminal and sign in, or check your connection. Still trying.',
          }]
        }
        return [{ kind: 'status', text: attempt ? `the brain is not answering, retry ${attempt}` : 'the brain is not answering, retrying' }]
      }
      return []
    }

    if (message.type === 'user') {
      // Tool RESULTS travel back as user-role messages. A failed one is news:
      // without this, a broken command looks like the engine going quiet.
      const content = asRecord(message.message).content
      if (!Array.isArray(content)) return []
      const events: EngineEvent[] = []
      for (const block of content) {
        const entry = asRecord(block)
        if (entry.type === 'tool_result' && entry.is_error === true) {
          const text = typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content) ?? ''
          events.push({ kind: 'status', text: `a tool call failed: ${text.slice(0, 160)}` })
        }
      }
      return events
    }

    if (message.type === 'stream_event') {
      // A piece of the engine's words as they form. Thinking deltas ride the
      // same wire — the model's scratchwork, shown folded so a person can
      // watch the process without it drowning the answer.
      const event = asRecord(message.event)
      if (event.type !== 'content_block_delta') return []
      const delta = asRecord(event.delta)
      if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string' && delta.thinking) {
        streamedThinking = streamedThinking.length > 200_000 ? delta.thinking : streamedThinking + delta.thinking
        return [{ kind: 'thinking', text: delta.thinking }]
      }
      if (delta.type !== 'text_delta' || typeof delta.text !== 'string' || !delta.text) return []
      streamed = streamed.length > 200_000 ? delta.text : streamed + delta.text
      return [{ kind: 'delta', text: delta.text }]
    }

    if (message.type === 'assistant') {
      // The engine's turn: text pieces and the tools it decided to use.
      const content = asRecord(message.message).content
      if (!Array.isArray(content)) return []
      const events: EngineEvent[] = []
      let messageText = ''
      for (const block of content) {
        const entry = asRecord(block)
        if (entry.type === 'text' && typeof entry.text === 'string' && entry.text.trim()) {
          messageText += entry.text
          events.push({ kind: 'text', text: entry.text })
        } else if (entry.type === 'tool_use' && typeof entry.name === 'string') {
          events.push({ kind: 'tool', name: entry.name, summary: toolSummary(entry.name, entry.input) })
        } else if (entry.type === 'thinking' && typeof entry.thinking === 'string' && entry.thinking.trim()) {
          // The finished thinking block. What the stream already showed word
          // for word is not shown again — same rule as the answer text below.
          if (entry.thinking !== streamedThinking) {
            events.push({ kind: 'thinking', text: entry.thinking })
          }
        }
      }
      // What the stream already showed, word for word, is not shown again.
      // The buffer resets either way: once the finished message is seen, the
      // next message's stream must start fresh — a second turn that happens
      // to say the same words (two battle sides, a repeated question) would
      // otherwise pile onto the stale buffer and defeat the equality check.
      const repeated = messageText && messageText === streamed
      streamed = ''
      streamedThinking = ''
      if (repeated) {
        return events.filter((event) => event.kind !== 'text')
      }
      return events
    }

    if (message.type === 'control_request') {
      // The engine asking permission to use a tool (the bidirectional wire).
      const request = asRecord(message.request)
      if (request.subtype !== 'can_use_tool' || typeof request.tool_name !== 'string') return []
      const requestId = typeof message.request_id === 'string' ? message.request_id : ''
      if (!requestId) return []
      const inputRecord = asRecord(request.input)
      const file = typeof inputRecord.file_path === 'string' ? inputRecord.file_path : ''
      return [
        {
          kind: 'permission',
          requestId,
          tool: request.tool_name,
          summary: toolSummary(request.tool_name, request.input),
          detail: toolDetail(request.tool_name, request.input),
          ...(file ? { file } : {}),
        },
      ]
    }

    if (message.type === 'result') {
      const text = typeof message.result === 'string' ? message.result : ''
      const isError = message.is_error === true || message.subtype === 'error_during_execution'
      // What the turn cost: the engine reports its own token counts and time,
      // and the app shows those honest numbers instead of guessing.
      const usageRecord = asRecord(message.usage)
      const usage: EngineUsage | undefined = message.usage
        ? {
            inTokens: typeof usageRecord.input_tokens === 'number' ? usageRecord.input_tokens : 0,
            outTokens: typeof usageRecord.output_tokens === 'number' ? usageRecord.output_tokens : 0,
            durationMs: typeof message.duration_ms === 'number' ? message.duration_ms : null,
            costUsd: typeof message.total_cost_usd === 'number' ? message.total_cost_usd : null,
          }
        : undefined
      const withUsage = (event: { kind: 'done'; text: string } | { kind: 'error'; text: string }): EngineEvent =>
        usage ? { ...event, usage } : event
      return [
        isError
          ? withUsage({ kind: 'error', text: text || 'the engine hit an error' })
          : withUsage({ kind: 'done', text }),
      ]
    }

    // Everything else (user echoes, control responses to our own answers,
    // future types) is the wire's business, not the window's.
    return []
  }

  return {
    feed(chunk: string): EngineEvent[] {
      buffer += chunk
      // A single line longer than this is not a sentence, it is a runaway —
      // drop the oldest half rather than grow without limit.
      if (buffer.length > 2_000_000) {
        const cut = buffer.length - 1_000_000
        buffer = buffer.slice(cut)
        scanned = Math.max(0, scanned - cut)
      }
      const events: EngineEvent[] = []
      let index = buffer.indexOf('\n', Math.min(scanned, buffer.length))
      while (index !== -1) {
        events.push(...parseLine(buffer.slice(0, index)))
        buffer = buffer.slice(index + 1)
        scanned = 0
        index = buffer.indexOf('\n', scanned)
      }
      scanned = buffer.length
      return events
    },
    flush(): EngineEvent[] {
      const rest = buffer
      buffer = ''
      scanned = 0
      return parseLine(rest)
    },
  }
}
