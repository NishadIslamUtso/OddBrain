import type { Workspace, WorkspaceReply } from './workspace'

export type VaultFile = { path: string; bytes: number; modified: string; content: string }
export type VaultReply =
  | { ok: true; folder: string; files: VaultFile[]; truncated: boolean }
  | { ok: false; error: string; folder?: string; canceled?: boolean }
export type VaultReadReply = { ok: true; content: string } | { ok: false; error: string }
export type NativeApi = {
  workspace: {
    read(): Promise<WorkspaceReply>
    write(data: Workspace, expectedRevision: number): Promise<WorkspaceReply>
  }
  vault: {
    choose(): Promise<VaultReply>
    list(): Promise<VaultReply>
    read(relativePath: string): Promise<VaultReadReply>
  }
  about(): Promise<{ version: string; platform: string }>
}
