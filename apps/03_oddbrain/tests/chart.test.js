import test from 'node:test'
import assert from 'node:assert/strict'
import { chartGeometry, parseChartSpec, wantsChart, MAX_CHART_POINTS } from '../src/shared/lib/chart'
import { systemPrompt } from '../src/shared/lib/ollama'

test('chart blocks validate strictly and reject unsafe or malformed data', () => {
  assert.equal(parseChartSpec('{"type":"bar","title":"Sales","labels":["A","B"],"values":[3,5]}').type, 'bar')
  assert.match(parseChartSpec('not json').error, /not valid JSON/)
  assert.match(parseChartSpec('{"type":"radar","labels":["a"],"values":[1]}').error, /Chart type/)
  assert.match(parseChartSpec('{"type":"bar","labels":["a","b"],"values":[1]}').error, /same length/)
  assert.match(parseChartSpec('{"type":"line","labels":["a"],"values":["1"]}').error, /finite number/)
  assert.match(parseChartSpec('{"type":"bar","labels":[],"values":[]}').error, /1 to 24/)
  const tooMany = JSON.stringify({ type: 'bar', labels: Array(MAX_CHART_POINTS + 1).fill('x'), values: Array(MAX_CHART_POINTS + 1).fill(1) })
  assert.match(parseChartSpec(tooMany).error, /1 to 24/)
  assert.match(parseChartSpec('{"type":"pie","labels":["a","b"],"values":[-1,2]}').error, /negative/)
  assert.match(parseChartSpec('{"type":"pie","labels":["a"],"values":[0]}').error, /positive/)
  const longTitle = parseChartSpec(JSON.stringify({ type: 'line', title: 'T'.repeat(200), labels: ['L'], values: [1] }))
  assert.match(longTitle.error, /Nothing was shortened/)
  const longLabel = parseChartSpec(JSON.stringify({ type: 'line', title: 'T', labels: ['L'.repeat(90)], values: [1] }))
  assert.match(longLabel.error, /Nothing was shortened/)
})

test('bar and line geometry stay inside the drawing area; pie slices sum to a full circle', () => {
  const bars = chartGeometry(parseChartSpec('{"type":"bar","labels":["a","b","c"],"values":[-4,2,8]}'))
  for (const bar of bars.bars) {
    assert.ok(bar.x >= 0 && bar.x + bar.width <= bars.width, 'bar x inside the chart')
    assert.ok(bar.y >= 0 && bar.y + bar.height <= bars.height + 1, 'bar y inside the chart')
  }
  const line = chartGeometry(parseChartSpec('{"type":"line","labels":["a","b"],"values":[1,9]}'))
  assert.equal(line.dots.length, 2)
  assert.ok(line.dots.every(dot => dot.cy >= 0 && dot.cy <= line.height))
  const pie = chartGeometry(parseChartSpec('{"type":"pie","labels":["a","b","c"],"values":[1,1,2]}'))
  const total = pie.slices.reduce((sum, slice) => sum + slice.percent, 0)
  assert.ok(Math.abs(total - 100) < 0.5, `percentages add up (${total})`)
  const whole = chartGeometry(parseChartSpec('{"type":"pie","labels":["only"],"values":[5]}'))
  assert.equal(whole.slices[0].path, null, 'a single 100% slice is drawn as a full circle')
})

test('charts are requested only on explicit chart words, and the prompt includes the chart rule only then', () => {
  assert.equal(wantsChart('make a bar chart of my expenses'), true)
  assert.equal(wantsChart('Hello, how are you?'), false)
  assert.equal(wantsChart('please do not chart this'), false)
  assert.doesNotMatch(systemPrompt(), /```chart/)
  assert.match(systemPrompt(false, true), /exactly one fenced ```chart block/)
})
