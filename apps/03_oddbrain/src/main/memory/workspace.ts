import { createHash, randomUUID } from 'node:crypto'
import type { VaultFiles } from '../vault/files'
import { yamlDocument } from '../vault/text'
import { excluded, readPatterns } from '../vault/blacklist'
import { changeMemory, chapterEvidence, staleBasis, mergedProfiles, emptyMemory, memoryStateProblem, parseMemoryProposals, type MemoryAction, type MemorySource, type MemoryWorkspace } from '../../shared/lib/memoryWorkspace'
const hash = (s: string): string => createHash('sha256').update(s).digest('hex')
const STATE = '06 Review/Organizer/state.json'
const AI = new Set(['oddbrain','chatgpt','claude','gemini','aistudio','deepseek','arena','glm','kimi','grok','qwen','mistral','perplexity','copilot','poe'])
export function createMemoryWorkspace(files: VaultFiles, clock: () => string = () => new Date().toISOString()) {
  function read(): MemoryWorkspace {
    const raw = files.read(STATE)
    if (!raw && !files.exists(STATE)) return emptyMemory()
    let s: MemoryWorkspace
    // Name the file: "repair the state" is not actionable on its own, and this
    // folder is one the person can open.
    try { s = JSON.parse(raw) } catch { throw Error(`Memory state is not readable as JSON (${STATE}). It was not replaced or reset.`) }
    const problem = memoryStateProblem(s)
    if (problem) throw Error(`Memory state needs repair: ${problem} (${STATE}). It was not replaced or reset.`)
    s.discoveryWarnings ||= []
    return s
  }
  function save(s: MemoryWorkspace): void { files.writeAtomic(STATE, JSON.stringify(s)) }
  function discover(): MemoryWorkspace {
    const state = read(), known = new Set(state.jobs.map(j => j.id))
    const browser = files.walkFiles('02 Sources/Conversations/Browser', '.json', 15000), app = files.walkFiles('02 Sources/Conversations/App', '.json', 15000)
    const walk = { files: [...browser.files, ...app.files], capped: browser.capped || app.capped }
    let changed = state.scanCapped !== walk.capped
    state.scanCapped = walk.capped
    const discoveryWarnings: string[] = []; let added = 0
    sources: for (const path of walk.files.filter(f => /\/messages\/[a-f0-9]+\.json$/.test(f))) {
      try {
        if (files.size(path) > 16_000_000) throw Error('source exceeds the organizer read budget')
        const record = JSON.parse(files.read(path)), m = record.message
        if (!m || typeof m.text !== 'string' || !m.text.trim()) continue
        const base = path.split('/messages/')[0], conversation = JSON.parse(files.read(base + '/conversation.json') || 'null')
        if (!conversation || excluded(conversation.url, [...readPatterns(files.read('00 System/Privacy & Access.md')), ...readPatterns(files.read('00 System/Connectors/Source Scope.md'))])) continue
        if (![m.id, m.role, record.hash, record.observed_at, conversation.title, conversation.provider, conversation.key].every(v => typeof v === 'string')) throw Error('invalid source metadata')
        const kind = conversation.adapter === 'classroom' ? 'classroom' : AI.has(conversation.adapter) ? 'ai' : 'people'
        // A speaker with no exposed platform account ID stays scoped to THIS
        // conversation. Names alone never auto-merge people across conversations.
        const account = kind === 'people' && m.role !== 'self' && m.speaker ? hash(`${conversation.provider}\n${conversation.key}\n${m.speaker}`) : ''
        if (account && !state.accounts.some(a => a.id === account)) {
          state.accounts.push({ id: account, label: m.speaker, provider: conversation.provider, scope: conversation.key, person: null }); changed = true
        }
        const revision = `${base}/revisions/${hash(m.id)}-${record.hash}.json`
        // Do not claim an uncommitted stream observation is a durable source.
        if (!files.size(revision)) continue
        for (let start = 0; start < m.text.length; start += 5500) {
          const id = hash(`${revision}\n${start}`)
          if (known.has(id)) continue
          const source: MemorySource = { id, path: revision, note: path.includes('/Browser/') ? base + '/conversation.md' : conversation.original, title: conversation.title, provider: conversation.provider, conversation: conversation.key, message: m.id, role: m.role, speaker: m.speaker || '', account, kind, observed: record.observed_at, timestamp: typeof m.timestamp === 'string' ? m.timestamp : '', hash: record.hash, start, end: Math.min(start + 6000, m.text.length) }
          state.jobs.push({ id, source, state: 'queued', attempts: 0, error: '' }); known.add(id); changed = true
          if (++added >= 64) { state.scanCapped = true; break sources }
        }
      } catch (e) { discoveryWarnings.push(`${path}: ${(e as Error).message}`) }
    }
    if (JSON.stringify(state.discoveryWarnings) !== JSON.stringify(discoveryWarnings)) { state.discoveryWarnings = discoveryWarnings; changed = true }
    if (changed) { state.revision++; save(state) }
    return state
  }
  function evidence(source: MemorySource, seen: Set<string> = new Set()): string {
    if (source.kind === 'confirmed') {
      if (!/^06 Review\/Organizer\/Chapter sources\/[a-f0-9-]{36}\.json$/.test(source.path)) throw Error('Invalid chapter evidence path.')
      // The state file is plain JSON inside the vault, where anything else with
      // file access can edit it. A basis that loops back to itself must be one
      // clear sentence, not a stack overflow. `seen` is the current path only,
      // so two chapters sharing one confirmed record are still both allowed.
      if (seen.has(source.id)) throw Error('This chapter’s basis loops back to itself. Reject the draft and build it again from confirmed records.')
      seen.add(source.id)
      try {
        const state = read()
        if (staleBasis(source, state)) throw Error('Confirmed chapter evidence changed. Request a new draft.')
        for (const basis of source.basis || []) { const original = state.proposals.find(p => p.id === basis.id); if (original) evidence(original.source, seen) }
        const bundle = JSON.parse(files.read(source.path) || 'null')
        if (!bundle || hash(JSON.stringify(bundle.message)) !== source.hash) throw Error('Chapter evidence is missing or changed.')
        return bundle.message.text
      } finally { seen.delete(source.id) }
    }
    if (!/^02 Sources\/Conversations\/(?:Browser|App)\/[a-f0-9]{64}\/revisions\/[a-f0-9]{64}-[a-f0-9]{64}\.json$/.test(source.path)) throw Error('Invalid memory source path.')
    const base = source.path.split('/revisions/')[0], conversation = JSON.parse(files.read(base + '/conversation.json') || 'null')
    if (!conversation || excluded(conversation.url, [...readPatterns(files.read('00 System/Privacy & Access.md')), ...readPatterns(files.read('00 System/Connectors/Source Scope.md'))])) throw Error('This source is excluded or unavailable.')
    const record = JSON.parse(files.read(source.path) || 'null')
    if (!record || record.hash !== source.hash || hash(JSON.stringify(record.message)) !== source.hash) throw Error('The original observation is missing or changed.')
    return record.message.text.slice(source.start, source.end)
  }
  function complete(jobId: string, raw: string, model: string): void {
    const s = read(), job = s.jobs.find(j => j.id === jobId)
    if (!job || job.state !== 'queued') throw Error('This observation was already processed.')
    const proposals = parseMemoryProposals(raw, job.source, evidence(job.source), model, () => randomUUID())
    // Overlap between input chunks cannot create repeated interpretations.
    for (const p of proposals) if (!s.proposals.some(old => old.source.conversation === p.source.conversation && old.source.provider === p.source.provider && old.source.message === p.source.message && old.kind === p.kind && old.subject === p.subject && old.quote === p.quote)) s.proposals.push(p)
    job.state = 'done'; job.error = ''; s.revision++; save(s)
  }
  function fail(jobId: string, message: string): void {
    const s = read(), job = s.jobs.find(j => j.id === jobId)
    if (!job) return
    // No automatic paid retry loop. Retry is explicit; source bytes stay intact.
    job.attempts++; job.state = 'blocked'; job.error = message.slice(0, 1000); s.revision++; save(s)
  }
  function project(state: MemoryWorkspace): string[] {
    const warnings: string[] = state.proposals.filter(p => p.state !== 'rejected' && staleBasis(p.source, state)).map(p => `${p.title}: underlying confirmed records changed; review or redraft this chapter.`)
    const manifestPath = '06 Review/Organizer/projections.json'
    const manifest = JSON.parse(files.read(manifestPath) || '{}') as Record<string, string>
    const approved = state.proposals.filter(p => p.state === 'approved')
    const write = (path: string, content: string) => {
      const before = files.read(path)
      if (before && hash(before) !== manifest[path]) { warnings.push(`${path}: externally edited; preserved. Use the review workspace to reconcile it.`); return }
      files.writeAtomic(path, content); manifest[path] = hash(content)
    }
    const citation = (source: MemorySource) => `Raw observation: \`${source.path}\`${source.note ? `\n\nConversation: [[${source.note}]]` : ''}`
    const paragraph = (p: typeof approved[number]) => `## ${p.title}\n\n${p.text}\n\n${p.date ? 'Event date: ' + p.date : 'Event date not established; observed ' + p.source.observed.slice(0, 10)}\n\n${citation(p.source)}\n\nAuthorship: ${p.authored === 'ai' ? 'AI wording, approved by you' : 'Your correction'} · Verified ${p.reviewedAt}\n${p.uncertainty ? '\nQualification: ' + p.uncertainty + '\n' : ''}`
    for (const person of state.people) {
      const accounts = state.accounts.filter(a => a.person === person.id)
      const items = approved.filter(p => accounts.some(a => a.id === p.subject))
      const paths = [...new Set(state.jobs.filter(j => accounts.some(a => a.id === j.source.account)).map(j => citation(j.source)))]
      write(`03 Memory/People/${person.id}.md`, yamlDocument({ type: 'person', title: person.name, id: person.id }, `# ${person.name}\n\n${person.notes}\n\n${mergedProfiles(state, person.id).filter(p => p.notes).map(p => `## Your notes from merged profile: ${p.name}\n\n${p.notes}`).join('\n\n')}\n\n## Linked accounts\n${accounts.map(a => `- ${a.provider}: ${a.label} (${a.scope})`).join('\n')}\n\n${items.map(paragraph).join('\n\n')}\n\n## Source conversations\n${paths.map(p => `- ${p}`).join('\n')}`))
    }
    const journal = approved.filter(p => p.kind === 'journal' && p.subject === 'self')
    const dates = new Set([...journal.map(p => p.date || 'undated'), ...Object.keys(manifest).filter(p => p.startsWith('08 Journal/Personal/')).map(p => p.split('/').pop()!.replace('.md', ''))])
    for (const date of dates) write(`08 Journal/Personal/${date}.md`, yamlDocument({ type: 'personal_journal', title: date === 'undated' ? 'Undated experiences' : date }, `# ${date}\n\n${journal.filter(p => (p.date || 'undated') === date).map(paragraph).join('\n\n')}`))
    write('03 Memory/Life Story/Confirmed history.md', yamlDocument({ type: 'life_story', title: 'Life Story — confirmed history' }, `# Your Life Story\n\nOnly reviewed material. Approval confirms your account, not independent verification. AI authorship remains labelled.\n\n${approved.filter(p => p.kind === 'story' && p.subject === 'self').sort((a,b) => (a.date || '9999').localeCompare(b.date || '9999')).map(paragraph).join('\n\n')}`))
    write('03 Memory/Life Story/Confirmed self record.md', yamlDocument({ type: 'self_record', title: 'Your confirmed record' }, approved.filter(p => p.subject === 'self' && p.kind === 'profile').map(paragraph).join('\n\n')))
    for (const p of approved.filter(p => p.source.kind === 'confirmed')) write(`03 Memory/Life Story/Chapters/${p.id}.md`, yamlDocument({ type: 'life_story_chapter', title: p.title, approved: true, authorship: p.authored, basis: p.source.basis }, paragraph(p)))
    // Approved memory capsules are explicit-selection only, never typing suggestions.
    for (const p of approved.filter(p => p.kind === 'capsule')) {
      write(`03 Memory/Entities/memory-${p.id}.md`, yamlDocument({ id: `memory-${p.id}`, type: 'capsule', title: p.title, version: p.revision, status: 'active', background: p.text, sources: [p.source.path], memory_approved: true, suggestion_safe: false }, `# ${p.title}\n\n${paragraph(p)}`))
    }
    for (const p of state.proposals.filter(p => p.state === 'rejected')) {
      for (const path of [`03 Memory/Entities/memory-${p.id}.md`, `03 Memory/Life Story/Chapters/${p.id}.md`]) if (manifest[path]) write(path, yamlDocument({ type: 'withdrawn', status: 'withdrawn', id: `memory-${p.id}`, title: `Withdrawn: ${p.title}`, suggestion_safe: false }, '# Withdrawn interpretation\n\nThe previous text and review history remain in the Organizer state; original observations were not removed.'))
    }
    files.writeAtomic(manifestPath, JSON.stringify(manifest))
    return warnings
  }
  function act(action: MemoryAction): MemoryWorkspace {
    const before = read(), state = changeMemory(before, action, clock(), randomUUID())
    if (action.type === 'draft-chapter') {
      const { items, text } = chapterEvidence(before, action), job = state.jobs[state.jobs.length - 1], message = { text }
      job.source.hash = hash(JSON.stringify(message)); job.source.end = text.length
      files.writeOnce(job.source.path, JSON.stringify({ message, records: items, observed_at: job.source.observed }))
    }
    // Confirmation is durable first. Projections are recoverable, never the only copy.
    save(state)
    try { state.projectionWarnings = project(state) } catch (e) { state.projectionWarnings = [(e as Error).message] }
    save(state)
    return state
  }
  const privacyFingerprint = () => hash(files.read('00 System/Privacy & Access.md') + '\n' + files.read('00 System/Connectors/Source Scope.md'))
  return { read, discover, evidence, complete, fail, act, privacyFingerprint, root: files.root }
}
export type MemoryStore = ReturnType<typeof createMemoryWorkspace>
