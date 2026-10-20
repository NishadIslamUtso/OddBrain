import { expect, test } from 'vitest'
import { buildGraph, hitNode, newCamera, projectPoint } from '../src/renderer/src/lib/graphScene'
import { DEFAULT_GRAPH, normalizeGraph } from '../src/renderer/src/state/graph'

test('resolved links are deduplicated, self-links do not invent connections, unlinked markdown notes remain visible', () => {
  const scene = buildGraph([{ from: 'a.md', to: 'b.md' }, { from: 'b.md', to: 'a.md' }, { from: 'a.md', to: 'a.md' }], ['a.md', 'b.md', 'lonely.md', 'image.png'], DEFAULT_GRAPH)
  expect(scene.names).toEqual(['a.md', 'b.md', 'lonely.md']); expect(scene.edges).toEqual([[0, 1]]); expect(scene.degrees).toEqual([1, 1, 0])
  expect(buildGraph([], ['lonely.md'], { ...DEFAULT_GRAPH, showOrphans: false }).names).toEqual([])
})
test('the node cap retains the most-connected notes and discloses the actual total', () => {
  const files = Array.from({ length: 450 }, (_, i) => `${i}.md`)
  const edges = files.slice(1).map(to => ({ from: '0.md', to }))
  const scene = buildGraph(edges, files, DEFAULT_GRAPH)
  expect(scene.total).toBe(450); expect(scene.names).toHaveLength(400); expect(scene.names[0]).toBe('0.md'); expect(scene.edges).toHaveLength(399)
  expect(scene.positions.every(Number.isFinite)).toBe(true)
})
test('layout is deterministic, fitted and genuinely three dimensional; 2D has no depth', () => {
  const files = ['one.md', 'two.md', 'three.md', 'four.md'], edges = [{ from: 'one.md', to: 'two.md' }]
  const graph = buildGraph(edges, files, DEFAULT_GRAPH)
  expect(graph.positions).toEqual(buildGraph(edges, files, DEFAULT_GRAPH).positions)
  expect(graph.positions.some((n, i) => i % 3 === 2 && n !== 0)).toBe(true)
  expect([...graph.positions].every(n => Math.abs(n) <= 1)).toBe(true)
  expect(buildGraph(edges, files, { ...DEFAULT_GRAPH, mode: '2d' }).positions.every((n, i) => i % 3 !== 2 || n === 0)).toBe(true)
})
test('perspective makes nearby nodes larger; pan and zoom affect projection', () => {
  const camera = { ...newCamera(), yaw: 0, pitch: 0 }
  expect(projectPoint(.5, 0, 1, camera, '3d', 800, 600).perspective).toBeGreaterThan(projectPoint(.5, 0, -1, camera, '3d', 800, 600).perspective)
  expect(projectPoint(0, 0, 0, { ...camera, x: 30, y: -10 }, '2d', 800, 600)).toMatchObject({ x: 430, y: 290 })
  expect(projectPoint(1, 0, 0, { ...camera, zoom: 2 }, '2d', 800, 600).x).toBeGreaterThan(projectPoint(1, 0, 0, camera, '2d', 800, 600).x)
})
test('hit testing selects the frontmost overlapping node, not whichever was indexed last', () => {
  const points = [{ x: 40, y: 40, depth: 1, radius: 4 }, { x: 40, y: 40, depth: -1, radius: 4 }]
  expect(hitNode(points, 42, 40)).toBe(0); expect(hitNode(points, 80, 80)).toBeNull()
})
test('corrupt and oversized saved preferences cannot break the renderer', () => {
  expect(normalizeGraph(null)).toEqual(DEFAULT_GRAPH)
  expect(normalizeGraph({ nodeSize: Infinity, maxNodes: 90000, mode: 'flat', labels: '<x>', background: 'url(x)', linkOpacity: -3 })).toMatchObject({ nodeSize: 4, maxNodes: 400, mode: '3d', labels: 'hubs', background: DEFAULT_GRAPH.background, linkOpacity: .05 })
})
