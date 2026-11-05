import type { View } from '@/components/AppNav'

/**
 * viewRoute.ts — where a saved or linked screen name lands today.
 *
 * The standalone Code screen is retired: its session board, folder and
 * linked-file controls live in Projects now. A window that was closed on
 * Code, or a history entry recorded there, must still open somewhere
 * sensible and keep Back working — so the old name resolves to Projects
 * (where the board went) instead of being dropped or crashing the shell.
 * Only the view name is translated; every other part of a saved location
 * (chat, project focus, settings) is preserved untouched, and no native
 * session/resume id is involved in — or harmed by — this mapping.
 */

export const RETIRED_VIEWS: Readonly<Record<string, View>> = Object.freeze({
  code: 'projects',
})

const KNOWN_VIEWS: readonly string[] = ['chat', 'video', 'artifacts', 'today', 'projects', 'vault', 'brain']

/** A screen name from storage, a menu, or a link → the screen to show. */
export function resolveSavedView(value: unknown): View {
  if (typeof value === 'string') {
    if (KNOWN_VIEWS.includes(value)) return value as View
    const retired = Object.prototype.hasOwnProperty.call(RETIRED_VIEWS, value) ? RETIRED_VIEWS[value] : undefined
    if (retired) return retired
  }
  return 'chat'
}

/** One recorded history location, with a retired view translated in place. */
export function migrateHistoryLocation<T extends { view: string }>(location: T): T {
  const resolved = resolveSavedView(location.view)
  return resolved === location.view ? location : { ...location, view: resolved }
}

/** A whole Back stack, oldest first; order and contents otherwise intact. */
export function migrateHistoryStack<T extends { view: string }>(stack: readonly T[]): T[] {
  return stack.map(migrateHistoryLocation)
}
