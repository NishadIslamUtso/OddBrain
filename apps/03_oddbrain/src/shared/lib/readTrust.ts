export const READ_TRUST_MODES = ['file', 'turn', 'project', 'folder'] as const
export type ReadTrustMode = (typeof READ_TRUST_MODES)[number]

export type ReadTrustRule = {
  id: string
  mode: ReadTrustMode
  engine: 'claude-code' | 'agy'
  workspace: string
  scope: string
  projectId?: string
  turnId?: string
  createdAt: string
  /** Present only in a recovery view; never persisted or auto-applied. */
  active?: false
}

export type ReadTrustView = {
  rules: ReadTrustRule[]
  notice?: string
}

export type ReadApprovalScopes = {
  file: string
  folder: string
  workspace: string
  project: boolean
}

export type ReadTrustBridge = {
  list: () => Promise<{ ok: boolean; view?: ReadTrustView; error?: string }>
  approve: (requestId: string, mode: ReadTrustMode) => Promise<{ ok: boolean; answer: string; view?: ReadTrustView }>
  revoke: (id: string) => Promise<{ ok: boolean; answer: string; view?: ReadTrustView }>
  migrateLegacy: (raw: string | null) => Promise<{ ok: boolean; answer: string; view?: ReadTrustView }>
  onChanged?: (listener: () => void) => () => void
}
