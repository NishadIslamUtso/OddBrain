/**
 * What an agent is allowed to do.
 *
 * This is the one place permissions are shaped, so the main process that enforces
 * them and the window that sets them cannot drift apart. Every permission here
 * governs something that exists today and is checked where it happens — a switch
 * with nothing behind it would be a lie with a nice colour.
 *
 * The defaults are the answers that need no explanation: a local model answers,
 * a local vault keeps, and a browser extension that is not installed can do
 * nothing anyway. Nothing online is allowed by having a key alone; a key is a
 * credential, and these are decisions.
 */
import { CLOUD_PROVIDERS } from './providers'

export type Permissions = {
  /** The model on this machine may answer questions. */
  local: boolean
  /** The browser extension may post captures to this app's extension port. */
  browserCapture: boolean
  /** A finished conversation may be written into the vault as Markdown. */
  keepConversations: boolean
  /**
   * Providers that may answer online. Absent means "not switched off": saving a
   * key is what turns a provider on, and switching it off here keeps the key —
   * removing a key and stopping its use are different things.
   */
  cloud: Record<string, boolean>
}

export const DEFAULT_PERMISSIONS: Permissions = {
  local: true,
  browserCapture: true,
  keepConversations: true,
  cloud: {},
}

const PROVIDER_IDS = CLOUD_PROVIDERS.map(provider => provider.id)

/** Anything unreadable becomes the default, never a crash and never a yes. */
export function normalizePermissions(value: unknown): Permissions {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const cloud: Record<string, boolean> = {}
  const rawCloud = (raw.cloud && typeof raw.cloud === 'object' ? raw.cloud : {}) as Record<string, unknown>
  for (const [id, allowed] of Object.entries(rawCloud)) {
    // A provider this app does not know, or a value that is not a boolean, is
    // dropped: the list stays exactly as long as the providers that exist.
    if (PROVIDER_IDS.includes(id) && typeof allowed === 'boolean') cloud[id] = allowed
  }
  const flag = (key: keyof Permissions): boolean =>
    typeof raw[key] === 'boolean' ? (raw[key] as boolean) : (DEFAULT_PERMISSIONS[key] as boolean)
  return {
    local: flag('local'),
    browserCapture: flag('browserCapture'),
    keepConversations: flag('keepConversations'),
    cloud,
  }
}

/**
 * May this provider answer? A key it does not have is always a no; a provider
 * switched off in Settings is a no even when the key is still saved.
 */
export function cloudEnabled(permissions: Permissions, id: string, hasKey: boolean): boolean {
  return hasKey && permissions.cloud[id] !== false
}

/** The permission names that exist, for a test or a sentence to count. */
export const PERMISSION_NAMES = ['local', 'browserCapture', 'keepConversations'] as const
