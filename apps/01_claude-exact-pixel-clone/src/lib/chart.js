// Inline chart visualizer. The model writes a ```chart fenced block containing
// JSON; this module validates it and computes SVG geometry. No network, no eval.
export const CHART_TYPES = ['bar', 'line', 'pie']
export const MAX_CHART_POINTS = 24
const CHART_REQUEST = /\b(?:chart|graph|plot|visuali[sz]e|bar\s+chart|pie\s+chart|line\s+chart)\b/i

export function wantsChart(prompt = '') {
  return CHART_REQUEST.test(prompt) && !/\b(?:don't|do not|never)\s+(?:chart|graph|plot|visuali[sz]e)\b/i.test(prompt)
}

export function parseChartSpec(source = '') {
  let data
  try { data = JSON.parse(source) } catch { return { error: 'Chart block is not valid JSON.' } }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'Chart block must be a JSON object.' }
  if (!CHART_TYPES.includes(data.type)) return { error: `Chart type must be one of: ${CHART_TYPES.join(', ')}.` }
  if (!Array.isArray(data.labels) || !Array.isArray(data.values)) return { error: 'Chart needs "labels" and "values" arrays.' }
  if (data.labels.length !== data.values.length) return { error: 'Chart labels and values must have the same length.' }
  if (data.values.length < 1 || data.values.length > MAX_CHART_POINTS) return { error: `Chart needs 1 to ${MAX_CHART_POINTS} points.` }
  if (!data.values.every(value => typeof value === 'number' && Number.isFinite(value))) return { error: 'Every chart value must be a finite number.' }
  if (data.type === 'pie') {
    if (data.values.some(value => value < 0)) return { error: 'Pie chart values cannot be negative.' }
    if (!data.values.some(value => value > 0)) return { error: 'Pie chart needs at least one positive value.' }
  }
  return {
    type: data.type,
    title: typeof data.title === 'string' ? data.title.slice(0, 80) : '',
    labels: data.labels.map(label => String(label).slice(0, 40)),
    values: data.values,
  }
}

const round = value => Math.round(value * 100) / 100

export function chartGeometry(spec, { width = 560, height = 300 } = {}) {
  const { type, labels, values } = spec
  if (type === 'pie') return pieGeometry(spec, width, height)
  const pad = { left: 52, right: 16, top: 24, bottom: 44 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom
  const max = Math.max(0, ...values)
  const min = Math.min(0, ...values)
  const range = max - min || 1
  const y = value => round(pad.top + ((max - value) / range) * plotH)
  const ticks = [0, 1, 2, 3, 4].map(step => {
    const value = max - (range * step) / 4
    return { y: y(value), label: round(value).toString() }
  })
  if (type === 'bar') {
    const slot = plotW / values.length
    const bars = values.map((value, index) => {
      const top = y(Math.max(value, 0)), bottom = y(Math.min(value, 0))
      return { x: round(pad.left + index * slot + slot * 0.2), y: top, width: round(slot * 0.6), height: Math.max(1, round(bottom - top)), label: labels[index], value }
    })
    return { width, height, pad, ticks, bars, points: [], dots: [], slices: [] }
  }
  const step = values.length > 1 ? plotW / (values.length - 1) : 0
  const dots = values.map((value, index) => ({ cx: round(pad.left + (values.length > 1 ? index * step : plotW / 2)), cy: y(value), label: labels[index], value }))
  return { width, height, pad, ticks, bars: [], dots, points: dots.map(dot => `${dot.cx},${dot.cy}`).join(' '), slices: [] }
}

function pieGeometry(spec, width, height) {
  const { labels, values } = spec
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0)
  const cx = width / 2, cy = height / 2, r = Math.min(width, height) / 2 - 24
  let angle = -Math.PI / 2
  const slices = values.map((value, index) => {
    const share = Math.max(0, value) / total
    const sweep = share * Math.PI * 2
    const start = angle, end = angle + sweep
    angle = end
    const largeArc = sweep > Math.PI ? 1 : 0
    const point = a => `${round(cx + r * Math.cos(a))} ${round(cy + r * Math.sin(a))}`
    const path = share >= 0.9999
      ? null
      : `M ${round(cx)} ${round(cy)} L ${point(start)} A ${round(r)} ${round(r)} 0 ${largeArc} 1 ${point(end)} Z`
    return { path, label: labels[index], value, percent: Math.round(share * 1000) / 10, index }
  })
  return { width, height, pad: { left: 0, right: 0, top: 0, bottom: 0 }, ticks: [], bars: [], dots: [], points: '', slices, cx, cy, r }
}
