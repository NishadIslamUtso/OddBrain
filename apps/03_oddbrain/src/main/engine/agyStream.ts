import type { EngineEvent, EngineUsage } from '../../shared/lib/engine'

const record = (value: unknown): Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
const count = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0
const clip = (text: string, limit = 5000): string => text.length <= limit ? text : `${text.slice(0, limit)}\n… (${text.length - limit} more characters not shown)`

/** agy's documented event protocol; no thinking text or permission channel is invented. */
export function createAgyParser(resumed: boolean | string = false) {
  let unusable = false
  let conversation = '', open = false, streamed = '', lastAgentStep = -1, maxStep = -1, finishedStep = -1
  let previous: { turns: number; input: number; output: number; seconds: number | null } | null = null
  const tools = new Set<number>(), outputs = new Set<number>(), responses = new Map<number, string>()
  return {
    beginTurn(): void { open = true; streamed = ''; lastAgentStep = -1; tools.clear(); outputs.clear(); responses.clear() },
    pending(): boolean { return open },
    shouldStop(): boolean { return unusable },
    event(raw: unknown): EngineEvent[] {
      const frame = record(raw), events: EngineEvent[] = []
      const identify = (value: unknown): void => {
        if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) && value !== conversation) {
          if (conversation || (typeof resumed === 'string' && resumed !== value)) throw Error('agy returned a different conversation. The task was stopped rather than silently changing sessions.')
          conversation = value; previous = null; finishedStep = -1; maxStep = -1
          events.push({ kind: 'session', id: value })
        }
      }
      if (frame.event === 'init') {
        identify(frame.conversation_id)
        const init = record(frame.init)
        if (typeof init.permission_mode === 'string') events.push({ kind: 'status', text: `agy permissions: ${init.permission_mode}. No interactive approval cards are available on this connection.` })
        return events
      }
      if (!open) return events
      if (frame.event === 'step_update') {
        const step = record(frame.step_update), index = step.step_index
        if (!Number.isSafeInteger(index) || index < 0 || index <= finishedStep) return events
        identify(step.conversation_id)
        maxStep = Math.max(maxStep, index)
        if (tools.size + responses.size > 10000) throw Error('agy emitted too many steps for this turn. The task was stopped; received activity is retained.')
        if (step.step_type === 'agent_response' && typeof step.text_delta === 'string' && step.text_delta) {
          streamed += step.text_delta
          if (streamed.length > 8_000_000) throw Error('agy response exceeded the supported stream size. The task was stopped; already received text is retained.')
          lastAgentStep = index; responses.set(index, (responses.get(index) || '') + step.text_delta)
          events.push({ kind: 'delta', text: step.text_delta })
        }
        if (step.step_type === 'tool') {
          const info = record(step.tool_info), parameters = record(info.parameters)
          const name = typeof step.tool_name === 'string' ? step.tool_name : typeof info.name === 'string' ? info.name : 'agy tool'
          if (!tools.has(index)) {
            tools.add(index)
            const target = parameters.CommandLine ?? parameters.TargetFile ?? parameters.AbsolutePath ?? parameters.DirectoryPath
            const summary = typeof target === 'string' ? target : Object.keys(parameters).length ? JSON.stringify(parameters) : 'Reported by agy'
            events.push({ kind: 'tool', name: name.slice(0, 160), summary: clip(summary, 600) })
          }
          if (step.state === 'DONE' && !outputs.has(index)) {
            outputs.add(index)
            if (typeof info.output === 'string' && info.output) events.push({ kind: 'status', text: `${name} output:\n${clip(info.output)}` })
            const error = record(info.error)
            if (typeof error.message === 'string' && error.message) events.push({ kind: 'status', text: `tool call failed (${name}): ${clip(error.message)}` })
          }
        }
        return events
      }
      if (frame.event !== 'result') return events
      const result = record(frame.result)
      if (typeof result.status !== 'string') throw Error('agy returned an invalid result. The task was stopped.')
      identify(result.conversation_id)
      open = false; finishedStep = maxStep
      unusable = !['SUCCESS', 'ERROR', 'CANCELED', 'INTERRUPTED'].includes(result.status)
      const response = typeof result.response === 'string' ? result.response : ''
      const lastResponse = responses.get(lastAgentStep) || ''
      let displayed = Boolean(response && (response === streamed || response === lastResponse))
      const prefix = streamed && response.startsWith(streamed) ? streamed : lastResponse && response.startsWith(lastResponse) ? lastResponse : ''
      if (!displayed && prefix) { events.push({ kind: 'delta', text: response.slice(prefix.length) }); displayed = true }
      // Cumulative session counters must not be charged again for every turn.
      const u = record(result.usage), turns = result.num_turns
      const current = count(u.input_tokens) && count(u.output_tokens) && Number.isSafeInteger(turns) && turns >= 0
        ? { turns, input: u.input_tokens, output: u.output_tokens, seconds: count(result.duration_seconds) ? result.duration_seconds : null } : null
      let usage: EngineUsage | undefined
      if (current) {
        const baseline = previous && current.turns === previous.turns + 1 ? previous : !previous && !resumed && turns === 1 ? { input: 0, output: 0, seconds: 0 } : null
        if (baseline && current.input >= baseline.input && current.output >= baseline.output) usage = {
          inTokens: current.input - baseline.input, outTokens: current.output - baseline.output,
          durationMs: current.seconds !== null && baseline.seconds !== null && current.seconds >= baseline.seconds ? Math.round((current.seconds - baseline.seconds) * 1000) : null,
          costUsd: null,
        }
        previous = current
        if (!usage && (current.input || current.output)) events.push({ kind: 'status', text: 'agy supplied cumulative session usage; this turn’s usage cannot be separated yet, so it was not added to totals.' })
      }
      if (Array.isArray(result.denied_actions)) for (const denied of result.denied_actions.slice(0, 100)) {
        const item = record(denied)
        if (typeof item.display_name === 'string') events.push({ kind: 'status', text: `Denied by agy: ${clip(item.display_name, 600)}. Review its native permission rules before retrying; OddBrain did not approve this action.` })
      }
      if (result.status === 'SUCCESS') events.push({ kind: 'done', text: response, alreadyDisplayed: displayed, ...(usage ? { usage } : {}) })
      else {
        if (response && !displayed) events.push({ kind: 'text', text: response })
        const reason = typeof result.error === 'string' && result.error ? result.error : `agy ended with status ${result.status}. The task is not confirmed complete.`
        events.push({ kind: 'error', text: reason, ...(usage ? { usage } : {}) })
      }
      return events
    },
  }
}
