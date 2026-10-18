// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mountGraph } from '../src/renderer/src/lib/graphCanvas'
import { buildGraph, newCamera } from '../src/renderer/src/lib/graphScene'
import { DEFAULT_GRAPH } from '../src/renderer/src/state/graph'
let frames: Map<number, FrameRequestCallback>, next: number, canvas: HTMLCanvasElement
let stopped: (() => void) | undefined
beforeEach(() => {
  frames = new Map(); next = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++next, callback); return next })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  canvas = document.createElement('canvas'); document.body.append(canvas)
  Object.defineProperties(canvas, { clientWidth: { value: 800 }, clientHeight: { value: 600 } })
  vi.spyOn(canvas, 'getContext').mockReturnValue({ setTransform() {}, clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}, fillText() {}, measureText() { return { width: 40 } } } as unknown as CanvasRenderingContext2D)
})
afterEach(() => { stopped?.(); stopped = undefined; canvas.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function frame() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(100)) }
function start(autoRotate: boolean, allowMotion: boolean) {
  const prefs = { ...DEFAULT_GRAPH, autoRotate }, scene = buildGraph([{ from: 'a.md', to: 'b.md' }], [], prefs), camera = newCamera()
  const options = { prefs, allowMotion, selected: '', onSelect: vi.fn() }
  const controller = mountGraph(canvas, scene, camera, () => options)!; stopped = controller.dispose
  return { controller, camera, options }
}
test('idle graph draws once and leaves no perpetual animation frame', () => { start(false, true); expect(frames.size).toBe(1); frame(); expect(frames.size).toBe(0) })
test('reduced motion stops autorotation; enabling it resumes only when allowed', () => {
  const { options, controller } = start(true, false); frame(); expect(frames.size).toBe(0)
  options.allowMotion = true; controller.refresh(); frame(); expect(frames.size).toBe(1)
  options.allowMotion = false; frame(); expect(frames.size).toBe(0)
})
test('keyboard orbit, zoom, reset and escape work without pointer input', () => {
  const { camera, options } = start(false, true), initial = camera.yaw
  canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })); expect(camera.yaw).toBeGreaterThan(initial)
  canvas.dispatchEvent(new KeyboardEvent('keydown', { key: '+' })); expect(camera.zoom).toBeGreaterThan(1)
  canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' })); expect(camera).toEqual(newCamera())
  canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); expect(options.onSelect).toHaveBeenCalledWith('')
})
test('disposal cancels rendering and removes keyboard listeners', () => {
  const { controller, camera } = start(true, true); controller.dispose(); expect(frames.size).toBe(0)
  canvas.dispatchEvent(new KeyboardEvent('keydown', { key: '+' })); expect(camera.zoom).toBe(1)
})
