import { useSyncExternalStore } from 'react'
import { readStored, writeStored } from '@shared/lib/storage'
import { bridge, isDemo } from '../platform/bridge'

export const QUICK_KEY = 'oddbrain.quickShortcut'
const listeners = new Set<() => void>()
export function readQuickPreference(): boolean { return readStored(QUICK_KEY, true, value => value !== false).value }
function subscribe(notify: () => void): () => void {
  listeners.add(notify)
  const changed = (event: StorageEvent): void => { if (event.key === QUICK_KEY) notify() }
  window.addEventListener('storage', changed)
  return () => { listeners.delete(notify); window.removeEventListener('storage', changed) }
}
export function useQuickPreference(): boolean { return useSyncExternalStore(subscribe, readQuickPreference, () => true) }
export async function setQuickPreference(enabled: boolean): Promise<void> {
  // The main process must accept before the UI says that the hotkey changed.
  if (!isDemo) { const result = await bridge.quick.shortcut(enabled); if (!result.ok) throw new Error('The quick-window shortcut could not be changed.') }
  writeStored(QUICK_KEY, enabled)
  for (const notify of listeners) notify()
}
