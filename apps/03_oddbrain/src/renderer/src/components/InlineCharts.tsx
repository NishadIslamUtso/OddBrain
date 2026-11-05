import { chartGeometry, parseChartSpec } from '@shared/lib/chart'
import { extractChartBlocks } from '@shared/lib/inlineBlocks'
import type { ChartSpec } from '@shared/types'

const COLOURS = ['var(--color-accent)', 'var(--color-ok)', 'var(--color-warn)', 'var(--color-muted)', 'var(--color-ink)', 'var(--color-line)']

function Chart({ spec }: { spec: ChartSpec }): React.JSX.Element {
  const geometry = chartGeometry(spec)
  return <figure className="my-3 rounded-xl border border-line bg-card p-3" aria-label={`${spec.type} chart${spec.title ? `: ${spec.title}` : ''}`}>
    {spec.title ? <figcaption className="mb-2 text-[13px] font-medium text-ink">{spec.title}</figcaption> : null}
    <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} role="img" className="h-auto max-h-[320px] w-full" aria-label={`${spec.type} chart with ${spec.values.length} data points`}>
      {spec.type !== 'pie' ? <>
        {geometry.ticks.map(tick => <g key={`${tick.y}:${tick.label}`}><line x1={geometry.pad.left} x2={geometry.width - geometry.pad.right} y1={tick.y} y2={tick.y} stroke="var(--color-line)" /><text x={geometry.pad.left - 6} y={tick.y + 4} textAnchor="end" fill="var(--color-muted)" fontSize="11">{tick.label}</text></g>)}
        {geometry.bars.map((bar, index) => <g key={`${bar.label}:${index}`}><rect x={bar.x} y={bar.y} width={bar.width} height={bar.height} rx="3" fill="var(--color-accent)" /><title>{bar.label}: {bar.value}</title><text x={bar.x + bar.width / 2} y={geometry.height - 16} textAnchor="middle" fill="var(--color-muted)" fontSize="10">{bar.label}</text></g>)}
        {spec.type === 'line' ? <><polyline points={geometry.points} fill="none" stroke="var(--color-accent)" strokeWidth="3" />{geometry.dots.map((dot, index) => <g key={`${dot.label}:${index}`}><circle cx={dot.cx} cy={dot.cy} r="4" fill="var(--color-accent)" /><title>{dot.label}: {dot.value}</title><text x={dot.cx} y={geometry.height - 16} textAnchor="middle" fill="var(--color-muted)" fontSize="10">{dot.label}</text></g>)}</> : null}
      </> : geometry.slices.map(slice => slice.path ? <path key={slice.index} d={slice.path} fill={COLOURS[slice.index % COLOURS.length]}><title>{slice.label}: {slice.value} ({slice.percent}%)</title></path> : <circle key={slice.index} cx={geometry.cx} cy={geometry.cy} r={geometry.r} fill={COLOURS[slice.index % COLOURS.length]}><title>{slice.label}: {slice.value} ({slice.percent}%)</title></circle>)}
    </svg>
    <details><summary className="text-[11px] text-muted">Exact chart data</summary><table className="mt-2 w-full text-left text-[11px]"><thead><tr><th>Label</th><th>Value</th></tr></thead><tbody>{spec.labels.map((label, index) => <tr key={`${label}:${index}`}><td>{label}</td><td>{spec.values[index]}</td></tr>)}</tbody></table></details>
  </figure>
}

export default function InlineCharts({ text }: { text: string }): React.JSX.Element | null {
  const blocks = extractChartBlocks(text)
  if (!blocks.length) return null
  return <>{blocks.map((block, index) => {
    const parsed = parseChartSpec(block)
    return 'error' in parsed
      ? <p key={index} role="status" className="my-2 text-[12px] text-warn">Chart not drawn: {parsed.error} The original block remains available when you copy the answer.</p>
      : <Chart key={index} spec={parsed} />
  })}</>
}
