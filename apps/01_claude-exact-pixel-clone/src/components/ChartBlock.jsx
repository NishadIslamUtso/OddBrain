import { chartGeometry, parseChartSpec } from '../lib/chart.js'
const PALETTE = ['#D97757', '#5B8DEF', '#6BBF59', '#E5B454', '#A77BDB', '#E06C9F', '#4FB8B0', '#8C8C8C']
export default function ChartBlock({ source }) {
  const spec = parseChartSpec(source)
  if (spec.error) return <div className="chart-block chart-error" role="note"><p>Chart could not be drawn: {spec.error}</p><pre>{source}</pre></div>
  const geo = chartGeometry(spec)
  const label = spec.title || `${spec.type} chart`
  return <figure className="chart-block" data-chart-type={spec.type}>
    {spec.title && <figcaption>{spec.title}</figcaption>}
    <svg viewBox={`0 0 ${geo.width} ${geo.height}`} role="img" aria-label={label} className="chart-svg">
      {spec.type === 'pie' ? geo.slices.map(slice => slice.path
        ? <path key={slice.index} d={slice.path} fill={PALETTE[slice.index % PALETTE.length]} stroke="var(--composer, #1a1a1a)" strokeWidth="1.5"><title>{`${slice.label}: ${slice.value} (${slice.percent}%)`}</title></path>
        : <circle key={slice.index} cx={geo.cx} cy={geo.cy} r={geo.r} fill={PALETTE[slice.index % PALETTE.length]}><title>{`${slice.label}: ${slice.value} (${slice.percent}%)`}</title></circle>)
      : <>
        {geo.ticks.map((tick, index) => <g key={index}><line x1={geo.pad.left} x2={geo.width - geo.pad.right} y1={tick.y} y2={tick.y} className="chart-grid" /><text x={geo.pad.left - 6} y={tick.y + 4} textAnchor="end" className="chart-tick">{tick.label}</text></g>)}
        {spec.type === 'bar' && geo.bars.map((bar, index) => <rect key={index} x={bar.x} y={bar.y} width={bar.width} height={bar.height} fill={PALETTE[0]} rx="3"><title>{`${bar.label}: ${bar.value}`}</title></rect>)}
        {spec.type === 'bar' && geo.bars.map((bar, index) => <text key={`l${index}`} x={bar.x + bar.width / 2} y={geo.height - geo.pad.bottom + 16} textAnchor="middle" className="chart-tick">{bar.label}</text>)}
        {spec.type === 'line' && <polyline points={geo.points} fill="none" stroke={PALETTE[0]} strokeWidth="2.5" strokeLinejoin="round" />}
        {spec.type === 'line' && geo.dots.map((dot, index) => <g key={index}><circle cx={dot.cx} cy={dot.cy} r="4" fill={PALETTE[0]}><title>{`${dot.label}: ${dot.value}`}</title></circle><text x={dot.cx} y={geo.height - geo.pad.bottom + 16} textAnchor="middle" className="chart-tick">{dot.label}</text></g>)}
      </>}
    </svg>
    <ul className="chart-legend">{(spec.type === 'pie' ? geo.slices.map(slice => ({ label: slice.label, value: slice.value, color: PALETTE[slice.index % PALETTE.length] })) : spec.labels.map((item, index) => ({ label: item, value: spec.values[index], color: PALETTE[0] }))).map((item, index) => <li key={index}><i style={{ background: item.color }} />{item.label}: {item.value}</li>)}</ul>
  </figure>
}
