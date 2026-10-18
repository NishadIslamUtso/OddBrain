/**
 * The folder watcher: one watched folder at a time, real fs.watch, events
 * forwarded with their file names. The DECISION to fire lives in the
 * renderer (it owns the send path and the busy flag); this side only sees
 * and reports, bounded — a chatty folder cannot flood the window.
 */
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'

export type WatchTick = { folder: string; names: string[]; at: number }

export type FolderWatcher = {
  start(folder: string): { ok: boolean; answer: string }
  stop(): { ok: boolean; answer: string }
  status(): { folder: string; active: boolean }
}

const MAX_NAMES_PER_TICK = 20

export function createFolderWatcher(onTick: (tick: WatchTick) => void): FolderWatcher {
  let watcher: FSWatcher | null = null
  let folder = ''
  let pending = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = (): void => {
    timer = null
    if (!pending.size) return
    // A DELETION never fires the watcher: fs.watch reports a deleted file's
    // name under 'rename' exactly like a created one, so the truth is checked
    // against the disk — a name with nothing behind it is a deletion (or a
    // rename away) and stays out of the tick. The engine's own note about
    // this rule is backed by exactly this check.
    const names: string[] = []
    for (const name of pending) {
      if (names.length >= MAX_NAMES_PER_TICK) break
      if (!existsSync(join(folder, name))) continue
      names.push(name)
    }
    pending = new Set()
    onTick({ folder, names, at: Date.now() })
  }

  return {
    start(next: string): { ok: boolean; answer: string } {
      if (watcher) this.stop()
      pending = new Set()
      try {
        watcher = watch(next, { recursive: true }, (_event, name) => {
          if (!name) return
          pending.add(name)
          if (!timer) timer = setTimeout(flush, 1_200)
        })
        watcher.on('error', () => {
          this.stop()
        })
        folder = next
        return { ok: true, answer: `Watching ${next}.` }
      } catch (failure) {
        watcher = null
        folder = ''
        return { ok: false, answer: `Could not watch that folder: ${(failure as Error).message}` }
      }
    },
    stop(): { ok: boolean; answer: string } {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (!watcher) return { ok: false, answer: 'Nothing is being watched.' }
      const what = folder
      watcher.close()
      watcher = null
      folder = ''
      pending = new Set()
      return { ok: true, answer: `Stopped watching ${what}.` }
    },
    status: () => ({ folder, active: watcher !== null }),
  }
}

/** Where the watched order's last fire is recorded for the status line. */
export const watchFolderOf = (folder: string): string => join(folder, '')
