export type ShellRequest = { command: string; cwd: string }
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
  context(): Promise<{ cwd: string; allowed: boolean; explanation: string; activeId: string | null }>
  preview(request: ShellRequest): Promise<ShellReviewTicket>
  decide(token: string, decision: 'allow' | 'deny'): Promise<{ denied: true } | ShellResult>
  cancel(): Promise<{ requested: boolean; answer: string }>
  history(before?: string): Promise<{ records: CommandRecord[]; next: string; notice: string }>
  read(id: string): Promise<{ record: CommandRecord; result: ShellResult }>
  output(id: string, stream: 'stdout' | 'stderr'): Promise<{ base64: string; name: string }>
}
