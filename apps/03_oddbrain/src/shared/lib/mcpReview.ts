export type McpReview = { token: string; expiresAt: number; changes: Array<{ path: string; diff: string }>; explanation: string }
export type NativeMcpInventory = { files: Array<{ path: string; scope: string; entries: Array<{ name: string; transport: string; endpoint: string; credentialFields: boolean; disabledFlag?: boolean }> }>; notices: string[] }
