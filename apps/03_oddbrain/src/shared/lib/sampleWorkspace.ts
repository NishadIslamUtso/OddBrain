import { recallScore, recallTerms, recallMatches, recallSnippet } from './recall'
import type { Chat } from '../types'
import type { Project } from './projects'

export const SAMPLE_MODE_KEY = 'oddbrain.sample.mode'
export const SAMPLE_PREFIX = 'oddbrain.sample.data.'
export const SAMPLE_ROOT = '/Sample workspace/Vault'
/** No samples in a preload-backed window, even if a browser preference was copied. */
export function sampleEnabled(): boolean {
  if (typeof window === 'undefined' || window.api) return false
  try { return localStorage.getItem(SAMPLE_MODE_KEY) === 'on' } catch { return false }
}
export const workspaceKey = (key: string): string => sampleEnabled() ? SAMPLE_PREFIX + key : key
export function readSample<T>(key: string, fallback: T): T {
  try {
    const value = JSON.parse(localStorage.getItem(SAMPLE_PREFIX + key) || 'null')
    if (value !== null && typeof value === typeof fallback && Array.isArray(value) === Array.isArray(fallback)) return value
  } catch { /* A damaged sample can be reset without touching user work. */ }
  return structuredClone(fallback)
}
export function writeSample<T>(key: string, value: T): void {
  if (!sampleEnabled()) throw new Error('The sample workspace is not active.')
  localStorage.setItem(SAMPLE_PREFIX + key, JSON.stringify(value))
}
export function prepareSamples(): void {
  if (typeof window === 'undefined' || window.api || new URLSearchParams(window.location.search).has('quick')) return
  try {
    if (localStorage.getItem(SAMPLE_MODE_KEY) === null) localStorage.setItem(SAMPLE_MODE_KEY, 'on')
    if (!sampleEnabled()) return
    if (localStorage.getItem('ai-assistant.welcomed') === null) localStorage.setItem('ai-assistant.welcomed', 'true')
    if (localStorage.getItem(SAMPLE_PREFIX + 'ai-assistant.chats') === null) writeSample('ai-assistant.chats', sampleChats())
  } catch { /* Existing storage warnings remain responsible for reporting a locked profile. */ }
}
export function setSampleMode(enabled: boolean): void {
  if (typeof window === 'undefined' || window.api) throw new Error('Samples are browser-preview only.')
  localStorage.setItem(SAMPLE_MODE_KEY, enabled ? 'on' : 'off')
}
export function resetSamples(): void {
  if (typeof window === 'undefined' || window.api) throw new Error('Samples are browser-preview only.')
  const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
  for (const key of keys) if (key?.startsWith(SAMPLE_PREFIX)) localStorage.removeItem(key)
}
export const sampleTime = (): string => new Date().toISOString()
export function sampleProjects(): Project[] {
  return [
    { id: 'sample-workshop', name: 'Community workshop', instruction: 'Use plain language. Keep plans practical and easy to revise.', folder: '/Sample workspace/Workshop', createdAt: sampleTime(), goals: [], references: [] },
    { id: 'sample-garden', name: 'Balcony garden', instruction: 'Compare low-maintenance options. Separate observations from assumptions.', folder: '/Sample workspace/Garden', createdAt: sampleTime(), goals: [], references: [] },
    { id: 'sample-website', name: 'Small website', instruction: 'Use semantic HTML, keyboard-friendly controls and no remote dependencies.', folder: '/Sample workspace/Website', createdAt: sampleTime(), goals: [], references: [] },
  ]
}
export function sampleChats(): Chat[] {
  const entries = [
    ['sample-chat-workshop', 'Plan a weekend workshop', 'sample-workshop', 'Help me plan a small repair workshop.', 'Here is a sample plan:\n\n1. Start with introductions and a safety check.\n2. Split into repair stations.\n3. Leave time to share what worked.\n\nThe **workshop checklist** in Artifacts and the notes in Vault belong to this example.'],
    ['sample-chat-garden', 'Choose herbs for a balcony', 'sample-garden', 'Which herbs could suit a sunny balcony?', 'For this sample garden, compare basil, rosemary and mint.\n\n| Plant | Container | Care |\n|---|---|---|\n| Basil | Medium pot | Regular watering |\n| Rosemary | Well-drained pot | Let soil dry between waterings |\n| Mint | Separate pot | Keep it contained |\n\nMeasure the light before buying anything.'],
    ['sample-chat-site', 'Review the event page', 'sample-website', 'What would you check before publishing the event page?', 'Sample review checklist:\n\n- Check headings and keyboard focus.\n- Try the layout at narrow widths.\n- Make sure the date and location are plain text.\n- Check contrast and link labels.\n\n```css\nbutton:focus-visible {\n  outline: 2px solid currentColor;\n  outline-offset: 3px;\n}\n```'],
    ['sample-chat-notes', 'Turn reading into useful notes', null, 'How should I organise what I read?', 'This sample vault separates **Projects**, **Reading** and **Memory**. Related notes use [[links]], which you can explore in Brain.\n\nOpen Browsing maps to inspect sample page captures. No browser history was accessed.'],
  ] as const
  return entries.map(([id, title, projectId, question, answer], i) => ({ id, title, projectId, pinned: i === 0, date: 'Today', updatedAt: Date.now() - i * 60000, messages: [
    { id: id + '-user', role: 'user', content: question, timestamp: sampleTime() },
    { id: id + '-answer', role: 'assistant', content: answer, model: 'Sample response · not generated', status: 'complete', timestamp: sampleTime() },
  ] }))
}
export function sampleFiles(): Record<string, string> {
  const topics = ['Workshop plan', 'Repair stations', 'Safety checklist', 'Volunteer roles', 'Supplies', 'Event page', 'Accessibility', 'Typography', 'Page review', 'Garden plan', 'Basil', 'Rosemary', 'Mint', 'Sunlight log', 'Watering schedule', 'Reading notes', 'Design principles', 'Decisions', 'Preferences', 'Open questions']
  return Object.fromEntries(topics.map((title, i) => {
    const folder = i < 5 ? 'Projects/Workshop' : i < 9 ? 'Projects/Website' : i < 15 ? 'Projects/Garden' : i < 17 ? 'Reading' : 'Memory'
    const next = topics[(i + 1) % topics.length], related = topics[(i + 4) % topics.length]
    return [`${folder}/${title}.md`, `# ${title}\n\nSample note for exploring OddBrain. This is not a file from your computer.\n\n${title === 'Preferences' ? 'Prefer concise explanations and accessible layouts.\n\n' : ''}Related: [[${next}]] and [[${related}]].\n\n- Review the draft.\n- Record what changed.\n- Keep open questions visible.\n`]
  }).concat([['Inbox/Unlinked idea.md', '# Unlinked idea\n\nAn example note with no links. Toggle unlinked notes in the graph appearance panel.']]))
}
export function getSampleFiles(): Record<string, string> { return readSample('files', sampleFiles()) }
export function sampleLinks() {
  const files = getSampleFiles(), edges: Array<{ from: string; to: string }> = [], dead: Array<{ from: string; target: string }> = [], ambiguous: Array<{ from: string; target: string; matches: string[] }> = []
  let checked = 0
  for (const [from, content] of Object.entries(files)) for (const match of content.matchAll(/\[\[([^\]]+)\]\]/g)) {
    checked++
    const matches = Object.keys(files).filter(path => path.split('/').at(-1)?.replace(/\.md$/, '') === match[1])
    if (matches.length === 1) edges.push({ from, to: matches[0] })
    else if (matches.length) ambiguous.push({ from, target: match[1], matches })
    else dead.push({ from, target: match[1] })
  }
  return { files: Object.keys(files).length, checked, dead, ambiguous, edges }
}
export function sampleSources() {
  return [
    { id: 'sample-source-repair', title: 'Repair workshop notes', kind: 'page', path: 'Reading/Reading notes.md', host: 'example.org', url: 'https://example.org/workshop', completeness: 'Sample full capture', provider: 'Sample extension' },
    { id: 'sample-source-design', title: 'Readable event pages', kind: 'page', path: 'Reading/Design principles.md', host: 'example.org', url: 'https://example.org/design', completeness: 'Sample excerpt', provider: 'Sample extension' },
    { id: 'sample-source-chat', title: 'Plan a weekend workshop', kind: 'conversation', path: 'Projects/Workshop/Workshop plan.md', host: '', url: '', completeness: 'Sample conversation', provider: 'OddBrain sample' },
  ].map(entry => ({ ...entry, at: sampleTime(), bytes: 420 }))
}
export function captureSamplePage(): void {
  const files = getSampleFiles()
  files['Inbox/Sample extension capture.md'] = '# Sample extension capture\n\nThis page was simulated inside the preview. No extension connected and no real website was read.\n\nRelated: [[Reading notes]] and [[Workshop plan]].'
  writeSample('files', files)
  const entries = readSample('sources', sampleSources()).filter(entry => entry.id !== 'sample-captured-page')
  entries.unshift({ id: 'sample-captured-page', title: 'Sample extension capture', kind: 'page', path: 'Inbox/Sample extension capture.md', host: 'example.org', url: 'https://example.org/sample', completeness: 'Simulated capture', provider: 'Sample extension', at: sampleTime(), bytes: files['Inbox/Sample extension capture.md'].length })
  writeSample('sources', entries)
}
export function sampleVaultReply(path: string): Record<string, unknown> {
  if (!sampleEnabled()) throw new Error('Sample vault is not active.')
  const url = new URL(path, 'https://sample.invalid'), files = getSampleFiles()
  switch (url.pathname) {
    case '/status': return { ok: true, available: true, vault: SAMPLE_ROOT, counts: { files: Object.keys(files).length } }
    case '/files': return { ok: true, available: true, root: SAMPLE_ROOT, files: Object.keys(files), capped: false }
    case '/file': { const name = url.searchParams.get('path') || ''; return Object.hasOwn(files, name) ? { ok: true, content: files[name], truncated: false } : { ok: false, error: 'This sample note does not exist.' } }
    case '/recall': { const terms = recallTerms(url.searchParams.get('q') || ''); return { ok: true, incomplete: false, notices: ['Sample files only; no real account or model is connected.'], hits: Object.entries(files).filter(([path, text]) => recallMatches(path + ' ' + text, terms)).sort((a,b) => recallScore(b[0], b[1], terms) - recallScore(a[0], a[1], terms)).map(([path, text]) => ({ id: path, kind: 'file', path, title: path.split('/').at(-1), text: recallSnippet(text, terms), date: '', speaker: 'Sample file' })) } }
    case '/grep': { const q = (url.searchParams.get('q') || '').toLowerCase(); return { ok: true, hits: Object.entries(files).flatMap(([path, text]) => text.split('\n').flatMap((text, line) => text.toLowerCase().includes(q) ? [{ path, line: line + 1, text }] : [])).slice(0, 100) } }
    case '/today': return { available: true, snapshot: '# Sample day\n\nWorkshop plan drafted. Event page ready for review. Garden notes linked.\n\nNext: review the checklist, compare the artifact versions, and try a sample capture in Connectors.' }
    case '/sources': {
      const q = (url.searchParams.get('q') || '').toLowerCase(), kind = url.searchParams.get('kind'), days = Number(url.searchParams.get('days') || 0)
      const entries = readSample('sources', sampleSources()).filter(entry => (!q || `${entry.title} ${entry.host}`.toLowerCase().includes(q)) && (!kind || entry.kind === kind) && (!days || Date.now() - Date.parse(entry.at) < days * 86400000))
      const hosts = [...new Set(entries.map(e => e.host).filter(Boolean))].map(host => ({ host, count: entries.filter(e => e.host === host).length, lastAt: entries.find(e => e.host === host)!.at }))
      const dates = [...new Set(entries.map(e => e.at.slice(0, 10)))].map(date => ({ date, count: entries.filter(e => e.at.startsWith(date)).length }))
      return { ok: true, available: true, vault: SAMPLE_ROOT, entries, summary: { total: entries.length, capped: false, kinds: Object.fromEntries(['page', 'conversation', 'visit'].map(kind => [kind, entries.filter(e => e.kind === kind).length])), hosts, days: dates } }
    }
    case '/capsules': return { ok: true, available: true, capsules: [] }
    default: return { ok: false, available: true, error: 'This operation is not simulated. No real file or service was accessed.' }
  }
}
