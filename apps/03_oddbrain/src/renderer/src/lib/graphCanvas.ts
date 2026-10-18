import { hitNode, newCamera, projectPoint, type GraphCamera, type GraphScene } from './graphScene'
import type { GraphPreferences } from '../state/graph'
export type GraphRenderOptions = {
  prefs: GraphPreferences
  selected: string
  allowMotion: boolean
  onSelect: (name: string) => void
}
export function mountGraph(
  canvas: HTMLCanvasElement,
  scene: GraphScene,
  camera: GraphCamera,
  options: () => GraphRenderOptions,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  let raf = 0,
    disposed = false,
    visible = true,
    lastTime = 0
  let points: Array<{ x: number; y: number; depth: number; perspective: number; radius: number }> = []
  let drag: { id: number; x: number; y: number; distance: number; pan: boolean } | null = null
  const draw = (time: number): void => {
    raf = 0
    if (disposed || document.hidden || !visible) return
    const { prefs: p, selected, allowMotion } = options()
    const rotate = p.autoRotate && p.mode === '3d' && allowMotion && !drag
    if (rotate && lastTime) camera.yaw += Math.min(40, time - lastTime) * 0.00008
    lastTime = time
    const w = canvas.clientWidth,
      h = canvas.clientHeight,
      ratio = Math.min(2, window.devicePixelRatio || 1)
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.max(1, Math.round(w * ratio))
      canvas.height = Math.max(1, Math.round(h * ratio))
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const css = getComputedStyle(canvas)
    const theme = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
    const ink = p.useTheme ? css.color : p.nodeColor,
      line = p.useTheme ? theme('--color-muted', '#80848d') : p.linkColor
    const backgroundIsLight = p.useTheme
      ? Number((css.color.match(/[\d.]+/g) || ['0'])[0]) < 128
      : parseInt(p.background.slice(1, 3), 16) * 0.299 +
          parseInt(p.background.slice(3, 5), 16) * 0.587 +
          parseInt(p.background.slice(5, 7), 16) * 0.114 >
        150
    const accent = p.useTheme ? theme('--color-accent', '#bc775c') : p.highlight
    if (!p.useTheme) {
      ctx.fillStyle = p.background
      ctx.fillRect(0, 0, w, h)
    }
    const selectedIndex = scene.names.indexOf(selected),
      neighbors = new Set<number>([selectedIndex])
    for (const [a, b] of scene.edges) {
      if (a === selectedIndex) neighbors.add(b)
      if (b === selectedIndex) neighbors.add(a)
    }
    points = scene.names.map((_, i) => {
      const point = projectPoint(
        scene.positions[i * 3],
        scene.positions[i * 3 + 1],
        scene.positions[i * 3 + 2],
        camera,
        p.mode,
        w,
        h,
      )
      return {
        ...point,
        radius: p.nodeSize * (1 + Math.min(1, Math.sqrt(scene.degrees[i]) / 8)) * point.perspective,
      }
    })
    ctx.lineWidth = p.linkWidth
    for (const [a, b] of scene.edges) {
      const active = a === selectedIndex || b === selectedIndex
      ctx.strokeStyle = active ? accent : line
      ctx.globalAlpha = active ? 0.9 : p.linkOpacity * (selectedIndex >= 0 ? 0.3 : 1)
      ctx.beginPath()
      ctx.moveTo(points[a].x, points[a].y)
      ctx.lineTo(points[b].x, points[b].y)
      ctx.stroke()
    }
    const order = points.map((_, i) => i).sort((a, b) => points[a].depth - points[b].depth)
    for (const i of order) {
      const point = points[i],
        active = i === selectedIndex
      ctx.globalAlpha =
        selectedIndex >= 0 && !neighbors.has(i) ? 0.2 : Math.max(0.45, 0.78 + point.depth * 0.2)
      let color = ink
      if (p.colorByFolder) {
        const folder = scene.names[i].split('/').slice(0, -1).join('/') || '/'
        let hash = 0
        for (const char of folder) hash = (hash * 31 + char.charCodeAt(0)) | 0
        color = `hsl(${Math.abs(hash) % 360} 45% ${backgroundIsLight ? 34 : 65}%)`
      }
      ctx.fillStyle = active ? accent : color
      ctx.beginPath()
      ctx.arc(point.x, point.y, point.radius, 0, Math.PI * 2)
      ctx.fill()
      if (active) {
        ctx.globalAlpha = 1
        ctx.strokeStyle = accent
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(point.x, point.y, point.radius + 4, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    ctx.font = `${p.labelSize}px ${css.fontFamily}`
    const labelBoxes: Array<{ x: number; y: number; w: number; h: number }> = []
    const labelOrder = [...order].sort(
      (a, b) =>
        Number(b === selectedIndex) - Number(a === selectedIndex) || points[b].depth - points[a].depth,
    )
    for (const i of labelOrder) {
      const active = i === selectedIndex
      if (!active && (p.labels === 'none' || p.labels === 'selected' || (p.labels === 'hubs' && i >= 10)))
        continue
      if (!active && selectedIndex >= 0 && !neighbors.has(i)) continue
      const point = points[i],
        title = scene.names[i].split('/').at(-1)!.replace(/\.md$/i, '')
      ctx.globalAlpha = active ? 1 : 0.8
      ctx.fillStyle = active ? accent : ink
      const text = title.length > 34 ? `${title.slice(0, 33)}…` : title
      const box = {
        x: point.x + point.radius + 6,
        y: point.y - p.labelSize,
        w: ctx.measureText(text).width + 6,
        h: p.labelSize + 6,
      }
      if (
        !active &&
        p.labels === 'hubs' &&
        labelBoxes.some(
          (other) =>
            box.x < other.x + other.w &&
            box.x + box.w > other.x &&
            box.y < other.y + other.h &&
            box.y + box.h > other.y,
        )
      )
        continue
      labelBoxes.push(box)
      ctx.fillText(text, box.x, point.y + 4)
    }
    ctx.globalAlpha = 1
    if (rotate) refresh()
  }
  const refresh = (): void => {
    if (!disposed && !raf && !document.hidden && visible) raf = requestAnimationFrame(draw)
  }
  const reset = (): void => {
    Object.assign(camera, newCamera())
    refresh()
  }
  const zoom = (factor: number): void => {
    camera.zoom = Math.max(0.25, Math.min(6, camera.zoom * factor))
    refresh()
  }
  const down = (e: PointerEvent): void => {
    if (drag || (e.button !== 0 && e.button !== 2)) return
    canvas.focus()
    drag = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      distance: 0,
      pan: e.shiftKey || e.button === 2 || options().prefs.mode === '2d',
    }
    canvas.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent): void => {
    if (!drag || drag.id !== e.pointerId) return
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y
    drag.distance += Math.hypot(dx, dy)
    drag.x = e.clientX
    drag.y = e.clientY
    if (drag.pan) {
      camera.x += dx
      camera.y += dy
    } else {
      camera.yaw += dx * 0.008
      camera.pitch = Math.max(-1.5, Math.min(1.5, camera.pitch + dy * 0.008))
    }
    refresh()
  }
  const up = (e: PointerEvent): void => {
    if (!drag || drag.id !== e.pointerId) return
    const select = e.type === 'pointerup' && drag.distance < 5 && e.button === 0
    drag = null
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    if (select) {
      const rect = canvas.getBoundingClientRect(),
        hit = hitNode(points, e.clientX - rect.left, e.clientY - rect.top)
      options().onSelect(hit === null ? '' : scene.names[hit])
    }
    refresh()
  }
  const wheel = (e: WheelEvent): void => {
    e.preventDefault()
    zoom(Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * 0.002))
  }
  const key = (e: KeyboardEvent): void => {
    if (e.key === 'Home') reset()
    else if (e.key === '+' || e.key === '=') zoom(1.2)
    else if (e.key === '-') zoom(1 / 1.2)
    else if (e.key === 'Escape') options().onSelect('')
    else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      const x = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0,
        y = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
      if (e.shiftKey || options().prefs.mode === '2d') {
        camera.x += x * 20
        camera.y += y * 20
      } else {
        camera.yaw += x * 0.12
        camera.pitch = Math.max(-1.5, Math.min(1.5, camera.pitch + y * 0.12))
      }
      refresh()
    } else return
    e.preventDefault()
  }
  const contextMenu = (e: Event): void => e.preventDefault()
  const visibility = (): void => {
    lastTime = 0
    if (document.hidden) {
      cancelAnimationFrame(raf)
      raf = 0
    } else refresh()
  }
  const resize = new ResizeObserver(refresh)
  resize.observe(canvas)
  const theme = new MutationObserver(refresh)
  theme.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style', 'class', 'data-theme', 'data-look'],
  })
  const intersection =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((entries) => {
          visible = entries.some((e) => e.isIntersecting)
          lastTime = 0
          if (!visible) {
            cancelAnimationFrame(raf)
            raf = 0
          } else refresh()
        })
      : null
  intersection?.observe(canvas)
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', up)
  canvas.addEventListener('lostpointercapture', up)
  canvas.addEventListener('wheel', wheel, { passive: false })
  canvas.addEventListener('keydown', key)
  canvas.addEventListener('contextmenu', contextMenu)
  document.addEventListener('visibilitychange', visibility)
  refresh()
  return {
    refresh,
    reset,
    zoom,
    dispose: () => {
      disposed = true
      cancelAnimationFrame(raf)
      resize.disconnect()
      theme.disconnect()
      intersection?.disconnect()
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('lostpointercapture', up)
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('keydown', key)
      canvas.removeEventListener('contextmenu', contextMenu)
      document.removeEventListener('visibilitychange', visibility)
    },
  }
}
