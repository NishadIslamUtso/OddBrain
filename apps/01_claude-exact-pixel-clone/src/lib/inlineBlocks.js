/**
 * inlineBlocks.js — pull fenced visual blocks out of a reply so the transcript
 * can render them instead of showing raw markup.
 *
 * Only well-formed blocks are returned: an SVG must start with <svg>, and a
 * chart is handed to chart.js which validates it and reports an error rather
 * than drawing something wrong.
 */
export function extractFencedBlocks(text = '', language) {
  const pattern = new RegExp('```' + String(language).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n([\\s\\S]*?)```', 'gi')
  const out = []
  for (const match of String(text).matchAll(pattern)) out.push(match[1].trim())
  return out
}

/** First fenced ```svg block that really is an SVG. */
export function extractSvgBlock(text = '') {
  const [first = ''] = extractFencedBlocks(text, 'svg').filter(block => /^<svg[\s>]/i.test(block))
  return first
}

/** Every fenced ```chart block, verbatim; ChartBlock validates each one. */
export function extractChartBlocks(text = '') {
  return extractFencedBlocks(text, 'chart')
}
