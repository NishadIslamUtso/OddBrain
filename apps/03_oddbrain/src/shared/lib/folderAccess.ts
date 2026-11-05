export type FolderGrant = {
  id: string; folder: string; purpose: string; projectId: string | null
  createdAt: string; expiresAt: string | null; revokedAt: string | null; sessionOnly: boolean
  read: true; write: boolean; watch: boolean; review: boolean; cloud: boolean; commands: boolean
  receipts: Array<{ at: string; action: 'granted' | 'listed' | 'revoked' | 'expired'; detail: string }>
}
export type FolderAccessState = { version: 1; revision: number; grants: FolderGrant[] }
export type FolderAccessBridge = {
  read(): Promise<{ ok: boolean; state?: FolderAccessState; error?: string }>
  choose(input: { purpose: string; duration: 'session' | 'day' | 'until-revoked'; projectId?: string | null; write?: boolean; watch?: boolean; review?: boolean; cloud?: boolean; commands?: boolean }): Promise<{ ok: boolean; state?: FolderAccessState; answer?: string; error?: string }>
  revoke(id: string): Promise<{ ok: boolean; state?: FolderAccessState; answer?: string; error?: string }>
  list(id: string): Promise<{ ok: boolean; files?: Array<{ path: string; bytes: number; modifiedAt: string }>; capped?: boolean; answer?: string; error?: string }>
}
