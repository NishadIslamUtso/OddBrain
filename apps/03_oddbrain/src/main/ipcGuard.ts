/**
 * One door, checked twice.
 *
 * The renderer is our own build, but a renderer cannot be trusted to STAY
 * ours: a clicked citation link, a bad artifact, a future bug — any of them
 * can point the window somewhere else. Electron runs the preload again for
 * the new page, which would hand the app's whole IPC surface to whatever
 * origin the window landed on. So the surface travels with a lock: every
 * handler registered through this module refuses any caller whose page is
 * not one the app itself loaded.
 */
import { ipcMain, shell, type IpcMainInvokeEvent, type WebContents } from 'electron'

type Listener = (event: IpcMainInvokeEvent, ...args: never[]) => unknown

/**
 * The pinned pages, as PARSED origins — never string prefixes. A prefix would
 * happily accept `http://127.0.0.1:PORT@evil.example/` (the app's address as
 * URL user-info, the attacker's actual host) and every `file:` URL on disk.
 * Origin comparison accepts none of that: user-info fails, nearby ports are
 * different origins, and a file URL must be the app's own, exactly.
 */
const ownOriginSet = new Set<string>()
const ownFileUrls = new Set<string>()

/**
 * Pin the only pages IPC may ever come from. Called when the windows are
 * created, with every URL the app itself loads. file: pages are pinned by
 * their exact URL, not by scheme.
 */
export function pinOwnOrigins(urls: Array<string | undefined | null>): void {
  // Additive on purpose: windows are created at different times (the quick
  // window can open before the API exists), and pinning one must never wipe
  // another's trust. Tests start from resetOwnOrigins().
  for (const raw of urls) {
    if (typeof raw !== 'string' || raw.length === 0) continue
    try {
      const parsed = new URL(raw)
      if (parsed.protocol === 'file:') {
        ownFileUrls.add(parsed.href.split('#')[0])
      } else if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        ownOriginSet.add(parsed.origin)
      }
      // Any other scheme is simply never pinned: the app does not load it.
    } catch {
      // Not a URL — pinning it would be a lie. Skipped.
    }
  }
}

/** A fresh slate — the tests' beginning, not the app's per-window ritual. */
export function resetOwnOrigins(): void {
  ownOriginSet.clear()
  ownFileUrls.clear()
}

/**
 * The one origin check, used by BOTH the IPC wrapper and navigation lockdown
 * so the two doors can never disagree. Parses the candidate and compares
 * components; a string prefix is not a trust decision.
 */
export function urlIsOurs(url: string): boolean {
  if (typeof url !== 'string' || url.length === 0) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol === 'file:') {
    return ownFileUrls.has(parsed.href.split('#')[0])
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  // User-info in any form means the visible host text is not the real host.
  // The app never builds such a URL, so one arriving here is someone else's.
  if (parsed.username !== '' || parsed.password !== '') return false
  return ownOriginSet.has(parsed.origin)
}

/**
 * ipcMain.handle, but every caller is checked. Registering a handler any
 * other way is a review finding, not a style choice.
 */
export function handle(channel: string, listener: Listener): void {
  ipcMain.handle(channel, (event, ...args) => {
    const url: string = event.senderFrame?.url ?? ''
    if (!urlIsOurs(url)) {
      throw new Error(`OddBrain refused "${channel}" from a page it did not load (${url || 'no url'}).`)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (listener as (event: IpcMainInvokeEvent, ...args: any[]) => unknown)(event, ...(args as never[]))
  })
}

/** True when the URL may open in the person's real browser: plain web links. */
export function safeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Navigation lockdown for an app window: pages the app loaded may load again;
 * anything else is bounced to the real browser when it is a plain web link
 * and refused when it is not. A citation link can therefore never walk the
 * app window off its own origin — it opens in the browser, where it belonged.
 */
export function lockNavigation(contents: WebContents, allowExternal = true): void {
  contents.setWindowOpenHandler(({ url }) => {
    // Model-authored artifact windows pass false: their scripts may not turn an
    // automatic window.open into a trusted browser launch. App-authored windows
    // retain normal citation-link behavior.
    if (allowExternal && safeExternalUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (urlIsOurs(url)) return
    event.preventDefault()
    if (allowExternal && safeExternalUrl(url)) void shell.openExternal(url)
  })
}
