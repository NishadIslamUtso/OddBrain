import { useEngine } from '../state/engine'
import { modelLabel } from '@shared/lib/engine'
import type { Chat, Message } from '@shared/types'

const clip = (text: string): string => text.length > 240 ? `${text.slice(0, 240)}…` : text

/** One compact answer to: what is OddBrain using, doing, waiting for and keeping? */
export default function TurnStateCard({ chat }: { chat?: Chat | null }) {
  const engine = useEngine(), turn = engine.turn
  const messages = chat?.messages || []
  let assistantIndex = -1
  for (let index = messages.length - 1; index >= 0; index--) if (messages[index].role === 'assistant' && messages[index].origin !== 'import') { assistantIndex = index; break }
  const latestAssistant = assistantIndex >= 0 ? messages[assistantIndex] : undefined
  const native = !!turn && (!turn.chatId || !chat?.id || turn.chatId === chat.id) && (turn.state === 'running' || !latestAssistant || latestAssistant.nativeRecord?.transcriptId === turn.transcriptId)
  if (native && turn) {
    const latest = turn.items.at(-1)
    const doing = turn.permissions.length
      ? 'Waiting for your approval'
      : turn.state === 'running'
        ? latest?.kind === 'tool' ? `Using ${latest.name}` : latest?.kind === 'status' ? latest.text : 'Generating a response'
        : turn.state === 'done' ? 'Completed' : 'Stopped with an error'
    const context = turn.context
    const working = context?.sources.some(source => source.id === 'working-notes')
    const evidence = context?.sources.filter(source => source.role === 'untrusted-reference').length || 0
    return <details className="ob-control-scope" open={turn.state === 'running'}>
      <summary>Job state · {doing}</summary>
      <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-1 text-[12px]">
        <dt className="text-muted">Goal</dt><dd>{clip(turn.prompt)}</dd>
        <dt className="text-muted">Using</dt><dd>{turn.engine || engine.settings.id} · {modelLabel(turn.model ?? engine.settings.model)}</dd>
        <dt className="text-muted">Context</dt><dd>{context ? `${context.sources.length} recorded source(s), ${evidence} evidence excerpt(s)${context.retrieval ? `, ${context.retrieval.mode === 'app-first' ? 'app-first retrieval' : 'owner-sent follow-up retrieval'}${context.retrieval.stage ? ` stage ${context.retrieval.stage.number}/${context.retrieval.stage.total}` : ''}${context.retrieval.localSemantic === 'local-distributional-v1' ? ', local semantic expansion on' : ''}` : ''}${context.omitted?.length ? `, ${context.omitted.length} lower-priority item(s) omitted` : ''}` : 'Preparing or not yet recorded'}</dd>
        <dt className="text-muted">Doing</dt><dd>{doing}</dd>
        <dt className="text-muted">Waiting for</dt><dd>{turn.permissions.length ? `${turn.permissions.length} approval decision${turn.permissions.length === 1 ? '' : 's'}` : 'Nothing from you'}</dd>
        <dt className="text-muted">Result</dt><dd>{turn.state === 'running' ? 'Not finished yet' : turn.state}</dd>
        <dt className="text-muted">Working Notes</dt><dd>{working ? 'Included as visible draft context' : 'No active notes included in this request'}</dd>
        <dt className="text-muted">Memory changes</dt><dd>{context?.overflowRecovery?.observedCapacityTokens ? 'Provider-reported model capacity saved as observed, unless an owner limit exists' : 'No confirmed memory change recorded by this job'}</dd>
      </dl>
    </details>
  }
  if (assistantIndex < 0) return null
  const assistant = messages[assistantIndex] as Message, receipt = assistant.contextReceipt
  const goal = [...messages.slice(0, assistantIndex)].reverse().find(message => message.role === 'user')?.content || 'Stored chat request'
  const running = assistant.status === 'streaming'
  const doing = running ? assistant.stage || 'Generating a response' : assistant.status === 'error' ? 'Stopped with an error' : assistant.status === 'stopped' ? 'Stopped' : 'Completed'
  const notes = receipt?.workingNotes || 'none'
  return <details className="ob-control-scope" open={running}>
    <summary>Job state · {doing}</summary>
    <dl className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-1 text-[12px]">
      <dt className="text-muted">Goal</dt><dd>{clip(goal)}</dd>
      <dt className="text-muted">Using</dt><dd>chat model · {modelLabel(assistant.model || '')}</dd>
      <dt className="text-muted">Context</dt><dd>{receipt ? `${receipt.includedMessages} entry/entries included, ${receipt.omitted.length} lower-priority item(s) omitted, ${receipt.capacity.source} capacity` : running ? 'Preparing or not yet recorded' : 'Older turn without a context receipt'}</dd>
      <dt className="text-muted">Doing</dt><dd>{doing}</dd>
      <dt className="text-muted">Waiting for</dt><dd>Nothing; direct chat has no app-action approvals</dd>
      <dt className="text-muted">Result</dt><dd>{running ? 'Not finished yet' : assistant.status || 'complete'}</dd>
      <dt className="text-muted">Working Notes</dt><dd>{notes === 'included-draft' ? 'Included as visible draft context' : notes === 'omitted-draft' ? 'Omitted for the visible context budget; stored revision unchanged' : 'No active notes included in this request'}</dd>
      <dt className="text-muted">Memory changes</dt><dd>No confirmed memory change recorded by this job</dd>
    </dl>
  </details>
}
