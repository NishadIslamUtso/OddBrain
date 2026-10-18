/** All values are Electron logical pixels, already adjusted for display scaling. */
export function windowBounds(workArea: { width: number; height: number }, quick = false): { width: number; height: number; minWidth: number; minHeight: number } {
  const width = Math.max(1, Math.floor(workArea.width)), height = Math.max(1, Math.floor(workArea.height))
  return { width: Math.min(quick ? 440 : 1280, width), height: Math.min(quick ? 620 : 820, height), minWidth: Math.min(quick ? 360 : 940, width), minHeight: Math.min(quick ? 420 : 620, height) }
}
