import type { WorktreeBridge } from './worktrees'
export type CommandSource = { id: string; name: string; digest: string }
export type SavedCommand = { id: string; name: string; command: string; cwd: string; platform: string; at: string; archived: boolean; digest: string }
export type ShellRequest = { command: string; cwd: string; source?: CommandSource }
export type ShellExecution = { program: string; arguments: string[]; script: string; environmentKeys: string[] }
export type ShellReviewTicket = ShellRequest & { token: string; expiresAt: number; explanation: string; execution?: ShellExecution }
export type ShellResult = { exitCode: number | null; stdout: string; stderr: string; interrupted: boolean; outputComplete: boolean; runId?: string; note?: string }
export type CommandRecord = {
  id: string; at: string; finishedAt?: string; request: ShellRequest; execution: ShellExecution
  state: 'starting' | 'running' | 'finished' | 'interrupted'; exitCode: number | null; signal: string | null
  stdoutBytes: number; stderrBytes: number; stdoutHash?: string; stderrHash?: string
  outputComplete: boolean; note: string
}
export type CommandBridge = {
  saved(before?: string): Promise<{ items: SavedCommand[]; next: string; notice: string }>
  save(input: { name: string; command: string; cwd: string }): Promise<SavedCommand>
  archiveSaved(id: string, archived: boolean): Promise<void>
  previewSaved(id: string): Promise<ShellReviewTicket>
  context(): Promise<{ cwd: string; allowed: boolean; explanation: string; activeId: string | null; activeCount?: number }>
  /** Optional: isolated checkouts, when the desktop app provides them. */
  worktrees?: WorktreeBridge
  preview(request: ShellRequest): Promise<ShellReviewTicket>
  decide(token: string, decision: 'allow' | 'deny'): Promise<{ denied: true } | ShellResult>
  cancel(): Promise<{ requested: boolean; answer: string }>
  history(before?: string): Promise<{ records: CommandRecord[]; next: string; notice: string }>
  read(id: string): Promise<{ record: CommandRecord; result: ShellResult }>
  output(id: string, stream: 'stdout' | 'stderr'): Promise<{ base64: string; name: string }>
}
