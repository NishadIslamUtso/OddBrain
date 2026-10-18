const express = require('express')
const cors = require('cors')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const YAML = require('yaml')
const { createZip, safeEntryName } = require('./zip.cjs')

const DEFAULT_VAULT_PATH = path.resolve(__dirname, '../../../vault/AI-Brain')
const PRIVACY_FILE = '00 System/Privacy & Access.md'
const SCOPE_FILE = '00 System/Connectors/Source Scope.md'
class InputError extends Error {}
const digest = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 24)
const yamlDocument = (metadata, body) => `---\n${YAML.stringify(metadata)}---\n\n${body}\n`
function safeSegment(value, label) {
  const segment = String(value ?? '')
  if (!/^[a-zA-Z0-9][a-zA-Z0-9 ._-]{0,100}$/.test(segment) || segment === '.' || segment === '..') throw new InputError(`Invalid ${label}.`)
  return segment
}
function timestamp(value, fallback) {
  if (!value) return fallback
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new InputError('Invalid timestamp.')
  return value
}
function dhakaParts(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(item => [item.type, item.value]))
  return { year: parts.year, month: parts.month, date: `${parts.year}-${parts.month}-${parts.day}` }
}
function excluded(url, patterns) {
  if (!url) return false
  let parsed
  try { parsed = new URL(url) } catch { return false }
  return patterns.some(pattern => {
    const value = pattern.trim().toLowerCase()
    const escape = text => text.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    if (/^https?:\/\//.test(value)) return new RegExp(`^${escape(value)}$`, 'i').test(parsed.href)
    const [host, ...rest] = value.split('/')
    const hostRegex = new RegExp(`^(?:[^.]+\\.)*${escape(host)}$`, 'i')
    return hostRegex.test(parsed.hostname) && (!rest.length || new RegExp(`^/${escape(rest.join('/'))}$`, 'i').test(parsed.pathname + parsed.search))
  })
}
function splitDocument(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)/)
  if (!match) return { metadata: {}, body: text }
  return { metadata: YAML.parse(match[1]) || {}, body: match[2].trim() }
}
function readPatterns(text) {
  const documents = [...text.matchAll(/```ya?ml\s*\n([\s\S]*?)```/gi)].map(match => match[1])
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (front) documents.push(front[1])
  const patterns = []
  for (const source of documents) {
    const data = YAML.parse(source)
    if (Array.isArray(data?.excluded_patterns)) patterns.push(...data.excluded_patterns.filter(pattern => typeof pattern === 'string'))
  }
  return patterns
}
function replacePatterns(text, patterns) {
  let replaced = false
  let result = text.replace(/```ya?ml\s*\n([\s\S]*?)```/gi, (all, source) => {
    const document = YAML.parseDocument(source)
    if (!document.has('excluded_patterns')) return all
    document.set('excluded_patterns', patterns)
    replaced = true
    return `\`\`\`yaml\n${document.toString()}\`\`\``
  })
  result = result.replace(/^---\r?\n([\s\S]*?)\r?\n---/, (all, source) => {
    const document = YAML.parseDocument(source)
    if (!document.has('excluded_patterns')) return all
    document.set('excluded_patterns', patterns)
    replaced = true
    return `---\n${document.toString()}---`
  })
  if (replaced) return result
  return `${text.trim()}\n\n## Never-check blacklist (explicit deny)\n\n\`\`\`yaml\n${YAML.stringify({ excluded_patterns: patterns })}\`\`\`\n`
}
/** Read `- [ ] ... next check YYYY-MM-DD` lines out of Open Loops (Today view). */
function parseFollowups(markdown) {
  const items = []
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const match = line.match(/^\s*[-*+]\s*\[( |x|X)\]\s*(.*)$/)
    if (!match || match[1] !== ' ') continue
    const text = match[2]
    items.push({
      topic: text.replace(/\[\[|\]\]/g, '').replace(/\s*-\s*next[ _]?check.*$/i, '').replace(/\s*-\s*last[ _]?update.*$/i, '').trim(),
      next_check: text.match(/next[ _]?check\s+([0-9]{4}-[0-9]{2}-[0-9]{2})/i)?.[1] || '',
      last_update: text.match(/last[ _]?update\s+([0-9]{4}-[0-9]{2}-[0-9]{2})/i)?.[1] || '',
      raw: text,
    })
  }
  return items
}
function section(body, heading) {
  return body.match(new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'))?.[1]?.trim() || ''
}
function createVaultApp({ vaultPath = process.env.AI_BRAIN_VAULT || process.env.AI_BRAIN_PATH || DEFAULT_VAULT_PATH, clock = () => new Date() } = {}) {
  const root = path.resolve(vaultPath)
  if (!fs.existsSync(root)) throw new Error(`Canonical vault not found: ${root}. Set AI_BRAIN_VAULT to an existing Obsidian vault; no empty replacement vault is created.`)
  const realRoot = fs.realpathSync(root)
  const app = express()
  function filePath(relative) {
    const full = path.resolve(root, relative)
    if (!full.startsWith(root + path.sep)) throw new InputError('Path outside vault.')
    return full
  }
  function ensureDirectory(relative) {
    const full = filePath(relative)
    let ancestor = full
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor)
    const existingReal = fs.realpathSync(ancestor)
    if (existingReal !== realRoot && !existingReal.startsWith(realRoot + path.sep)) throw new InputError('Symlink outside vault.')
    fs.mkdirSync(full, { recursive: true })
    const real = fs.realpathSync(full)
    if (!real.startsWith(realRoot + path.sep)) throw new InputError('Symlink outside vault.')
    return full
  }
  function read(relative) {
    const full = filePath(relative)
    if (!fs.existsSync(full)) return ''
    const real = fs.realpathSync(full)
    if (!real.startsWith(realRoot + path.sep)) throw new InputError('Symlink outside vault.')
    return fs.readFileSync(full, 'utf8')
  }
  function writeOnce(relative, content) {
    ensureDirectory(path.dirname(relative))
    const full = filePath(relative)
    try { fs.writeFileSync(full, content, { flag: 'wx' }); return false }
    catch (error) { if (error.code === 'EEXIST') return true; throw error }
  }
  function append(relative, text) {
    ensureDirectory(path.dirname(relative))
    const full = filePath(relative)
    if (fs.existsSync(full) && !fs.realpathSync(full).startsWith(realRoot + path.sep)) throw new InputError('Symlink outside vault.')
    fs.appendFileSync(full, text)
  }
  function activity(message) {
    const now = clock(), { year, month } = dhakaParts(now)
    append(`09 Activity & Undo/${year}/${month}.md`, `- [${now.toISOString()}] ${message.replace(/\r?\n/g, ' ')}\n`)
  }
  function blacklist() { return [...new Set([...readPatterns(read(PRIVACY_FILE)), ...readPatterns(read(SCOPE_FILE))])] }
  function updateBlacklist(data) {
    if (!Array.isArray(data.excluded_patterns) || data.excluded_patterns.length > 500 || data.excluded_patterns.some(pattern => typeof pattern !== 'string' || !pattern.trim() || pattern.length > 500 || /[\r\n]/.test(pattern))) throw new InputError('Use up to 500 non-empty URL/domain patterns, one per entry.')
    const incoming = data.excluded_patterns.map(pattern => pattern.trim())
    const action = data.action || 'set'
    const previous = blacklist()
    if (!['add', 'remove', 'set'].includes(action)) throw new InputError('Invalid blacklist action.')
    const next = [...new Set(action === 'add' ? [...previous, ...incoming] : action === 'remove' ? previous.filter(pattern => !incoming.includes(pattern)) : incoming)]
    const stamp = `${clock().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}`
    const changes = [PRIVACY_FILE, SCOPE_FILE].map(relative => {
      const before = read(relative) || '# Source Scope\n\nGlobal default allow, explicit deny.\n'
      const after = replacePatterns(before, next)
      ensureDirectory(path.dirname(relative))
      return { relative, before, after }
    }).filter(change => change.before !== change.after)
    for (const { relative, before } of changes) writeOnce(`90 Archive/System Revisions/${stamp}-${path.basename(relative)}`, before)
    try {
      for (const { relative, after } of changes) fs.writeFileSync(filePath(relative), after, 'utf8')
    } catch (error) {
      // Best-effort rollback; immutable revision copies are also retained.
      for (const { relative, before } of changes) {
        try { fs.writeFileSync(filePath(relative), before, 'utf8') } catch { /* API reports failure, never success. */ }
      }
      throw error
    }
    activity(`blacklist updated; ${next.length} excluded patterns; previous system documents kept in 90 Archive/System Revisions/`)
    return { ok: true, excluded_patterns: next }
  }
  app.use((request, response, next) => {
    const origin = request.headers.origin
    let allowed = !origin || /^chrome-extension:\/\/[a-p]{32}$/.test(origin)
    if (origin) {
      try {
        const url = new URL(origin)
        allowed ||= ['http:', 'https:'].includes(url.protocol) && (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || process.env.ALLOW_PREVIEW_ORIGINS === '1' && url.hostname.endsWith('.e2b.app'))
      } catch { /* Deny malformed origins. */ }
    }
    if (!allowed) return response.status(403).json({ error: 'Origin is not authorized for this local vault API.' })
    next()
  })
  app.use(cors({ origin: true }))
  app.use(express.json({ limit: '20mb' }))
  app.get(['/', '/health'], (_request, response) => response.json({ ok: true, vault: root, message: 'AI ASSistant canonical Markdown vault API', timezone: 'Asia/Dhaka' }))
  app.get('/status', (_request, response, next) => {
    try {
      let files = 0
      const walk = directory => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          if (entry.name.startsWith('.')) continue
          const full = path.join(directory, entry.name)
          if (entry.isDirectory()) walk(full); else files += 1
        }
      }
      try { walk(root) } catch { /* Vault partially unreadable; report what counted. */ }
      response.json({ ok: true, vault: root, counts: { files, entities: listEntries().filter(entry => entry.type !== 'capsule').length }, time: clock().toISOString() })
    } catch (error) { next(error) }
  })
  app.get('/today', (_request, response, next) => {
    try {
      const { year, date } = dhakaParts(clock())
      const bodyOf = relative => splitDocument(read(relative)).body.trim()
      const loops = bodyOf('04 Working Memory/Open Loops.md')
      const journalPath = `08 Journal/${year}/${date}.md`
      response.json({ date, snapshot: bodyOf('04 Working Memory/Current Snapshot.md'), openLoops: loops, followups: parseFollowups(loops), journal: bodyOf(journalPath), journalPath, vault: root })
    } catch (error) { next(error) }
  })
  app.get('/blacklist', (_request, response, next) => { try { response.json({ excluded_patterns: blacklist() }) } catch (error) { next(error) } })
  app.post('/blacklist', (request, response, next) => { try { response.json(updateBlacklist(request.body)) } catch (error) { next(error) } })

  function prepareAttachments(messages) {
    return messages.map(message => ({ ...message, attachments: (message.attachments || []).map(file => {
      const id = safeSegment(file.id, 'attachment id')
      if (typeof file.name !== 'string' || file.name.length > 300) throw new InputError('Invalid attachment name.')
      if (file.kind === 'image') {
        const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
        if (!extensions[file.mime] || typeof file.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data) || file.data.length > 2_800_000) throw new InputError('Invalid image attachment.')
        const bytes = Buffer.from(file.data, 'base64')
        if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new InputError('Image must be between 1 byte and 2 MB.')
        return { id, name: file.name, mime: file.mime, kind: file.kind, relative: `02 Sources/Attachments/${id}-${digest(bytes)}.${extensions[file.mime]}`, bytes }
      }
      if (file.kind !== 'text' || typeof file.text !== 'string' || file.text.length > 12_000) throw new InputError('Invalid text attachment.')
      const bytes = Buffer.from(file.text, 'utf8')
      return { id, name: file.name, kind: 'text', mime: 'text/plain', relative: `02 Sources/Attachments/${id}-${digest(bytes)}.txt`, bytes }
    }) }))
  }
  app.post('/capture', (request, response, next) => {
    try {
      const data = request.body
      if (!data || !['conversation', 'web_page', 'browser_visit', 'capsule', 'artifact', 'journal', 'wasnt_accessible', 'blacklist_update'].includes(data.type)) throw new InputError('Unsupported capture type.')
      if (data.url) {
        let url
        try { url = new URL(data.url) } catch { throw new InputError('Invalid capture URL.') }
        if (typeof data.url !== 'string' || !['http:', 'https:'].includes(url.protocol)) throw new InputError('Capture URL must be HTTP or HTTPS.')
      }
      if (data.title !== undefined && typeof data.title !== 'string') throw new InputError('Capture title must be text.')
      if (data.url && excluded(data.url, blacklist())) {
        activity(`skipped - blacklist: ${data.url}; content was not written`)
        return response.json({ ok: true, skipped: true, reason: 'blacklist' })
      }
      if (data.type === 'blacklist_update') return response.json(updateBlacklist(data))
      const now = clock(), captured = timestamp(data.captured_at, now.toISOString())
      const { year, month } = dhakaParts(now)
      let relative, duplicate = false
      if (data.type === 'conversation') {
        const provider = safeSegment(data.provider || 'Other', 'provider')
        const id = safeSegment(data.conversation_id || crypto.randomUUID(), 'conversation id')
        if (!Array.isArray(data.messages) || !data.messages.length || data.messages.length > 2000) throw new InputError('Conversation messages are required (maximum 2,000).')
        const messages = data.messages.map(message => {
          if (!['user', 'assistant', 'system', 'tool', 'unknown'].includes(message.role) || typeof (message.text ?? message.content) !== 'string') throw new InputError('Invalid conversation message.')
          if (message.attachments && (!Array.isArray(message.attachments) || message.attachments.length > 4)) throw new InputError('Maximum four attachments per message.')
          return { ...message, text: message.text ?? message.content, timestamp: timestamp(message.timestamp, captured) }
        })
        const prepared = prepareAttachments(messages)
        const hash = digest(JSON.stringify({ provider, title: data.title, messages }))
        relative = `02 Sources/Conversations/${provider}/${year}/${id}-${hash}.md`
        const metadata = { id: `${id}-${hash}`, conversation_id: id, provider, url: data.url || '', title: data.title || 'Conversation', captured_at: captured, completeness: data.completeness || 'full' }
        const transcript = prepared.map(message => {
          const attachments = message.attachments.map(file => `- ${file.name}: [[${file.relative}]]`).join('\n')
          return `### [${message.role}] ${message.timestamp}\n\n${message.text}${message.thinking ? `\n\n#### Model thinking output\n${message.thinking}` : ''}${message.context ? `\n\n#### Included vault context (source data)\n${message.context}` : ''}${attachments ? `\n\n#### Attachments\n${attachments}` : ''}${message.status ? `\n\nResponse status: ${message.status}` : ''}`
        }).join('\n\n')
        for (const message of prepared) for (const file of message.attachments) writeOnce(file.relative, file.bytes)
        duplicate = writeOnce(relative, yamlDocument(metadata, `# ${metadata.title}\n\nProvider: ${provider}\nURL: ${metadata.url}\n\n## Transcript\n\n${transcript}`))
        // Source snapshots are immutable. Capturing a title is NOT confirmation
        // of a personal-memory claim; no heuristic "confirmed" entity is made.
      } else if (data.type === 'web_page') {
        if (!data.url || typeof data.content !== 'string') throw new InputError('Web page URL and readable content are required.')
        const id = `web-${digest(`${data.url}\n${data.content}`)}`
        relative = `02 Sources/Web Pages/${year}/${id}.md`
        duplicate = writeOnce(relative, yamlDocument({ id, url: data.url, title: data.title || '', captured_at: captured, completeness: data.completeness || 'partial', provider: 'web' }, `# ${data.title || data.url}\n\nSource: ${data.url}\n\n## Content\n\n${data.content}`))
        if (!duplicate) append(`02 Sources/Browser Activity/${year}/${month}.jsonl`, `${JSON.stringify({ url: data.url, title: data.title, captured_at: captured, visited_at: data.visited_at || null, capture_status: 'content-captured', source_id: relative })}\n`)
      } else if (data.type === 'browser_visit') {
        if (!data.url) throw new InputError('Visit URL is required.')
        relative = `02 Sources/Browser Activity/${year}/${month}.jsonl`
        append(relative, `${JSON.stringify({ url: data.url, title: data.title || '', visited_at: timestamp(data.visited_at, captured), captured_at: captured, capture_status: data.capture_status || 'visit-only', source: data.source || 'history-api', interpretation: 'Visit metadata is not proof of reading or agreement.' })}\n`)
      } else if (data.type === 'wasnt_accessible') {
        if (typeof data.reason !== 'string' || !data.reason.trim()) throw new InputError('Failure reason is required.')
        relative = `01 Inbox/Processing Errors/${year}-${month}.md`
        const message = `wasn't accessible - ${data.reason}; URL: ${data.url || '(unavailable)'}; title: ${data.title || ''}; provider: ${data.provider || 'web'}`
        append(relative, `- [${captured}] ${message.replace(/\r?\n/g, ' ')}\n`)
        activity(message)
        return response.json({ ok: true, source: relative })
      } else if (data.type === 'capsule') {
        const capsule = data.capsule
        if (!capsule || typeof capsule.title !== 'string' || !capsule.title.trim()) throw new InputError('Capsule title is required.')
        const id = safeSegment(capsule.id, 'capsule id')
        const lists = ['goals', 'constraints', 'decisions', 'sources', 'attachments']
        for (const key of lists) if (capsule[key] && (!Array.isArray(capsule[key]) || capsule[key].some(item => typeof item !== 'string'))) throw new InputError(`Capsule ${key} must be a list of strings.`)
        if (capsule.background && typeof capsule.background !== 'string') throw new InputError('Capsule background must be text.')
        const version = Number(capsule.version || 1)
        if (!Number.isSafeInteger(version) || version < 1) throw new InputError('Invalid capsule version.')
        relative = `03 Memory/Entities/${id.startsWith('capsule-') ? id : `capsule-${id}`}-v${version}-${digest(JSON.stringify(capsule))}.md`
        const metadata = { ...capsule, id, version, type: 'capsule', status: capsule.status || 'active', captured_at: captured }
        const body = `# Capsule: ${capsule.title}\n\n## Goals\n${(capsule.goals || []).map(item => `- ${item}`).join('\n')}\n\n## Constraints\n${(capsule.constraints || []).map(item => `- ${item}`).join('\n')}\n\n## Background\n${capsule.background || ''}\n\n## Decisions\n${(capsule.decisions || []).map(item => `- ${item}`).join('\n')}\n\n## Sources\n${(capsule.sources || []).map(item => `- ${item}`).join('\n')}`
        duplicate = writeOnce(relative, yamlDocument(metadata, body))
      } else if (data.type === 'artifact') {
        // Restored from this branch: the artifact panel can file a runnable
        // artifact into the vault beside a linked note.
        const artifact = data.artifact || {}
        const id = safeSegment(String(artifact.id || crypto.randomUUID()), 'artifact id')
        const kind = ['svg', 'react', 'javascript', 'python'].includes(artifact.type) ? artifact.type : 'html'
        const extension = { svg: 'svg', react: 'jsx', javascript: 'js', python: 'py', html: 'html' }[kind]
        if (typeof artifact.content !== 'string' || !artifact.content.trim()) throw new InputError('Artifact content is required.')
        if (artifact.content.length > 1_000_000) throw new InputError('Artifact must be under 1,000,000 characters.')
        const version = Number(artifact.version || 1)
        if (!Number.isSafeInteger(version) || version < 1) throw new InputError('Invalid artifact version.')
        const title = String(artifact.title || 'Artifact').replace(/\r?\n/g, ' ').slice(0, 200)
        const hash = digest(artifact.content)
        const fileName = `${id}-v${version}-${hash}.${extension}`
        relative = `02 Sources/Attachments/artifacts/${id}-v${version}-${hash}.md`
        duplicate = writeOnce(`02 Sources/Attachments/artifacts/${fileName}`, Buffer.from(artifact.content, 'utf8'))
        writeOnce(relative, yamlDocument({ id: `artifact-${id}`, type: 'artifact', title, artifact_type: kind, file: fileName, version, captured_at: captured, source_url: data.url || '' },
          `# ${title}\n\nFile: [[${fileName}]]\n\nVersion ${version}. The runnable file is stored beside this note and is never overwritten by a later version.`))
      } else if (data.type === 'journal') {
        if (typeof data.content !== 'string' || !data.content.trim()) throw new InputError('Journal content is required.')
        const day = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(data.date || '') ? data.date : dhakaParts(now).date
        relative = `08 Journal/${day.slice(0, 4)}/${day}.md`
        duplicate = writeOnce(relative, yamlDocument({ id: `journal-${day}`, type: 'journal', date: day, captured_at: captured }, data.content))
      }
      activity(`${duplicate ? 'duplicate kept' : 'captured'}: ${data.type}; source: [[${relative}]]`)
      response.json({ ok: true, source: relative, duplicate })
    } catch (error) { next(error) }
  })
  function listEntries() {
    const directory = filePath('03 Memory/Entities')
    if (!fs.existsSync(directory)) return []
    const files = fs.readdirSync(directory).filter(file => file.endsWith('.md'))
    const entries = []
    for (const file of files) {
      const source = `03 Memory/Entities/${file}`
      const { metadata, body } = splitDocument(read(source))
      if (!metadata.id) continue
      const title = metadata.title || body.match(/^# (?:Capsule: )?(.+)$/m)?.[1] || file.replace(/\.md$/, '')
      if (typeof title !== 'string') continue
      entries.push({ ...metadata, title, content: body, source, background: metadata.background || section(body, 'Background'), version: Number(metadata.version) || 1, type: metadata.type || (file.startsWith('capsule-') ? 'capsule' : 'entity') })
    }
    // Immutable capsule captures can contain several versions of the same id.
    // Library returns the latest, while older Markdown sources remain intact.
    const latest = new Map()
    for (const entry of entries) {
      const previous = latest.get(entry.id)
      if (!previous || entry.version > previous.version || entry.version === previous.version && (entry.updated || entry.captured_at || '') > (previous.updated || previous.captured_at || '')) latest.set(entry.id, entry)
    }
    return [...latest.values()].filter(entry => !['archived', 'expired', 'superseded'].includes(entry.status))
  }
  function search(entries, query) {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return entries
    const words = q.split(/\s+/).filter(word => word.length > 2)
    return entries.map(entry => {
      const title = entry.title.toLowerCase(), body = entry.content.toLowerCase()
      let score = title.includes(q) ? 10 : 0
      for (const word of words) score += title.includes(word) ? 3 : body.includes(word) ? 1 : 0
      return { ...entry, score }
    }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score)
  }
  app.get('/capsules', (request, response, next) => {
    try { response.json({ capsules: search(listEntries().filter(entry => entry.type === 'capsule'), request.query.q).slice(0, 100) }) }
    catch (error) { next(error) }
  })
  app.get('/context', (request, response, next) => {
    try {
      const entries = request.query.q ? search(listEntries(), request.query.q).slice(0, 5) : []
      response.json({ capsules: entries.filter(entry => entry.type === 'capsule'), entities: entries.filter(entry => entry.type !== 'capsule'), claims: [], retrieval: 'local-keyword-search' })
    } catch (error) { next(error) }
  })
  // Deployable export. Builds a ZIP in memory from caller-supplied text files.
  // Nothing is written to the vault, and no filesystem path is taken from the
  // request: names are normalised and rejected if they try to escape.
  app.post('/export-zip', (request, response, next) => {
    try {
      const files = request.body?.files
      if (!Array.isArray(files) || !files.length) throw new InputError('Nothing to export: no files were provided.')
      if (files.length > 200) throw new InputError('Too many files: a deployable export is limited to 200 files.')
      const entries = files.map(file => {
        if (typeof file?.content !== 'string') throw new InputError('Every exported file needs text content.')
        if (file.content.length > 2_000_000) throw new InputError('Each exported file is limited to 2 MB.')
        return { name: safeEntryName(file.name), content: file.content }
      })
      const zip = createZip(entries)
      response.json({ ok: true, filename: `ai-assistant-artifact-${dhakaParts().date}.zip`, zip: zip.toString('base64'), bytes: zip.length })
    } catch (error) { next(error instanceof InputError ? error : new InputError(error.message)) }
  })
  app.use((error, _request, response, _next) => {
    const status = error instanceof InputError || error instanceof SyntaxError ? 400 : error.status || 500
    response.status(status).json({ error: status === 500 ? 'Vault operation failed. Check the vault API terminal and folder permissions.' : error.message })
    if (status === 500) console.error(error.message)
  })
  return app
}
if (require.main === module) {
  try {
    const app = createVaultApp()
    const port = Number(process.env.AI_ASSISTANT_VAULT_PORT || process.env.PORT || 8765), host = process.env.HOST || '127.0.0.1'
    const server = app.listen(port, host, () => {
      console.log(`AI ASSistant Vault API running at http://${host}:${port}`)
      console.log(`Canonical vault: ${process.env.AI_BRAIN_VAULT || DEFAULT_VAULT_PATH}`)
    })
    server.on('error', error => { console.error(`Vault API could not start: ${error.message}`); process.exitCode = 1 })
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
module.exports = { createVaultApp, DEFAULT_VAULT_PATH, dhakaParts, excluded, safeSegment, parseFollowups }
