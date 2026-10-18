export type GraphPreferences = {
  mode: '3d' | '2d'
  labels: 'selected' | 'hubs' | 'all' | 'none'
  nodeSize: number
  linkWidth: number
  linkOpacity: number
  labelSize: number
  spacing: number
  repulsion: number
  maxNodes: number
  showOrphans: boolean
  autoRotate: boolean
  colorByFolder: boolean
  useTheme: boolean
  nodeColor: string
  linkColor: string
  background: string
  highlight: string
}
export const GRAPH_KEY = 'oddbrain.graph.v1'
export const DEFAULT_GRAPH: GraphPreferences = {
  mode: '3d',
  labels: 'hubs',
  nodeSize: 4,
  linkWidth: 1,
  linkOpacity: 0.35,
  labelSize: 12,
  spacing: 1,
  repulsion: 1,
  maxNodes: 400,
  showOrphans: true,
  autoRotate: false,
  colorByFolder: false,
  useTheme: true,
  nodeColor: '#a0a4af',
  linkColor: '#707581',
  background: '#17181c',
  highlight: '#dc9877',
}
export function normalizeGraph(raw: unknown): GraphPreferences {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const num = (key: keyof GraphPreferences, min: number, max: number): number =>
    typeof value[key] === 'number' && Number.isFinite(value[key])
      ? Math.max(min, Math.min(max, value[key] as number))
      : (DEFAULT_GRAPH[key] as number)
  const flag = (key: keyof GraphPreferences): boolean =>
    typeof value[key] === 'boolean' ? (value[key] as boolean) : (DEFAULT_GRAPH[key] as boolean)
  const color = (key: keyof GraphPreferences): string =>
    typeof value[key] === 'string' && /^#[a-f0-9]{6}$/i.test(value[key] as string)
      ? (value[key] as string)
      : (DEFAULT_GRAPH[key] as string)
  return {
    mode: value.mode === '2d' ? '2d' : '3d',
    labels: ['selected', 'hubs', 'all', 'none'].includes(String(value.labels))
      ? (value.labels as GraphPreferences['labels'])
      : 'hubs',
    nodeSize: num('nodeSize', 1, 12),
    linkWidth: num('linkWidth', 0.25, 3),
    linkOpacity: num('linkOpacity', 0.05, 1),
    labelSize: num('labelSize', 9, 18),
    spacing: num('spacing', 0.4, 2),
    repulsion: num('repulsion', 0.2, 3),
    maxNodes: Math.round(num('maxNodes', 50, 400)),
    showOrphans: flag('showOrphans'),
    autoRotate: flag('autoRotate'),
    colorByFolder: flag('colorByFolder'),
    useTheme: flag('useTheme'),
    nodeColor: color('nodeColor'),
    linkColor: color('linkColor'),
    background: color('background'),
    highlight: color('highlight'),
  }
}
