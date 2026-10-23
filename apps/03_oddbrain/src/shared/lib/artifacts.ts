import type { Artifact, ArtifactType } from '../types'

/** What the caller knows about the reply an artifact came from. */
export type ArtifactOptions = {
  requested?: boolean
  messageId?: string
  chatId?: string
  title?: string
  /** Stable origin time for transcript recovery; defaults to now for live replies. */
  createdAt?: string
  includePartial?: boolean
}

export function wantsArtifact(prompt: string, explicitlyEnabled = false): boolean {
  if (explicitlyEnabled) return true
  if (/\b(?:don't|do not|never)\s+(?:create|make|build|generate|write)\b/i.test(prompt)) return false
  if (/\b(?:explain|how (?:do|can|to)|what is|review|debug)\b/i.test(prompt)) return false
  return /\b(?:create|build|make|generate|write|design|implement)\b[\s\S]{0,100}\b(?:artifact|html|website|web\s*(?:page|app)|application|interactive|game|dashboard|calculator|chart|visuali[sz]er)\b/i.test(prompt)
}

const FENCE = /```(html|svg)\s*\r?\n([\s\S]*?)(?:```|$)/gi

/**
 * Artifacts found in a reply, including one that is still being written.
 *
 * `partial` marks a fenced block whose closing fence has not arrived yet. The
 * artifact panel renders those live, which is the difference between watching a
 * blank panel for a minute and watching the app build itself. A partial entry is
 * never saved to chat history — only the finished one is.
 */
export function artifactsIn(
  content: string,
  { requested, messageId, chatId, title, createdAt = new Date().toISOString(), includePartial = false }: ArtifactOptions = {}
): Artifact[] {
  if (!requested || typeof content !== 'string') return []
  const artifacts: Artifact[] = []
  for (const match of content.matchAll(FENCE)) {
    const source = match[2].replace(/\s+$/, '')
    if (!source.trim()) continue
    const closed = match[0].trimEnd().endsWith('```')
    if (!closed && !includePartial) continue
    if (source.length > 200_000) continue
    const type = match[1].toLowerCase() as ArtifactType
    const htmlTitle = source.match(/<title>([^<]{1,100})<\/title>/i)?.[1]
    artifacts.push({
      id: `${messageId}-artifact-${artifacts.length}`, chatId, messageId, type,
      title: htmlTitle || String(title || '').slice(0, 60) || (type === 'html' ? 'HTML Application' : 'SVG Image'),
      createdAt, partial: !closed,
      versions: closed ? [{ content: source, savedAt: createdAt }] : [{ content: source, savedAt: createdAt, draft: true }],
    })
  }
  // A model that answers with a document and no fence still produced an artifact.
  if (!artifacts.length) {
    const trimmed = content.trimStart()
    const looksWhole = /^<!doctype html/i.test(trimmed) || /^<html\b/i.test(trimmed)
    const unfinished = looksWhole && !/<\/html>\s*$/i.test(trimmed)
    if (looksWhole && (includePartial || !unfinished) && trimmed.length <= 200_000) {
      const htmlTitle = trimmed.match(/<title>([^<]{1,100})<\/title>/i)?.[1]
      artifacts.push({
        id: `${messageId}-artifact-0`, chatId, messageId, type: 'html',
        title: htmlTitle || String(title || '').slice(0, 60) || 'HTML Application',
        createdAt, partial: unfinished,
        versions: [{ content: trimmed, savedAt: createdAt, ...(unfinished ? { draft: true } : {}) }],
      })
    }
  }
  return artifacts
}

export function extractArtifacts(content: string, options: ArtifactOptions = {}): Artifact[] {
  return artifactsIn(content, { ...options, includePartial: false })
}

/** Finished artifacts for chat history, plus the live ones for the panel. */
export function extractStreamingArtifacts(content: string, options: ArtifactOptions = {}): Artifact[] {
  return artifactsIn(content, { ...options, includePartial: true })
}

export const artifactSource = (artifact: Artifact, version?: number): string =>
  artifact.versions[version ?? artifact.versions.length - 1]?.content || ''

/** Interactive plus the inline visualizer: charts, click-to-pick, live reload. */
/**
 * Marks elements the app itself puts into a preview — currently the outline drawn
 * around whatever the pointer is over.
 *
 * It has to exist because those elements are children of the document body, and
 * an element path is a list of child indices. Appending the outline to the body
 * shifts the index of everything after it, so a click on the first button reports
 * "the second child", and the rewrite lands on the wrong element. That is exactly
 * the bug this constant fixes: the index must count the document's own elements,
 * not the app's furniture.
 */
export const PREVIEW_CHROME_ATTRIBUTE = 'data-ai-assistant-chrome'

/**
 * The index path from the document body down to this element.
 *
 * Written to be self-contained — no imports, no outer references — because the
 * preview script injects this exact function into the frame, so the code that
 * reports a pick and the code that applies a rewrite cannot disagree about what a
 * path means. It is exported so it can be tested directly.
 */
export function elementPath(element: Element): number[] {
  const path: number[] = []
  let node: Element | null = element
  while (node && node.parentElement && node !== node.ownerDocument.body) {
    const siblings = Array.prototype.filter.call(
      node.parentElement.children,
      (child: Element) => !child.hasAttribute('data-ai-assistant-chrome')
    ) as Element[]
    path.unshift(siblings.indexOf(node))
    node = node.parentElement
  }
  return path
}

export function previewScript(channel: string): string {
  return `<script>
(function () {
  var channel = ${JSON.stringify(channel).replace(/</g, '\\u003c')};
  var post = function (message) { parent.postMessage(Object.assign({ channel: channel }, message), '*'); };
  var report = function (message) { post({ type: 'ai-assistant-artifact-error', message: String(message).slice(0, 500) }); };
  addEventListener('error', function (event) { report(event.message); });
  addEventListener('unhandledrejection', function (event) { report((event.reason && event.reason.message) || event.reason); });
  addEventListener('click', function (event) {
    if (picking) return;
    var link = event.target && event.target.closest && event.target.closest('a');
    if (link && !(link.getAttribute('href') || '').startsWith('#')) event.preventDefault();
  }, true);

  /* ---------- inline visualizer ---------- */
  var COLORS = ['#d48264', '#6f9ecb', '#8fbb8f', '#c9a468', '#b18cc9', '#69b8b3', '#cb7f8f', '#9aa36f'];
  function size(canvas) {
    var ratio = Math.min(3, window.devicePixelRatio || 1);
    var width = Math.max(240, Math.round((canvas.clientWidth || canvas.parentNode && canvas.parentNode.clientWidth) || 420));
    var height = Math.max(120, Math.round(canvas.clientHeight || Number(canvas.getAttribute('height')) || width * 0.45));
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
    }
    var context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    return { context: context, width: width, height: height };
  }
  function seriesOf(spec) {
    if (Array.isArray(spec.series) && spec.series.length) return spec.series.map(function (entry, i) {
      return { name: entry.name || 'Series ' + (i + 1), data: (entry.data || []).map(Number), color: entry.color || COLORS[i % COLORS.length] };
    });
    return [{ name: spec.title || 'Value', data: (spec.data || []).map(Number), color: spec.color || COLORS[0] }];
  }
  function render(target, spec) {
    var canvas = typeof target === 'string' ? document.querySelector(target) : target;
    if (!canvas || !canvas.getContext) return null;
    var box = size(canvas), context = box.context, width = box.width, height = box.height;
    var series = seriesOf(spec || {}), labels = (spec && spec.labels) || [];
    var type = (spec && spec.type) || 'bar';
    var pad = { top: spec && spec.title ? 26 : 12, right: 12, bottom: labels.length ? 26 : 12, left: 34 };
    var plotW = Math.max(10, width - pad.left - pad.right), plotH = Math.max(10, height - pad.top - pad.bottom);
    context.font = '11px system-ui, sans-serif';
    context.textBaseline = 'middle';
    if (spec && spec.title) { context.fillStyle = '#444'; context.fillText(String(spec.title), pad.left, 13); }
    if (type === 'pie' || type === 'doughnut') {
      var values = series[0].data, total = values.reduce(function (a, b) { return a + Math.max(0, b); }, 0) || 1, start = -Math.PI / 2;
      var radius = Math.min(plotW, plotH) / 2, clockwise = type === 'doughnut';
      context.save(); context.translate(pad.left + plotW / 2, pad.top + plotH / 2);
      values.forEach(function (value, index) {
        var slice = (Math.max(0, value) / total) * Math.PI * 2;
        context.beginPath(); context.moveTo(0, 0); context.arc(0, 0, radius, start, start + slice); context.closePath();
        context.fillStyle = series[0].color && values.length === 1 ? series[0].color : COLORS[index % COLORS.length]; context.fill();
        if (clockwise) { context.globalCompositeOperation = 'destination-out'; context.beginPath(); context.arc(0, 0, radius * 0.55, 0, Math.PI * 2); context.fill(); context.globalCompositeOperation = 'source-over'; }
        start += slice;
      });
      context.restore();
      labels.slice(0, 8).forEach(function (label, index) {
        var x = pad.left + 6 + (index % 4) * (plotW / 4), y = pad.top + plotH - 8 - Math.floor(index / 4) * 14;
        context.fillStyle = COLORS[index % COLORS.length]; context.fillRect(x, y - 4, 8, 8);
        context.fillStyle = '#555'; context.fillText(String(label).slice(0, 12), x + 11, y);
      });
      return canvas;
    }
    var max = Math.max.apply(null, series.reduce(function (all, entry) { return all.concat(entry.data, [0]); }, []));
    var min = Math.min.apply(null, series.reduce(function (all, entry) { return all.concat(entry.data, [0]); }, []));
    var span = (max - min) || 1;
    context.strokeStyle = '#e6e2dc'; context.lineWidth = 1;
    for (var line = 0; line <= 4; line += 1) {
      var y = pad.top + (plotH / 4) * line;
      context.beginPath(); context.moveTo(pad.left, y + 0.5); context.lineTo(pad.left + plotW, y + 0.5); context.stroke();
      context.fillStyle = '#999'; context.fillText(String(Math.round(max - (span / 4) * line)), 4, y);
    }
    var count = Math.max.apply(null, series.map(function (entry) { return entry.data.length; })) || 1;
    var step = plotW / Math.max(1, count);
    if (type === 'line') {
      series.forEach(function (entry) {
        context.strokeStyle = entry.color; context.lineWidth = 2; context.beginPath();
        entry.data.forEach(function (value, index) {
          var x = pad.left + step * index + step / 2, y = pad.top + plotH - ((value - min) / span) * plotH;
          index ? context.lineTo(x, y) : context.moveTo(x, y);
        });
        context.stroke();
        entry.data.forEach(function (value, index) {
          var x = pad.left + step * index + step / 2, y = pad.top + plotH - ((value - min) / span) * plotH;
          context.fillStyle = entry.color; context.beginPath(); context.arc(x, y, 3, 0, Math.PI * 2); context.fill();
        });
      });
    } else {
      var barW = Math.max(3, (step * 0.7) / series.length);
      series.forEach(function (entry, sIndex) {
        entry.data.forEach(function (value, index) {
          var x = pad.left + step * index + (step - barW * series.length) / 2 + barW * sIndex;
          var barH = Math.max(1, ((value - Math.min(0, min)) / span) * plotH);
          context.fillStyle = entry.color;
          context.fillRect(x, pad.top + plotH - barH, barW, barH);
        });
      });
    }
    context.fillStyle = '#777';
    labels.slice(0, 12).forEach(function (label, index) {
      if (count > 1 && index % Math.ceil(count / 12) !== 0) return;
      context.fillText(String(label).slice(0, 10), pad.left + step * index + 2, pad.top + plotH + 13);
    });
    return canvas;
  }
  function renderAll() {
    var nodes = document.querySelectorAll('canvas[data-chart]');
    for (var index = 0; index < nodes.length; index += 1) {
      var raw = nodes[index].getAttribute('data-chart');
      if (!raw) continue;
      try { render(nodes[index], JSON.parse(raw)); } catch (error) { report('Chart ' + (index + 1) + ': ' + error.message); }
    }
  }
  window.AIAssistant = { chart: render, renderCharts: renderAll, colors: COLORS };
  addEventListener('DOMContentLoaded', renderAll);
  var resizeTimer;
  addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderAll, 120); });
  setTimeout(renderAll, 0);

  /* ---------- click to pick (comment mode) ---------- */
  var picking = false, outlined = null, outline = null;
  var pathOf = ${String(elementPath)};
  function target(event) {
    var element = event.target;
    if (element === outline) return null;
    if (!element || element === document.documentElement || element === document.body) return null;
    return element.closest ? element : null;
  }
  function paint(element) {
    if (outlined === element) return;
    outlined = element;
    if (!element) { if (outline) outline.remove(); return; }
    if (!outline) {
      outline = document.createElement('div');
      outline.setAttribute('data-ai-assistant-chrome', '');
      outline.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #d48264;background:#d4826418;border-radius:3px;transition:all .06s linear';
      document.body.appendChild(outline);
    }
    var box = element.getBoundingClientRect();
    outline.style.left = box.left + 'px'; outline.style.top = box.top + 'px';
    outline.style.width = box.width + 'px'; outline.style.height = box.height + 'px';
    outline.style.display = 'block';
  }
  function label(element) {
    var text = (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 70);
    return { tag: element.tagName.toLowerCase(), id: element.id || '', classes: (element.className || '').toString().slice(0, 80), text: text };
  }
  function setMode(mode) {
    picking = mode === 'pick';
    document.body.style.cursor = picking ? 'crosshair' : '';
    if (!picking) paint(null);
    if (outline) outline.style.display = picking ? 'block' : 'none';
  }
  addEventListener('mousemove', function (event) { if (picking) paint(target(event)); }, true);
  addEventListener('click', function (event) {
    if (!picking) return;
    var element = target(event);
    if (!element) return;
    event.preventDefault(); event.stopPropagation();
    var box = element.getBoundingClientRect();
    if (element.outerHTML.length > 4000) { post({ type: 'ai-assistant-artifact-error', message: 'That element exceeds 4,000 characters. Choose a smaller element; nothing was shortened.' }); return; }
    post({
      type: 'oddbrain-pick', path: pathOf(element), outerHTML: element.outerHTML,
      width: Math.round(box.width), height: Math.round(box.height), picked: label(element),
    });
  }, true);
  addEventListener('keydown', function (event) {
    if (picking && event.key === 'Escape') { setMode('browse'); post({ type: 'oddbrain-pick-cancelled' }); }
  }, true);
  addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.channel !== channel) return;
    if (data.type === 'ai-assistant-mode') setMode(data.mode);
  });
  post({ type: 'ai-assistant-ready', charts: document.querySelectorAll('canvas[data-chart]').length });
})();
</script>`
}

/**
 * Give an artifact a real design language.
 *
 * The tokens are plain CSS custom properties. They are injected first so the
 * artifact's own rules still win, and a source that already declares a
 * variable keeps its value instead of being overridden.
 */
export function withDesignTokens(source: string, tokens = ''): string {
  const value = String(source || '')
  if (!tokens || !tokens.trim()) return value
  const style = `<style id="ai-design-tokens">${tokens}</style>`
  const headIndex = value.search(/<\/head\s*>/i)
  if (headIndex > -1) {
    return value.slice(0, headIndex) + style + value.slice(headIndex)
  }
  // A fragment, not a document: the variables still resolve, they just have
  // to be declared before anything that uses them.
  return style + value
}

/**
 * A full document gets the preview's head inserted into its OWN head; a fragment
 * gets wrapped.
 *
 * Wrapping a whole document is the mistake this avoids, and it is worth spelling
 * out because the result looked fine. Given
 * `<html><head><style>…</style></head><body><button>…` placed inside another
 * body, the HTML parser drops the inner `<html>`, `<head>` and `<body>` tags and
 * keeps the style — as a child of the OUTER body. The frame then has one more
 * element before the content than the document does, so an element path taken
 * from the frame points one element too far along when the same path is applied
 * to the source. Clicking a button edited the element beside it.
 *
 * Inserting instead means the frame's DOM is the document's DOM, plus our head —
 * so a path means the same thing on both sides. It also keeps the wrapper styles
 * out of the body entirely.
 */
function withPreviewHead(source: string, head: string): string {
  const headStart = source.search(/<head[^>]*>/i)
  if (headStart > -1) {
    // First thing in the head: an earlier meta CSP cannot be loosened by a later
    // one, so the artifact's own policy (if it has one) only ever adds to this.
    const insertAt = source.indexOf('>', headStart) + 1
    return source.slice(0, insertAt) + head + source.slice(insertAt)
  }
  const htmlStart = source.search(/<html[^>]*>/i)
  if (htmlStart > -1) {
    const insertAt = source.indexOf('>', htmlStart) + 1
    return source.slice(0, insertAt) + `<head>${head}</head>` + source.slice(insertAt)
  }
  return `<!doctype html><html><head>${head}</head><body>${source}</body></html>`
}

export function buildPreviewHtml(source: string, channel = 'artifact-preview', tokens = ''): string {
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
  // This is always the first head/CSP, even when the source contains a full page.
  // Additional CSPs in untrusted content cannot loosen this one.
  const tokensStyle = tokens ? `<style id="ai-design-tokens">${tokens}</style>` : ''
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;font-family:system-ui,sans-serif;background:white;color:#171717}*{box-sizing:border-box}canvas[data-chart]{display:block;width:100%}</style>${tokensStyle}${previewScript(channel)}`
  const value = String(source || '')
  if (/^\s*(?:<!doctype html|<html[\s>])/i.test(value)) return withPreviewHead(value, head)
  return `<!doctype html><html><head>${head}</head><body>${value}</body></html>`
}

/* ---------------- comment mode: pick, describe, rewrite ---------------- */

/** Turn an index path into something a person (and a model) can read. */
export function describePath(path: number[] = []): string {
  return path.length ? `body > ${path.map((index, depth) => `${depth ? 'child' : 'element'}[${index + 1}]`).join(' > ')}` : 'body'
}

/** One element the person clicked in the preview, as the preview described it. */
export type ElementPick = {
  path: number[]
  outerHTML: string
  width: number
  height: number
  picked: { tag: string; id: string; classes: string; text: string }
}

/** Validate what the preview sent back before it is used as a prompt. */
export function parseElementPick(payload: any, channel: string): ElementPick | null {
  if (!payload || payload.channel !== channel || payload.type !== 'oddbrain-pick') return null
  if (!Array.isArray(payload.path) || payload.path.length > 40) return null
  if (payload.path.some((index: number) => !Number.isInteger(index) || index < 0 || index > 5000)) return null
  if (typeof payload.outerHTML !== 'string' || payload.outerHTML.length > 4000) return null
  const picked = { tag: String(payload.picked?.tag || ''), id: String(payload.picked?.id || ''), classes: String(payload.picked?.classes || ''), text: String(payload.picked?.text || '') }
  if (picked.tag.length > 40 || picked.id.length > 60 || picked.classes.length > 80 || picked.text.length > 120) return null
  return {
    path: payload.path, outerHTML: payload.outerHTML,
    width: Number(payload.width) || 0, height: Number(payload.height) || 0,
    picked,
  }
}

/** The instruction sent to the local model for a pinned comment. */
export function rewritePrompt({
  pick,
  comment,
  source,
  type = 'html',
}: {
  pick: ElementPick
  comment: string
  source: string
  type?: ArtifactType
}): string {
  if (comment.trim().length > 500) throw new Error('The element instruction exceeds 500 characters. Nothing was shortened or sent.')
  if (pick.outerHTML.length > 4000) throw new Error('The selected element exceeds 4,000 characters. Nothing was shortened or sent; choose a smaller element.')
  const lines = [
    'You are editing exactly one element of an existing single-file document.',
    'Return ONLY the replacement element: the same tag, the opening tag through its closing tag.',
    'Keep every id, class and data attribute you were not asked to change. No markdown fences, no explanation, no surrounding document.',
    `The element is at ${describePath(pick.path)} in the document body.`,
  ]
  if (pick.picked.text) lines.push(`Its visible text starts: ${JSON.stringify(pick.picked.text)}`)
  lines.push(`The person's instruction about this element: ${comment.trim()}`)
  lines.push('', 'Current element:', pick.outerHTML)
  // Enough surrounding document for context, without shipping a 200 KB file to a 4k context.
  const budget = 3500
  if (source.length <= budget) lines.push('', `The rest of the ${type === 'svg' ? 'SVG' : 'document'} for context:`, source)
  else lines.push('', 'Other parts of the document are unchanged and will be preserved by the app. Do not restate them.')
  return lines.join('\n')
}

/** Strip fences or a whole-document answer a small model may add. */
export function cleanElementRewrite(text = ''): string {
  let value = String(text).trim()
  const fenced = value.match(/^```[a-z]*\s*\r?\n([\s\S]*?)\r?\n?```$/i)
  if (fenced) value = fenced[1].trim()
  if (/^<!doctype html/i.test(value) || /^<html\b/i.test(value)) {
    const body = value.match(/<body[^>]*>([\s\S]*)<\/body>/i)
    if (body) value = body[1].trim()
  }
  return value
}

/**
 * Replace the element at `path` with `replacementHtml` inside `source`.
 * Both sides are parsed by the same HTML parser, so the indices the preview
 * reported resolve to the same node here.
 */
export function applyElementRewrite(source: string, path: number[], replacementHtml: string): string {
  if (!Array.isArray(path) || !path.length) throw new Error('No element was selected in the preview.')
  if (typeof DOMParser === 'undefined') throw new Error('This environment cannot parse HTML for a region rewrite.')
  const replacement = cleanElementRewrite(replacementHtml)
  if (!replacement.trim()) throw new Error('The model returned an empty replacement, so nothing was changed.')
  if (replacement.length > 100_000) throw new Error('The model returned an implausibly large replacement; nothing was changed.')
  const full = /^\s*(?:<!doctype html|<html\b)/i.test(source)
  const document = new DOMParser().parseFromString(source, 'text/html')
  let node: Element | null = document.body
  for (const index of path) {
    if (!node || !node.children || !node.children[index]) throw new Error('That element no longer exists in the current version of the artifact. Pick it again.')
    node = node.children[index]
  }
  if (!node || node === document.body) throw new Error('That element can no longer be located. Pick it again.')
  const holder = document.createElement('div')
  holder.innerHTML = replacement
  if (!holder.childNodes.length) throw new Error('The replacement was not valid HTML, so nothing was changed.')
  node.replaceWith(...holder.childNodes)
  const next = full ? `<!doctype html>\n${document.documentElement.outerHTML}` : document.body.innerHTML
  if (next.length > 400_000) throw new Error('The rewritten document became implausibly large; nothing was changed.')
  return next
}

/** A stable, cheap signature so the live preview only re-renders when it must. */
export function sourceSignature(source = ''): string {
  let hash = 5381
  for (let index = 0; index < source.length; index += 1) hash = ((hash * 33) ^ source.charCodeAt(index)) >>> 0
  return `${source.length}:${hash.toString(36)}`
}


/** A file name a Windows disk accepts, derived from the artifact's title. */
export function pdfSafeName(title: string): string {
  const cleaned = title.replace(/[^A-Za-z0-9 _-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).trim()
  return cleaned || 'artifact'
}
