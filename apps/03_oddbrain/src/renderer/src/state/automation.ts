import { useEffect, useSyncExternalStore } from 'react'
import { DEFAULT_AUTOMATION, type AutomationPreferences, type AutomationView } from '@shared/lib/automation'
import { getAutomationApi } from '../platform/bridge'
let state: AutomationView = { preferences: { ...DEFAULT_AUTOMATION }, current: null, reports: [], queued: 0, desktop: false }
let error = '', initialized = false, unsubscribe: (() => void) | null = null, version = 0
const listeners = new Set<() => void>()
const emit = (): void => { version++; for (const notify of listeners) notify() }
const receive = (view: AutomationView): void => { state = view; error = ''; emit() }
export async function loadAutomation(): Promise<void> {
  if (!initialized) { initialized = true; unsubscribe = getAutomationApi().onChanged(receive) }
  try { receive(await getAutomationApi().read()) } catch (failure) { error = String((failure as Error).message || failure); emit() }
}
export async function updateAutomation(patch: Partial<AutomationPreferences>): Promise<boolean> {
  try { const result = await getAutomationApi().update(patch); if (!result.ok) throw Error(result.error || 'The preference could not be saved.'); receive(result.view); return true }
  catch (failure) { error = String((failure as Error).message || failure); emit(); return false }
}
export const automationState = (): AutomationView => state
export const automationError = (): string => error
export function useAutomation(): AutomationView & { error: string } {
  useSyncExternalStore(notify => { listeners.add(notify); return () => listeners.delete(notify) }, () => version)
  useEffect(() => { if (!initialized) void loadAutomation() }, [])
  return { ...state, error }
}
export function resetAutomationForTests(): void { unsubscribe?.(); unsubscribe = null; initialized = false; state = { preferences: { ...DEFAULT_AUTOMATION }, current: null, reports: [], queued: 0, desktop: false }; error = ''; emit() }
