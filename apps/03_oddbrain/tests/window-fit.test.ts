import test from 'node:test'
import assert from 'node:assert/strict'
import { FLOOR_HEIGHT, FLOOR_WIDTH, fillsWorkArea, fitWindowToWorkArea } from '../src/shared/lib/windowFit'

/**
 * Every window fits the display it opens on.
 *
 * The numbers here are the owner's real machine, not a convenient round stub:
 * an ASUS TUF A15 panel at 1920x1080 with Windows scaling at 125%, which the
 * operating system reports as a 1536x864 logical desktop, minus the taskbar.
 * Stubbing a display is how a "works" claim reached that machine broken before;
 * asserting against the measured geometry is what makes this check mean
 * something there.
 */

/** 1920x1080 at 125% scaling, taskbar across the bottom. */
const OWNERS_WORK_AREA = { x: 0, y: 0, width: 1536, height: 816 }
const MAIN_WINDOW = { width: 1280, height: 820, minWidth: 940, minHeight: 620 }

test('the main window fits the owner\u2019s display instead of running under the taskbar', () => {
  const fit = fitWindowToWorkArea(OWNERS_WORK_AREA, MAIN_WINDOW)
  // 820 was asked for; 816 is all the room there is. The four pixels are the
  // difference between a reachable resize grip and one under the taskbar.
  assert.equal(fit.height, 816, 'the height is clamped to the usable area')
  assert.equal(fit.width, 1280, 'the width fitted, so it is left exactly as asked')
  assert.equal(fit.x, 128, 'centered in the usable width')
  assert.equal(fit.y, 0, 'and flush to the top of the usable height, which is all of it')
  assert.ok(fit.y + fit.height <= OWNERS_WORK_AREA.height, 'nothing hangs below the work area')
  assert.ok(fit.x + fit.width <= OWNERS_WORK_AREA.width, 'nothing hangs off the right')
  assert.equal(fillsWorkArea(fit, OWNERS_WORK_AREA), true, 'and it reports that it has no spare room')
})

test('the minimums are clamped first, so the window can always be shrunk to fit', () => {
  // A netbook-class panel. The old minimum of 940x620 is wider and taller than
  // the screen: a window that cannot be shrunk to fit keeps its own content
  // permanently out of reach, and no dragging fixes it.
  const small = { x: 0, y: 0, width: 800, height: 560 }
  const fit = fitWindowToWorkArea(small, MAIN_WINDOW)
  assert.equal(fit.minWidth, 800, 'the minimum width comes down to the screen')
  assert.equal(fit.minHeight, 560, 'and so does the minimum height')
  assert.equal(fit.width, 800)
  assert.equal(fit.height, 560)
  assert.ok(fit.minWidth <= fit.width && fit.minHeight <= fit.height, 'a minimum never exceeds the size')
})

test('a display with room to spare changes nothing', () => {
  const big = { x: 0, y: 0, width: 2560, height: 1400 }
  const fit = fitWindowToWorkArea(big, MAIN_WINDOW)
  assert.deepEqual(
    { width: fit.width, height: fit.height, minWidth: fit.minWidth, minHeight: fit.minHeight },
    MAIN_WINDOW,
    'what was asked for is what is given, when it fits',
  )
  assert.equal(fit.x, 640, 'centered')
  assert.equal(fit.y, 290)
  assert.equal(fillsWorkArea(fit, big), false, 'and it knows it has spare room')
})

test('a second monitor opens centered on itself, not on the first', () => {
  // workArea carries its own display's origin; a window placed at 0,0 would
  // land on the primary monitor, which is not where the person is looking.
  const second = { x: 1536, y: 0, width: 1536, height: 816 }
  const fit = fitWindowToWorkArea(second, MAIN_WINDOW)
  assert.equal(fit.x, 1536 + 128, 'centered within the second display')
  assert.equal(fit.y, 0)
  assert.ok(fit.x >= second.x, 'it stays on the monitor it was measured against')
})

test('a monitor above the primary keeps its negative origin', () => {
  const above = { x: 0, y: -816, width: 1536, height: 816 }
  const fit = fitWindowToWorkArea(above, MAIN_WINDOW)
  assert.equal(fit.y, -816, 'the negative origin is honoured, not clamped to zero')
})

test('the other windows are fitted by the same rule', () => {
  // The artifact popout asked for 860 tall — more than the owner's usable 816.
  const popout = fitWindowToWorkArea(OWNERS_WORK_AREA, { width: 760, height: 860 })
  assert.equal(popout.height, 816)
  assert.equal(popout.width, 760)
  assert.equal(popout.minWidth, FLOOR_WIDTH, 'no minimum was asked for, so the floor applies')
  assert.equal(popout.minHeight, FLOOR_HEIGHT)

  // The quick ask window already fitted; it must be left alone.
  const quick = fitWindowToWorkArea(OWNERS_WORK_AREA, { width: 440, height: 620, minWidth: 360, minHeight: 420 })
  assert.deepEqual(
    { width: quick.width, height: quick.height, minWidth: quick.minWidth, minHeight: quick.minHeight },
    { width: 440, height: 620, minWidth: 360, minHeight: 420 },
  )
})

test('a display smaller than the layout floor still gets a window that fits it', () => {
  const tiny = { x: 0, y: 0, width: 200, height: 150 }
  const fit = fitWindowToWorkArea(tiny, MAIN_WINDOW)
  // The floor does not win here, deliberately. Overflowing a display is the
  // exact failure this module exists to prevent, so a panel too small for any
  // real layout still gets a window that fits it. That is a limitation of the
  // panel, not something a bigger window would fix.
  assert.equal(fit.minWidth, 200)
  assert.equal(fit.minHeight, 150)
  assert.equal(fit.width, 200)
  assert.equal(fit.height, 150)
  assert.ok(fit.width <= tiny.width && fit.height <= tiny.height, 'it fits the screen it is on')
})

test('the floor is what a normal display shrinks to when no minimum is asked for', () => {
  const area = { x: 0, y: 0, width: 1536, height: 816 }
  const fit = fitWindowToWorkArea(area, { width: 760, height: 860 })
  assert.equal(fit.minWidth, FLOOR_WIDTH)
  assert.equal(fit.minHeight, FLOOR_HEIGHT)
  assert.ok(FLOOR_WIDTH < area.width && FLOOR_HEIGHT < area.height, 'the floor is below any real display')
})

test('a degenerate or fractional work area cannot produce a broken rectangle', () => {
  const zero = fitWindowToWorkArea({ x: 0, y: 0, width: 0, height: 0 }, MAIN_WINDOW)
  assert.ok(zero.width >= 1 && zero.height >= 1, 'never zero-sized')
  assert.ok(Number.isFinite(zero.x) && Number.isFinite(zero.y))

  // Scaling produces fractional logical sizes; a window at a half pixel blurs.
  const fractional = fitWindowToWorkArea({ x: 0, y: 0, width: 1535.6, height: 815.4 }, MAIN_WINDOW)
  assert.ok(Number.isInteger(fractional.width), 'the width is a whole pixel')
  assert.ok(Number.isInteger(fractional.height), 'and so is the height')
  assert.ok(Number.isInteger(fractional.x) && Number.isInteger(fractional.y), 'and the position')
  assert.equal(fractional.height, 815)
})

test('the fitted size never contradicts itself', () => {
  // Whatever the display, the invariants hold: the minimum is reachable, the
  // size is between the minimum and the display, and the window is on screen.
  const areas = [
    OWNERS_WORK_AREA,
    { x: 0, y: 0, width: 1024, height: 768 },
    { x: 0, y: 0, width: 3840, height: 2160 },
    { x: -1920, y: 0, width: 1920, height: 1080 },
    { x: 0, y: 0, width: 640, height: 480 },
  ]
  for (const area of areas) {
    const fit = fitWindowToWorkArea(area, MAIN_WINDOW)
    assert.ok(fit.minWidth <= fit.width, `min width reachable at ${area.width}x${area.height}`)
    assert.ok(fit.minHeight <= fit.height, `min height reachable at ${area.width}x${area.height}`)
    assert.ok(fit.width <= area.width, `not wider than the room at ${area.width}x${area.height}`)
    assert.ok(fit.height <= area.height, `not taller than the room at ${area.width}x${area.height}`)
    assert.ok(fit.x >= area.x && fit.y >= area.y, 'positioned inside the display origin')
  }
})
