import type { NativeConversation } from './nativeConversation'
export type WorkQueueStatus = 'queued' | 'held' | 'starting' | 'accepted' | 'canceled' | 'blocked' | 'uncertain'
export type WorkQueueItem = {
  id: string; prompt: string; conversation?: NativeConversation; route: string; authority?: string; at: string
  status: WorkQueueStatus; notice: string; transcriptId?: string; retryOf?: string
  /** Computed by main for the requesting window; never stored as authority. */
  events?: Array<{ at: string; status: WorkQueueStatus; notice: string; transcriptId?: string }>
  eligible?: boolean
}
export type WorkQueueBridge = {
  read(): Promise<WorkQueueItem[]>
  enqueue(prompt: string, conversation?: NativeConversation): Promise<WorkQueueItem[]>
  resume(id: string, acknowledgeUncertain?: boolean): Promise<WorkQueueItem[]>
  hold(id: string): Promise<void>
  cancel(id: string): Promise<WorkQueueItem[]>
  history(before?: string): Promise<{ items: WorkQueueItem[]; next: string }>
}
