/**
 * The test stand-in for the `electron` module: just enough surface for the
 * main-process modules a logic test actually imports (ipcGuard's door, not a
 * GUI). Nothing here pretends to be a window — the handlers and guards are
 * exercised as the pure decision points they are.
 */
export const ipcMain = {
  handlers: new Map<string, (event: unknown, ...args: never[]) => unknown>(),
  handle(channel: string, listener: (event: unknown, ...args: never[]) => unknown): void {
    this.handlers.set(channel, listener)
  },
}

export const shell = {
  opened: [] as string[],
  openExternal(url: string): void {
    this.opened.push(url)
  },
}

export type IpcMainInvokeEvent = { senderFrame?: { url: string } }
export type WebContents = Record<string, unknown>
