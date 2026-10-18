import { useSyncExternalStore } from 'react'
import { engineStore } from './engine'
import { getAutomationApi } from '../platform/bridge'
import { automationState, useAutomation } from './automation'
import type { ReviewRecord } from '@shared/lib/automation'
import type { ReviewVerdict } from '@shared/lib/review'

/** Both automatic and manual reviews use the main process's tool-free text
 * transport. A review never replaces the work turn, sends an agent command,
 * answers a permission card or causes the turn-done hook to run. */
export type ReviewState = { running: boolean; verdict: ReviewVerdict | null; line: string; error: string; record?: ReviewRecord }
let running = false, error = '', manual: ReviewRecord | undefined, version = 0
const listeners = new Set<() => void>()
const emit = (): void => { version++; for (const notify of listeners) notify() }
function describe(record?: ReviewRecord): string {
  if (!record || record.state !== 'done') return ''
  const outcome = record.verdict?.kind === 'clean' ? 'the model said CLEAN' : `${record.verdict?.kind === 'issues' ? record.verdict.lines.length : 0} findings`
  return `Review (${record.model}): ${outcome} for “${record.prompt.slice(0, 80)}”. Text evidence only; no app tools or approvals were available.`
}
export async function runReview(): Promise<boolean> {
  if (running || automationState().current) return false
  const turn = engineStore().turn
  if (!turn) { error = 'There is no finished work here to review yet.'; emit(); return false }
  if (turn.state === 'running') { error = 'Wait for the work to finish before reviewing it.'; emit(); return false }
  const answer = turn.items.filter(item => item.kind === 'text').map(item => 'text' in item ? item.text : '').join('\n')
  if (!answer.trim()) { error = 'There is no completed answer to review.'; emit(); return false }
  running = true; error = ''; emit()
  try {
    const result = await getAutomationApi().review({ prompt: turn.prompt, answer })
    if (!result.ok || !result.record) throw Error(result.error || 'The review did not complete.')
    manual = result.record; return true
  } catch (failure) { error = String((failure as Error).message || failure); return false }
  finally { running = false; emit() }
}
export const clearReviewError = (): void => { error = ''; emit() }
export function reviewState(): ReviewState {
  const view = automationState(), latest = view.reports[0]
  const record = latest && (!manual || latest.at >= manual.at) ? latest : manual
  return { running: running || !!view.current, verdict: record?.verdict || null, line: describe(record), error, record }
}
export function useReview(): ReviewState {
  useAutomation()
  useSyncExternalStore(notify => { listeners.add(notify); return () => listeners.delete(notify) }, () => version)
  return reviewState()
}
