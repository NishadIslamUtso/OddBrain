import { useSyncExternalStore } from 'react'
import { getEngineApi } from '@/platform/bridge'
import { engineStore, subscribeEngine } from './engine'
import { buildMemoryOrder, MEMORY_DIR, type MemoryFile, type MemoryTrashFile } from '@shared/lib/memory'

/**
 * Auto memory, orchestrated. The pass is ONE normal turn: the order asks the
 * engine to note what matters into the vault's memory file — through its own
 * Write/Edit tools, which means through this app's permission cards, a
 * visible diff before anything lands (his rule: the engine may write, but in
 * the open). The pane lists what exists; removal is recoverable and per file.
 */

export type MemoryState = {
  files: MemoryFile[]
  trash: MemoryTrashFile[]
  folder: string
  loaded: boolean
  running: boolean
  status: string
  error: string
}

let state: MemoryState = {
  files: [],
  trash: [],
  folder: '',
  loaded: false,
  running: false,
  status: '',
  error: '',
}

const listeners = new Set<() => void>()
let version = 0

const emit = (): void => {
  version += 1
  for (const listener of listeners) listener()
}

const patch = (part: Partial<MemoryState>): void => {
  state = { ...state, ...part }
  emit()
}

export async function loadMemory(): Promise<void> {
  try {
    const [answer, trash] = await Promise.all([getEngineApi().memory.list(), getEngineApi().memory.listTrash()])
    if (!answer.ok) throw Error(answer.answer || 'Memory could not be read.')
    if (!trash.ok) throw Error(trash.answer || 'Recoverable memory Trash could not be read.')
    patch({ files: answer.files ?? [], trash: trash.files ?? [], folder: answer.folder ?? trash.folder ?? '', loaded: true, error: '' })
  } catch (failure) { patch({ error: String((failure as Error).message || failure), loaded: true }) }
}

/**
 * Run a memory pass: the order goes through the one send path; the engine's
 * writes ride the cards. The turn must be finished first, like any work.
 */
export async function runMemoryPass(): Promise<boolean> {
  if (state.running) return false
  const store = engineStore()
  if (store.turn?.state === 'running') {
    patch({ error: 'Wait for the current work to finish before a memory pass.' })
    return false
  }
  patch({ running: true, error: '' })
  const sent = await store.send(buildMemoryOrder(state.folder))
  if (!sent.ok) {
    patch({ running: false, error: sent.answer })
    return false
  }
  const owned = store.turn
  let off: (() => void) | undefined
  const finished = (): void => {
    if (store.turn !== owned) { off?.(); off = undefined; patch({ running: false, status: 'The displayed task changed; refresh memory to see the files.' }); return }
    if (owned?.state === 'running') return
    off?.(); off = undefined
    void loadMemory().then(() => patch({ running: false, status: 'The memory pass finished; the actual files were refreshed.' }))
  }
  off = subscribeEngine(finished)
  patch({ status: 'The pass was sent. Writes still use the normal approval policy.' })
  finished()
  return true
}

export async function removeMemory(name: string): Promise<boolean> {
  const answer = await getEngineApi().memory.remove(name, state.folder)
  if (!answer.ok) {
    patch({ error: answer.answer })
    return false
  }
  await loadMemory()
  patch({ status: answer.answer, error: '' })
  return true
}

export async function restoreMemory(id: string): Promise<boolean> {
  const answer = await getEngineApi().memory.restore(id, state.folder)
  if (!answer.ok) {
    patch({ error: answer.answer })
    return false
  }
  await loadMemory()
  patch({ status: answer.answer, error: '' })
  return true
}

export const clearMemoryNotice = (): void => patch({ status: '', error: '' })

export const memoryState = (): MemoryState => state

export function useMemory(): MemoryState {
  useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => version,
  )
  return state
}

export { MEMORY_DIR }

export async function chooseMemoryFolder(useDefault = false): Promise<boolean> {
  const api = getEngineApi().memory
  const method = useDefault ? api.defaultFolder : api.chooseFolder
  if (!method) { patch({ error: 'This build has no memory-folder picker.' }); return false }
  const result = await method()
  if (!result.ok) { if (!('canceled' in result && result.canceled)) patch({ error: result.answer }); return false }
  await loadMemory(); patch({ status: result.answer, error: '' }); return true
}
