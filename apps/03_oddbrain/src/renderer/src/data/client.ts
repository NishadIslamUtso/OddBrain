import {
  emptyWorkspace,
  validateWorkspace,
  type Workspace,
  type WorkspaceReply,
} from '../../../shared/workspace'
import type { NativeApi, VaultReadReply, VaultReply } from '../../../shared/desktop'

const KEY = 'oddbrain-ui-first:v1'
const browserLocation = 'This browser only (not the desktop app)'
export const isDesktop = (): boolean => typeof window !== 'undefined' && Boolean(window.oddbrain)

/** A browser preview can keep real local records, but cannot claim machine access. */
export function createBrowserClient(storage: Storage): NativeApi {
  const read = async (): Promise<WorkspaceReply> => {
    try {
      const raw = storage.getItem(KEY)
      if (!raw) return { ok: true, data: emptyWorkspace(), revision: 0, location: browserLocation }
      const envelope: unknown = JSON.parse(raw)
      if (
        !envelope ||
        typeof envelope !== 'object' ||
        !('revision' in envelope) ||
        !Number.isSafeInteger(envelope.revision) ||
        (envelope.revision as number) < 0 ||
        !('data' in envelope)
      )
        throw new Error('Browser workspace header is damaged.')
      return {
        ok: true,
        revision: envelope.revision as number,
        data: validateWorkspace(envelope.data),
        location: browserLocation,
      }
    } catch (failure) {
      return {
        ok: false,
        error: `Browser data cannot be read. It was not replaced. ${(failure as Error).message}`,
      }
    }
  }
  return {
    workspace: {
      read,
      write: async (data: Workspace, expectedRevision: number): Promise<WorkspaceReply> => {
        const current = await read()
        if (!current.ok) return current
        if (current.revision !== expectedRevision)
          return { ok: false, error: 'Browser data changed in another tab. Reload before saving.' }
        try {
          const checked = validateWorkspace(data),
            revision = expectedRevision + 1
          storage.setItem(KEY, JSON.stringify({ revision, data: checked }))
          return { ok: true, data: checked, revision, location: browserLocation }
        } catch (failure) {
          return { ok: false, error: `Browser storage refused the write: ${(failure as Error).message}` }
        }
      },
    },
    vault: {
      choose: async (): Promise<VaultReply> => ({
        ok: false,
        error: 'Folder access needs the installed desktop app. Nothing was selected.',
      }),
      list: async (): Promise<VaultReply> => ({
        ok: false,
        error: 'The browser preview cannot read your files.',
      }),
      read: async (): Promise<VaultReadReply> => ({
        ok: false,
        error: 'The browser preview cannot read your files.',
      }),
    },
    about: async () => ({ version: 'browser preview', platform: 'browser' }),
  }
}

export const client = (): NativeApi => window.oddbrain ?? createBrowserClient(window.localStorage)
