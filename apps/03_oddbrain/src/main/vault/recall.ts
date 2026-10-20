import { createHash } from 'node:crypto'
import type { VaultFiles } from './files'
import { createMemoryWorkspace } from '../memory/workspace'
import { excluded, readPatterns } from './blacklist'
import { staleBasis } from '../../shared/lib/memoryWorkspace'
import { localSemanticScores, recallMatches, recallScore, recallSnippet, recallTerms, type RecallHit, type RecallReply } from '../../shared/lib/recall'

/** Read-only local recall. Semantic expansion is opt-in and uses only this bounded validated corpus. */
export function searchVault(files: VaultFiles, query: string, options: { localSemantic?: boolean } = {}): RecallReply {
  const terms = recallTerms(query), hits: RecallHit[] = [], notices = new Set<string>()
  if (!terms.length || query.trim().split(/\s+/).length > 16 || query.length > 500) return { ok: false, hits, incomplete: false, notices: ['Use 1–16 search words, up to 500 characters.'] }
  const patterns = [...readPatterns(files.read('00 System/Privacy & Access.md')), ...readPatterns(files.read('00 System/Connectors/Source Scope.md'))]
  let bytes = 0
  const read = (path: string) => {
    const size = files.size(path)
    if (size > 16_000_000 || bytes + size > 64_000_000) { notices.add('Some files exceeded this search’s reading budget. Narrow your query or open the original files.'); return null }
    bytes += size
    return files.read(path)
  }
  const ranked: Array<{ hit: RecallHit; score: number }> = []
  const semanticRows: Array<{ hit: RecallHit; text: string }> = []
  let semanticCharacters = 0, semanticCapped = false
  const catalogueGroups = new Map<string, number>()
  let catalogueEntries = 0, catalogueCapped = false
  const catalogue = (path: string): void => {
    catalogueEntries += 1
    const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
    for (let depth = 1; depth <= Math.min(2, parts.length); depth++) {
      const group = parts.slice(0, depth).join('/')
      if (catalogueGroups.has(group)) catalogueGroups.set(group, catalogueGroups.get(group)! + 1)
      else if (catalogueGroups.size < 100) catalogueGroups.set(group, 1)
      else catalogueCapped = true
    }
  }
  const rank = (hit: RecallHit, score: number, match: 'lexical' | 'local-semantic') => {
    catalogue(hit.path)
    ranked.push({ score, hit: { ...hit, match, text: recallSnippet(hit.text, terms) } })
  }
  const add = (hit: RecallHit) => {
    const searchable = `${hit.title} ${hit.text} ${hit.speaker} ${hit.date}`
    if (options.localSemantic) {
      const semanticLength = Math.min(searchable.length, 12_000)
      if (semanticRows.length < 2_000 && semanticCharacters + semanticLength <= 8_000_000) {
        semanticRows.push({ hit, text: searchable.slice(0, 12_000) }); semanticCharacters += semanticLength
      } else semanticCapped = true
    }
    if (recallMatches(searchable, terms)) rank(hit, 100 + recallScore(hit.title, hit.text, terms), 'lexical')
  }
  const store = createMemoryWorkspace(files), aliases = new Map<string, string>()
  const conversations = new Map<string, any>()
  try {
    // Pending/rejected interpretations and stale chapters are never returned as facts.
    const state = store.read()
    for (const account of state.accounts) { const person = state.people.find(p => p.id === account.person); if (person) aliases.set(account.id, person.name) }
    for (const p of state.proposals.filter(p => p.state === 'approved' && !staleBasis(p.source, state))) {
      if (!options.localSemantic && !recallMatches(`${p.title} ${p.text} ${p.uncertainty} ${p.date} ${aliases.get(p.subject) || ''}`, terms)) continue
      try { store.evidence(p.source) } catch { notices.add('Some confirmed records have unavailable, excluded or changed evidence and were omitted.'); continue }
      add({ id: 'memory:' + p.id, kind: 'confirmed', title: p.title, text: p.text + (p.uncertainty ? '\nQualification: ' + p.uncertainty : ''), path: p.source.path, date: p.date, speaker: (aliases.get(p.subject) ? aliases.get(p.subject) + ' · ' : '') + 'Confirmed by you; ' + (p.authored === 'ai' ? 'AI wording' : 'your correction') })
    }
  } catch { notices.add('Confirmed memory could not be read. Original conversations and files are still searched.') }
  for (const folder of ['Browser', 'App']) {
    const walk = files.walkFiles(`02 Sources/Conversations/${folder}`, '.json', 15000)
    if (walk.capped || walk.incomplete) notices.add('Not all conversation files could be searched in this pass.')
    for (const path of walk.files.filter(p => /\/messages\/[a-f0-9]+\.json$/.test(p))) {
      try {
        const raw = read(path); if (raw === null) continue
        const record = JSON.parse(raw), m = record.message, base = path.split('/messages/')[0]
        if (!conversations.has(base)) { const metadata = read(base + '/conversation.json'); if (metadata === null) continue; conversations.set(base, JSON.parse(metadata)) }
        const c = conversations.get(base)
        if (excluded(c.url, patterns)) continue
        if (!m || typeof m.text !== 'string' || typeof m.id !== 'string' || typeof c.title !== 'string' || typeof record.hash !== 'string') throw Error('Invalid conversation')
        const hash = createHash('sha256').update(JSON.stringify(m)).digest('hex')
        const revision = `${base}/revisions/${createHash('sha256').update(m.id).digest('hex')}-${hash}.json`
        if (hash !== record.hash || !files.exists(revision)) throw Error('Incomplete observation')
        const original = read(revision); if (original === null) continue
        if (createHash('sha256').update(JSON.stringify(JSON.parse(original).message)).digest('hex') !== hash) throw Error('Changed evidence')
        const account = createHash('sha256').update(`${c.provider}\n${c.key}\n${m.speaker}`).digest('hex')
        add({ id: path, kind: 'conversation', title: c.title, text: m.text, path: revision, date: m.timestamp || '', speaker: `${c.provider} · ${m.speaker || m.role}${aliases.has(account) ? ' · ' + aliases.get(account) : ''}` })
      } catch { notices.add('Some saved conversations were unreadable or incomplete and were omitted.') }
    }
  }
  const walk = files.walkFiles('', '.md', 10000)
  if (walk.capped || walk.incomplete) notices.add('Not all saved files could be searched in this pass.')
  for (const path of walk.files) {
    // No settings/key documents, raw state, duplicate conversation projections or
    // generated memory notes that could outlive a withdrawal/privacy change.
    if (/^(?:00 System|06 Review|09 Activity & Undo)\//.test(path) || path.startsWith('02 Sources/Conversations/') || /^(?:03 Memory\/(?:People|Life Story)|08 Journal\/Personal)\//.test(path) || /^03 Memory\/Entities\/memory-/.test(path)) continue
    try {
      const text = read(path); if (text === null) continue
      // Legacy captures embed their URL; respect the same source exclusions.
      const urls = text.match(/https?:\/\/[^\s<>"')]+/g) || []
      if (urls.some(url => excluded(url, patterns))) continue
      add({ id: path, kind: 'file', title: path.split('/').at(-1)!, text, path, date: '', speaker: 'Saved file; not automatically verified' })
    } catch { notices.add('Some saved files could not be read.') }
  }
  if (options.localSemantic) {
    const semantic = localSemanticScores(semanticRows.map(row => ({ id: row.hit.id, text: row.text })), query)
    const lexical = new Set(ranked.map(row => row.hit.id))
    for (const row of semanticRows) if (!lexical.has(row.hit.id) && semantic.has(row.hit.id)) rank(row.hit, semantic.get(row.hit.id)!, 'local-semantic')
    if (semanticCapped) notices.add('Local semantic expansion reached its 2,000-entry or 8 MB corpus budget. Narrow the query for a more complete pass.')
  }
  ranked.sort((a, b) => b.score - a.score)
  const groups = new Map<string, number>(), diverse: typeof ranked = []
  for (const row of ranked) {
    if (row.hit.kind === 'conversation') {
      const group = row.hit.id.split('/messages/')[0], count = (groups.get(group) || 0) + 1
      groups.set(group, count)
      if (count > 3) { notices.add('Showing at most three matching messages per conversation. Open its source or narrow the query for more.'); continue }
    }
    if (diverse.length < 60) diverse.push(row)
    else notices.add('More matches exist. Showing the highest-ranked matches; narrow your search.')
  }
  return { ok: true, hits: diverse.map(row => row.hit), incomplete: notices.size > 0, notices: [...notices], catalogue: { entriesSeen: catalogueEntries, groups: [...catalogueGroups].map(([path, entries]) => ({ path, entries })).sort((a, b) => a.path.localeCompare(b.path)), capped: catalogueCapped }, semantic: { mode: options.localSemantic ? 'local-distributional-v1' : 'off', candidates: semanticRows.length, capped: semanticCapped } }
}
