import { useSyncExternalStore } from 'react'
import { getEngineApi } from '@/platform/bridge'
import { engineStore, subscribeEngine } from './engine'
import { buildMemoryOrder, MEMORY_DIR, type MemoryFile } from '@shared/lib/memory'

/**
 * Auto memory, orchestrated. The pass is ONE normal turn: the order asks the
 * engine to note what matters into the vault's memory file — through its own
 * Write/Edit tools, which means through this app's permission cards, a
 * visible diff before anything lands (his rule: the engine may write, but in
 * the open). The pane lists what exists; deleting is real and per file.
 */

export type MemoryState = {
  files: MemoryFile[]
  folder: string
  loaded: boolean
  running: boolean
  status: string
  error: string
}

let state: MemoryState = {
  files: [],
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

export async function loadMemory(): Promise<boolean> {
  try {
    const answer = await getEngineApi().memory.list()
    if (!answer.ok) {
      patch({ files: [], folder: answer.folder ?? state.folder, loaded: true, error: answer.answer || 'Memory could not be read.' })
      return false
    }
    patch({ files: answer.files ?? [], folder: answer.folder ?? '', loaded: true, error: answer.answer || '' })
    return true
  } catch (failure) {
    patch({ files: [], error: String((failure as Error).message || failure), loaded: true })
    return false
  }
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
    void loadMemory().then(refreshed => patch({
      running: false,
      status: refreshed ? 'The pass ended; current files were refreshed. Check the turn to confirm what was written.' : 'The pass ended, but memory could not be refreshed.',
    }))
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
  const refreshed = await loadMemory()
  patch({ status: refreshed ? answer.answer : `${answer.answer} The folder could not be refreshed.` })
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
  const refreshed = await loadMemory()
  patch({ status: refreshed ? result.answer : `${result.answer} This folder could not be read.` })
  return refreshed
}
