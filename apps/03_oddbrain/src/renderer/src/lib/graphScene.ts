import type { GraphPreferences } from '../state/graph'
export type GraphEdge = { from: string; to: string }
export type GraphScene = { names: string[]; degrees: number[]; edges: [number, number][]; positions: Float32Array; total: number }
export type GraphCamera = { yaw: number; pitch: number; zoom: number; x: number; y: number }
export const newCamera = (): GraphCamera => ({ yaw: .6, pitch: .3, zoom: 1, x: 0, y: 0 })

/** Resolved links only. Repeated/reciprocal links share one visible edge. */
export function buildGraph(edges: GraphEdge[], files: string[], prefs: GraphPreferences): GraphScene {
  const degrees = new Map<string, number>(), unique = new Map<string, GraphEdge>()
  for (const edge of edges) {
    if (!edge.from || !edge.to) continue
    degrees.set(edge.from, degrees.get(edge.from) ?? 0); degrees.set(edge.to, degrees.get(edge.to) ?? 0)
    if (edge.from === edge.to) continue
    const key = JSON.stringify([edge.from, edge.to].sort())
    if (unique.has(key)) continue
    unique.set(key, edge)
    degrees.set(edge.from, degrees.get(edge.from)! + 1); degrees.set(edge.to, degrees.get(edge.to)! + 1)
  }
  if (prefs.showOrphans) for (const file of files) if (/\.md$/i.test(file)) degrees.set(file, degrees.get(file) ?? 0)
  const names = [...degrees.keys()].sort((a, b) => degrees.get(b)! - degrees.get(a)! || a.localeCompare(b)).slice(0, prefs.maxNodes)
  const index = new Map(names.map((name, i) => [name, i]))
  const pairs: [number, number][] = []
  for (const edge of unique.values()) {
    const a = index.get(edge.from), b = index.get(edge.to)
    if (a !== undefined && b !== undefined) pairs.push([a, b])
  }
  const n = names.length, positions = new Float32Array(n * 3), velocity = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const y = 1 - 2 * (i + .5) / n, angle = i * 2.399963
    const r = prefs.mode === '2d' ? Math.sqrt((i + .5) / n) : Math.sqrt(1 - y * y)
    positions[i * 3] = Math.cos(angle) * r
    positions[i * 3 + 1] = prefs.mode === '2d' ? Math.sin(angle) * r : y
    positions[i * 3 + 2] = prefs.mode === '2d' ? 0 : Math.sin(angle) * r
  }
  // Bounded settling, not perpetual O(n²) work on every animation frame.
  for (let tick = 0; tick < 70; tick++) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = positions[j * 3] - positions[i * 3], dy = positions[j * 3 + 1] - positions[i * 3 + 1], dz = positions[j * 3 + 2] - positions[i * 3 + 2]
      const d2 = dx * dx + dy * dy + dz * dz + .02, force = .001 * prefs.repulsion / (d2 * Math.sqrt(d2))
      velocity[i * 3] -= dx * force; velocity[j * 3] += dx * force
      velocity[i * 3 + 1] -= dy * force; velocity[j * 3 + 1] += dy * force
      velocity[i * 3 + 2] -= dz * force; velocity[j * 3 + 2] += dz * force
    }
    for (const [a, b] of pairs) {
      const dx = positions[b * 3] - positions[a * 3], dy = positions[b * 3 + 1] - positions[a * 3 + 1], dz = positions[b * 3 + 2] - positions[a * 3 + 2]
      const distance = Math.hypot(dx, dy, dz) || .001, force = .035 * (distance - .4 * prefs.spacing) / distance
      velocity[a * 3] += dx * force; velocity[b * 3] -= dx * force
      velocity[a * 3 + 1] += dy * force; velocity[b * 3 + 1] -= dy * force
      velocity[a * 3 + 2] += dz * force; velocity[b * 3 + 2] -= dz * force
    }
    for (let i = 0; i < positions.length; i++) { velocity[i] = velocity[i] * .78 - positions[i] * .008; positions[i] += Math.max(-.12, Math.min(.12, velocity[i])) }
  }
  let extent = .01
  for (let i = 0; i < n; i++) extent = Math.max(extent, Math.hypot(...positions.subarray(i * 3, i * 3 + 3)))
  for (let i = 0; i < positions.length; i++) positions[i] /= extent
  return { names, degrees: names.map(name => degrees.get(name)!), edges: pairs, positions, total: degrees.size }
}
export function projectPoint(x: number, y: number, z: number, camera: GraphCamera, mode: GraphPreferences['mode'], width: number, height: number) {
  let depth = 0
  if (mode === '3d') {
    const rx = x * Math.cos(camera.yaw) - z * Math.sin(camera.yaw), rz = x * Math.sin(camera.yaw) + z * Math.cos(camera.yaw)
    depth = y * Math.sin(camera.pitch) + rz * Math.cos(camera.pitch)
    y = y * Math.cos(camera.pitch) - rz * Math.sin(camera.pitch); x = rx
  }
  const perspective = mode === '3d' ? 3.8 / (3.8 - depth) : 1
  const scale = Math.min(width, height) * .36 * camera.zoom * perspective
  return { x: width / 2 + x * scale + camera.x, y: height / 2 + y * scale + camera.y, depth, perspective }
}
export function hitNode(points: { x: number; y: number; depth: number; radius: number }[], x: number, y: number): number | null {
  let hit: number | null = null
  points.forEach((point, i) => { if (Math.hypot(point.x - x, point.y - y) <= Math.max(9, point.radius + 4) && (hit === null || point.depth > points[hit].depth)) hit = i })
  return hit
}
