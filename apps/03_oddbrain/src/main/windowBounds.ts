/** Electron workArea is already in logical pixels. Do not apply Windows scale twice. */
export function fitWindow(
  workArea: { x: number; y: number; width: number; height: number },
  preferred = { width: 1280, height: 820, minWidth: 940, minHeight: 620 },
): { x: number; y: number; width: number; height: number; minWidth: number; minHeight: number } {
  const width = Math.min(preferred.width, Math.max(1, Math.floor(workArea.width) - 24))
  const height = Math.min(preferred.height, Math.max(1, Math.floor(workArea.height) - 24))
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width, height,
    minWidth: Math.min(preferred.minWidth, width), minHeight: Math.min(preferred.minHeight, height),
  }
}
