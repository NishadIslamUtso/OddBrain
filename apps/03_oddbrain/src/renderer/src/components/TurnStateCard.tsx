import { useEngine } from '../state/engine'
import { modelLabel } from '@shared/lib/engine'

/** One compact answer to: what is OddBrain using, doing, waiting for and keeping? */
export default function TurnStateCard({ chatId }: { chatId?: string }) {
  const engine = useEngine(), turn = engine.turn
  if (!turn || (turn.chatId && chatId && turn.chatId !== chatId)) return null
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
      <dt className="text-muted">Goal</dt><dd>{turn.prompt.slice(0, 240)}{turn.prompt.length > 240 ? '…' : ''}</dd>
      <dt className="text-muted">Using</dt><dd>{turn.engine || engine.settings.id} · {modelLabel(turn.model ?? engine.settings.model)}</dd>
      <dt className="text-muted">Context</dt><dd>{context ? `${context.sources.length} recorded source(s), ${evidence} evidence excerpt(s)${context.omitted?.length ? `, ${context.omitted.length} lower-priority item(s) omitted` : ''}` : 'Preparing or not yet recorded'}</dd>
      <dt className="text-muted">Doing</dt><dd>{doing}</dd>
      <dt className="text-muted">Waiting for</dt><dd>{turn.permissions.length ? `${turn.permissions.length} approval decision${turn.permissions.length === 1 ? '' : 's'}` : 'Nothing from you'}</dd>
      <dt className="text-muted">Result</dt><dd>{turn.state === 'running' ? 'Not finished yet' : turn.state}</dd>
      <dt className="text-muted">Working Notes</dt><dd>{working ? 'Included as visible draft context' : 'No active notes included in this request'}</dd>
      <dt className="text-muted">Memory changes</dt><dd>{context?.overflowRecovery?.observedCapacityTokens ? 'Provider-reported model capacity saved as observed, unless an owner limit exists' : 'No confirmed memory change recorded by this job'}</dd>
    </dl>
  </details>
}
