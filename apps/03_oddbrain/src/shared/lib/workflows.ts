import type { ShellExecution } from './commands'
export type WorkflowMode = 'serial' | 'parallel-worktrees'
export type WorkflowStep = { name: string; command: string }
export type WorkflowDefinition = { id: string; name: string; cwd: string; platform: string; steps: WorkflowStep[]; at: string; archived: boolean; digest: string; /** Missing on older definitions and treated as serial. */ mode?: WorkflowMode }
export type WorkflowWorktree = { path: string; baseRevision: string; headRevision?: string; retained: boolean; changed?: boolean; statusBytes?: number; statusEntries?: number; statusSha256?: string; note: string }
export type WorkflowStepResult = WorkflowStep & { state: 'pending' | 'starting' | 'succeeded' | 'failed' | 'interrupted' | 'skipped'; runId?: string; exitCode?: number | null; note?: string; worktree?: WorkflowWorktree }
export type WorkflowRun = { id: string; workflow: WorkflowDefinition; at: string; finishedAt?: string; state: 'running' | 'succeeded' | 'failed' | 'interrupted'; steps: WorkflowStepResult[]; note: string; scheduleId?: string; dueAt?: number; isolation?: { repositoryRoot: string; baseRevision: string; maxConcurrency: 2 } }
export type WorkflowReview = { token: string; workflow: WorkflowDefinition; executions: ShellExecution[]; expiresAt: number; explanation: string; isolation?: { repositoryRoot: string; baseRevision: string; maxConcurrency: 2 } }
export type WorkflowBridge = {
  list(before?: string): Promise<{ items: WorkflowDefinition[]; next: string; notice: string }>
  save(input: { name: string; cwd: string; steps: WorkflowStep[]; mode?: WorkflowMode }): Promise<WorkflowDefinition>
  archive(id: string, archived: boolean): Promise<void>
  preview(id: string): Promise<WorkflowReview>
  decide(token: string, decision: 'allow' | 'deny'): Promise<{ denied: true } | WorkflowRun>
  cancel(): Promise<{ requested: boolean; answer: string }>
  runs(before?: string): Promise<{ records: WorkflowRun[]; next: string; notice: string }>
  readRun(id: string): Promise<WorkflowRun>
}
