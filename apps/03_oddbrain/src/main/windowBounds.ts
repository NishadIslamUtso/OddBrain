/**
 * Renderer-space sizing for the desktop shell.
 *
 * Electron's display bounds are device-independent pixels, so the 1920×1080
 * display at 125% scaling supplied for this build reports about 1536×864.
 * Starting at that logical target uses the available screen; clamping to the
 * work area leaves room for a Windows taskbar or another desktop panel.
 */
export const TARGET_WINDOW = { width: 1536, height: 864 } as const
export const MINIMUM_WINDOW = { width: 940, height: 620 } as const

export function windowBoundsFor(workArea: { width: number; height: number }): {
  width: number
  height: number
  minWidth: number
  minHeight: number
} {
  const width = Number.isFinite(workArea.width) && workArea.width > 0 ? Math.floor(workArea.width) : TARGET_WINDOW.width
  const height = Number.isFinite(workArea.height) && workArea.height > 0 ? Math.floor(workArea.height) : TARGET_WINDOW.height
  return {
    width: Math.min(TARGET_WINDOW.width, width),
    height: Math.min(TARGET_WINDOW.height, height),
    minWidth: Math.min(MINIMUM_WINDOW.width, width),
    minHeight: Math.min(MINIMUM_WINDOW.height, height),
  }
}
