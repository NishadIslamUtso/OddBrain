/**
 * The brain-host bridge: the SAME interface the renderer already speaks, now
 * backed by a real brain folder over the local Brain Window server.
 *
 * It starts from the demo bridge — which already answers every unknown call
 * with a truthful "needs the desktop app" sentence — and replaces exactly the
 * domains the real screens need with real answers from the brain: the folder
 * choose-and-decide flow, Projects, the Vault structure and link graph, the
 * Review screen's memory workspace, the chat store, and the Memory_OB
 * catalogue. Nothing here invents capability; anything still missing keeps the
 * demo bridge's honest wording.
 */
import type { DesktopBridge } from './bridge'
import type { Project, ProjectReference } from '@shared/lib/projects'

const call = async <T>(op: string, body: Record<string, unknown> = {}): Promise<T> => {
  const response = await fetch(`/api/window/${op}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const reply = await response.json() as T & { ok?: boolean; error?: string }
  if (reply && reply.ok === false && reply.error) throw Error(reply.error)
  return reply
}

export function createBrainHostBridge(demo: DesktopBridge): DesktopBridge {
  return {
    ...demo,
    app: {
      ...demo.app,
      version: 'brain-window',
      platform: 'browser',
      whoami: async () => {
        try { return { name: (await call<{ name?: string }>('app')).name || '' } } catch { return { name: '' } }
      },
    },
    settings: {
      read: async () => {
        const reply = await call<{ settings?: Record<string, unknown> }>('settings')
        return {
          vaultPath: String((reply.settings?.vaultPath as string) || ''),
          cloud: { baseUrl: '', model: '' },
          permissions: {} as never,
        }
      },
      update: async patch => {
        const reply = await call<{ ok: boolean; settings?: Record<string, unknown> }>('settings', { patch })
        // Choosing a folder is the folder-and-decide flow: prepare the folder
        // and make it the live brain immediately.
        if (typeof patch.vaultPath === 'string' && patch.vaultPath.trim()) {
          const applied = await call<{ ok: boolean; root: string; error?: string }>('brain', { action: 'use', path: patch.vaultPath })
          if (!applied.ok) return { ok: false, error: applied.error || 'That folder could not be prepared.' }
        }
        return {
          ok: reply.ok,
          settings: {
            vaultPath: String((reply.settings?.vaultPath as string) || ''),
            cloud: { baseUrl: '', model: '' },
            permissions: {} as never,
          },
        }
      },
    },
    vault: {
      ...demo.vault,
      chooseFolder: async () => {
        // No native dialog in a browser: the owner types or pastes the folder.
        const answer = typeof prompt === 'function' ? prompt('Enter the full path of your memory folder (data folder):') : null
        if (answer === null || !answer.trim()) return null
        const applied = await call<{ ok: boolean; root: string; error?: string }>('brain', { action: 'use', path: answer.trim() })
        if (!applied.ok) throw Error(applied.error || 'That folder could not be prepared.')
        return applied.root
      },
      useDefault: async () => {
        const reply = await call<{ ok: boolean; path?: string; written?: string[]; conflicts?: Array<{ original: string; added: string }>; error?: string }>('vault', { action: 'useDefault' })
        return reply.ok ? { ok: true, path: reply.path, written: reply.written, conflicts: reply.conflicts } : { ok: false, error: reply.error || 'The default folder could not be prepared.' }
      },
    },
    structure: {
      inspect: async root => call('structure', { action: 'inspect', path: root }),
      apply: async (root, options) => call('structure', { action: 'apply', path: root, refresh: options?.refresh === true }),
      resolve: async () => ({ ok: false, error: 'Settling content conflicts needs the desktop app. Nothing was changed.' }),
      linkCheck: async () => {
        const reply = await call<{ files: number; checked: number; dead: Array<{ from: string; target: string }>; ambiguous: Array<{ from: string; target: string; matches: string[] }>; edges: Array<{ from: string; to: string }>; error?: string }>('structure', { action: 'linkCheck' })
        return reply
      },
    },
    projects: {
      read: async () => (await call<{ projects?: Project[] }>('projects')).projects || [],
      write: async (projects: Project[], expected?: Project[]) => {
        const reply = await call<{ ok: boolean; projects?: Project[]; error?: string }>('projects', { projects, expected })
        return { ok: reply.ok === true, projects: reply.projects || projects }
      },
      blank: async (name: string): Promise<Project> => ({
        id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name, instruction: '', folder: '', createdAt: new Date().toISOString(), goals: [], references: [],
      }),
      attach: async (projectId: string): Promise<ProjectReference[]> => {
        const answer = typeof prompt === 'function' ? prompt('Enter the full path of the file to attach to this project:') : null
        if (answer === null || !answer.trim()) return []
        const label = (typeof prompt === 'function' ? prompt('Display name for this reference (leave empty for the file name):') : '') || answer.split(/[\\/]/).pop() || answer
        const includeInContext = typeof confirm === 'function' ? confirm('May this file’s text join chats in this project as context?') : false
        const reference: ProjectReference = { id: `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, path: answer.trim(), label, addedAt: new Date().toISOString(), includeInContext }
        const reply = await call<{ ok: boolean; references?: ProjectReference[]; error?: string }>('projects', { action: 'attach', projectId, reference })
        return reply.references || []
      },
    },
    memoryWorkspace: {
      read: async () => call('memory', { action: 'read' }),
      act: async action => call('memory', { action: 'act', ...(action as Record<string, unknown>) }),
      run: async () => call('memory', { action: 'run' }),
    },
    memoryOb: {
      ...demo.memoryOb,
      read: async () => call('memory', { action: 'read' }),
      project: async (projectId: string) => call('memory', { action: 'project', projectId }),
      search: async input => call('memory', { action: 'search', ...(input as Record<string, unknown>) }),
    },
    chats: {
      ...demo.chats,
      read: async () => call('chats', {}),
    },
  }
}
