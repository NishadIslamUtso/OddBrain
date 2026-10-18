import { DEFAULT_GRAPH, type GraphPreferences } from '../state/graph'
export default function GraphAppearance({ value, onChange }: { value: GraphPreferences; onChange: (next: GraphPreferences) => void }) {
  const set = <K extends keyof GraphPreferences>(key: K, next: GraphPreferences[K]) => onChange({ ...value, [key]: next })
  const range = (key: 'nodeSize' | 'linkWidth' | 'linkOpacity' | 'labelSize' | 'spacing' | 'repulsion' | 'maxNodes', label: string, min: number, max: number, step: number) => <label className="ob-graph-range"><span>{label}<output>{value[key]}</output></span><input type="range" min={min} max={max} step={step} value={value[key]} onChange={e => set(key, Number(e.target.value))} /></label>
  const check = (key: 'useTheme' | 'colorByFolder' | 'showOrphans' | 'autoRotate', label: string) => <label className="ob-graph-check"><input type="checkbox" checked={value[key]} onChange={e => set(key, e.target.checked)} />{label}</label>
  return <aside className="ob-graph-appearance" aria-label="Graph appearance">
    <header><h2>Graph appearance</h2><button type="button" onClick={() => onChange({ ...DEFAULT_GRAPH })}>Reset</button></header>
    <fieldset><legend>Display</legend>
      <label className="ob-graph-field">Labels<select value={value.labels} onChange={e => set('labels', e.target.value as GraphPreferences['labels'])}><option value="hubs">Main connections</option><option value="all">All notes</option><option value="selected">Selected note</option><option value="none">None except selection</option></select></label>
      {range('nodeSize', 'Node size', 1, 12, .5)}{range('labelSize', 'Label size', 9, 18, 1)}{range('linkWidth', 'Link width', .25, 3, .25)}{range('linkOpacity', 'Link opacity', .05, 1, .05)}
    </fieldset>
    <fieldset><legend>Colours</legend>{check('useTheme', 'Use app colours')}{check('colorByFolder', 'Colour nodes by folder')}
      {!value.useTheme && <div className="ob-graph-colors">{(['nodeColor', 'linkColor', 'background', 'highlight'] as const).map((key, i) => <label key={key}>{['Nodes', 'Links', 'Background', 'Selection'][i]}<input type="color" value={value[key]} onChange={e => set(key, e.target.value)} /></label>)}</div>}
    </fieldset>
    <fieldset><legend>Layout</legend>{range('spacing', 'Link spacing', .4, 2, .1)}{range('repulsion', 'Repulsion', .2, 3, .1)}{range('maxNodes', 'Node limit', 50, 400, 50)}{check('showOrphans', 'Include unlinked notes')}{check('autoRotate', 'Rotate 3D view automatically')}<p>Automatic rotation respects reduced motion and Pause.</p></fieldset>
  </aside>
}
