import type { WorkflowReview } from './workflows'
export type ScheduleInput = { workflowId: string; intervalMinutes: number; firstAt: number; replaceId?: string; acknowledgeUncertainty?: boolean }
export type ScheduleRecord = { id: string; workflowId: string; workflowName: string; workflowDigest: string; intervalMs: number; nextAt: number; at: string; state: 'enabled' | 'paused' | 'needs-review'; note: string; lastSlot?: number; lastRunId?: string }
export type ScheduleEvent = { id: string; scheduleId: string; workflowName: string; dueAt: number; at: string; state: 'claimed' | 'succeeded' | 'failed' | 'interrupted' | 'missed' | 'blocked'; runId?: string; note: string; acknowledged: boolean }
export type ScheduleReview = { token: string; expiresAt: number; input: ScheduleInput; workflow: WorkflowReview['workflow']; executions: WorkflowReview['executions']; explanation: string }
export type ScheduleBridge = {
  list(): Promise<{ items: ScheduleRecord[]; notice: string }>
  preview(input: ScheduleInput): Promise<ScheduleReview>
  decide(token: string, decision: 'allow' | 'deny'): Promise<{ denied: true } | ScheduleRecord>
  pause(id: string): Promise<void>
  inbox(before?: string): Promise<{ items: ScheduleEvent[]; next: string; notice: string }>
  acknowledge(id: string): Promise<void>
}
