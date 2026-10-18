/** BrowserWindow bounds are device-independent pixels. Electron's workArea is
 * also in DIP, so never multiply it by the Windows display scaling factor.
 * Keep the entire native frame inside the usable area (not the display size):
 * the taskbar and window decorations take real space at 125% scaling. */
export type WorkArea = { x: number; y: number; width: number; height: number }
export type WindowSize = { width: number; height: number; minWidth?: number; minHeight?: number }

export function fitWindowToWorkArea(area: WorkArea, preferred: WindowSize, inset = 16): Required<WindowSize> & { x: number; y: number } {
  const freeWidth = Math.max(1, Math.floor(area.width) - inset * 2)
  const freeHeight = Math.max(1, Math.floor(area.height) - inset * 2)
  const width = Math.min(Math.floor(preferred.width), freeWidth)
  const height = Math.min(Math.floor(preferred.height), freeHeight)
  return {
    width,
    height,
    minWidth: Math.min(preferred.minWidth ?? width, width),
    minHeight: Math.min(preferred.minHeight ?? height, height),
    x: Math.floor(area.x + (area.width - width) / 2),
    y: Math.floor(area.y + (area.height - height) / 2),
  }
}
