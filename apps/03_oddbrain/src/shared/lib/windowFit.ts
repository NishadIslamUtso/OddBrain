/**
 * Fitting a window inside the space the display actually offers.
 *
 * The owner's machine is a 1920x1080 panel at 125% Windows scaling, which the
 * operating system reports as a 1536x864 logical desktop — and the taskbar
 * takes a slice of even that, so the usable work area is shorter still. A
 * window created at a fixed 820 pixels tall is then taller than the room it
 * has: its bottom edge, its resize grip and whatever sits there go under the
 * taskbar and cannot be reached. The same happens on any smaller panel, on a
 * projector, or the moment the scaling changes.
 *
 * So no window is created at a bare number. Each one asks for the size it
 * wants and gets back the size that fits, centered in the usable area of the
 * display it is actually on.
 *
 * This is pure arithmetic on a rectangle, on purpose: it can be tested against
 * real geometry rather than against a stubbed display, and the stub is what let
 * a "works" claim reach the owner's machine broken twice before.
 */

/** The usable part of a display: what is left after the taskbar and dock. */
export type WorkArea = { x: number; y: number; width: number; height: number }

export type WantedWindow = {
  width: number
  height: number
  minWidth?: number
  minHeight?: number
}

export type FittedWindow = {
  x: number
  y: number
  width: number
  height: number
  minWidth: number
  minHeight: number
}

/**
 * The smallest a window is normally shrunk to. A display smaller than this
 * wins anyway: fitting the screen matters more than holding a layout floor,
 * because a window that overflows its own display is precisely the failure this
 * module exists to prevent, and an unusable sliver of a too-small panel is a
 * problem with the panel rather than something this code can improve.
 */
export const FLOOR_WIDTH = 320
export const FLOOR_HEIGHT = 220

const clamp = (value: number, low: number, high: number): number =>
  high < low ? low : Math.min(Math.max(Math.round(value), low), high)

/**
 * The size and position a window should actually be created with.
 *
 * The minimums are clamped FIRST, and that order is the point. A minimum
 * larger than the display is the worse failure: the window cannot be shrunk to
 * fit, so its own content stays permanently out of reach and no amount of
 * dragging by the person fixes it. Clamping the minimum first guarantees the
 * window can always be made to fit the screen it is on.
 */
export function fitWindowToWorkArea(workArea: WorkArea, wanted: WantedWindow): FittedWindow {
  const areaWidth = Math.max(1, Math.round(workArea.width))
  const areaHeight = Math.max(1, Math.round(workArea.height))
  const floorWidth = Math.min(FLOOR_WIDTH, areaWidth)
  const floorHeight = Math.min(FLOOR_HEIGHT, areaHeight)

  const minWidth = clamp(wanted.minWidth ?? floorWidth, floorWidth, areaWidth)
  const minHeight = clamp(wanted.minHeight ?? floorHeight, floorHeight, areaHeight)
  const width = clamp(wanted.width, minWidth, areaWidth)
  const height = clamp(wanted.height, minHeight, areaHeight)

  // Centered in the usable area. workArea carries its own display's origin, so
  // a window opened on a second monitor is centered there and not on the first.
  const x = Math.round(workArea.x + (areaWidth - width) / 2)
  const y = Math.round(workArea.y + (areaHeight - height) / 2)

  return { x, y, width, height, minWidth, minHeight }
}

/**
 * True when the fitted window is the whole usable area in at least one axis —
 * the case worth knowing about, because it means the layout has no spare room
 * and has to compact rather than assume it can grow.
 */
export function fillsWorkArea(fitted: FittedWindow, workArea: WorkArea): boolean {
  return fitted.width >= Math.round(workArea.width) || fitted.height >= Math.round(workArea.height)
}
