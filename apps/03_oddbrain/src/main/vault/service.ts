/**
 * The vault service.
 *
 * This is the old companion server's `vault-api.cjs` moved into the main
 * process: same folders, same file names, same wording in the documents it
 * writes, because those are the user's files and they outlive any interface.
 * What changed is where it runs and how it is reached. Before, a second Node
 * process had to be started by hand and the renderer spoke HTTP to port 8765.
 * Now it lives in the app: no second process, no port, nothing to start.
 *
 * It takes a vault path and a clock and returns operations. It does not import
 * Electron, open a socket or write to the console, so every rule below is
 * testable directly.
 */
import { existsSync, readdirSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { InputError, VaultMissingError } from './errors'
import { createVaultFiles, toPosix, type VaultFiles } from './files'
import { PRIVACY_FILE, SCOPE_FILE, excluded, readPatterns, replacePatterns } from './blacklist'
import { digest, dhakaParts, parseFollowups, safeSegment, section, splitDocument, timestamp, yamlDocument } from './text'
import { createZip, safeEntryName } from './zip'
import { syncConversation } from './conversations'
import { createVaultSearch, type SearchRequest, type VaultSearch } from './search'

export type Payload = Record<string, any>

export type VaultStatus = {
  ok: boolean
  available: boolean
  vault: string
  counts: { files: number; entities: number }
  time: string
  error?: string
}

export type VaultService = ReturnType<typeof createVaultService>

/**
 * Where the vault is, in order of who wins:
 *
 * 1. a path the app was told to use (later: Settings; today: an environment
 *    variable, which is also how the tests and the browser preview point at a
 *    throwaway vault)
 * 2. `vault/Brain` in the checkout, so a fresh clone works with no setup
 * 3. `<userData>/vault`, for a packaged build
 *
 * The first path that exists wins; if none exists the first candidate is
 * reported, so the message can name the folder the user was expected to have.
 */
export function resolveVaultRoot(candidates: string[]): { root: string; available: boolean } {
  const cleaned = candidates.filter((candidate): candidate is string => Boolean(candidate))
  const found = cleaned.find(candidate => existsSync(candidate))
  const root = resolve(found || cleaned[0] || 'vault')
  return { root, available: existsSync(root) }
}

const noVaultMessage = (root: string): string =>
  `No vault at ${root}. Point the app at an existing Markdown vault, or create that folder and try again, an empty replacement vault is never created for you.`

export function createVaultService({
  vaultPath,
  clock = () => new Date(),
}: {
  vaultPath: string
  clock?: () => Date
}) {
  const root = resolve(vaultPath)
  const available = (): boolean => existsSync(root)

  // Built on first use, so the service can exist while the vault folder does
  // not: the app opens, says what is missing, and picks the vault up the moment
  // it appears without a restart.
  let files: VaultFiles | null = null
  let indexed: VaultSearch | null = null
  function vault(): VaultFiles {
    if (!files) {
      if (!existsSync(root)) throw new VaultMissingError(noVaultMessage(root))
      files = createVaultFiles(root, clock)
    }
    return files
  }
  /** One search over notes and captured messages. Built with the vault, so
   *  neither exists before the folder does. */
  function searcher(): VaultSearch {
    if (!indexed) indexed = createVaultSearch(vault(), () => clock().getTime())
    return indexed
  }

  function status(): VaultStatus {
    if (!available()) {
      return {
        ok: false,
        available: false,
        vault: root,
        counts: { files: 0, entities: 0 },
        time: clock().toISOString(),
        error: noVaultMessage(root),
      }
    }
    const store = vault()
    return {
      ok: true,
      available: true,
      vault: root,
      counts: { files: store.countFiles(), entities: listEntries().filter(entry => entry.type !== 'capsule').length },
      time: clock().toISOString(),
    }
  }

  /**
   * The month's own audit, in 06 Review/Monthly Audits. Written once — the
   * first time the app opens in a new month — from the vault's own numbers,
   * never invented. No scheduler sits behind it: opening the app IS the
   * schedule, and a boot or a vault choice is all it waits for. Last month's
   * page is never edited; the new month writes beside it.
   */
  const AUDIT_DIR = '06 Review/Monthly Audits'
  function lastAuditMonth(): string {
    try {
      if (!existsSync(root)) return ''
      const parsed = JSON.parse(vault().read(`${AUDIT_DIR}/.last-audit.json`) || '') as { month?: string }
      return typeof parsed.month === 'string' ? parsed.month : ''
    } catch {
      return ''
    }
  }
  function monthlyAudit(): { written: boolean; relative: string; month: string } {
    const store = vault()
    const { year, month } = dhakaParts(clock())
    const label = `${year}-${month}`
    const record = `${AUDIT_DIR}/.last-audit.json`
    if (lastAuditMonth() === label) {
      return { written: false, relative: `${AUDIT_DIR}/${label}.md`, month: label }
    }
    // The facts are read, not remembered: counts and link health as the vault
    // holds them at the moment of writing.
    const sources = store.walkFiles('02 Sources', '.md', 8000)
    const journals = store.walkFiles(`08 Journal/${year}`, '.md', 4000)
    const loopsBody = splitDocument(store.read('04 Working Memory/Open Loops.md')).body
    const openLoops = (loopsBody.match(/^\s*[-*] \[ \]/gm) ?? []).length
    let health: ReturnType<typeof links> | null = null
    try {
      health = links()
    } catch {
      // A link walk that cannot finish costs the audit one section, not the page.
    }
    const shorten = (rows: Array<{ from: string; target: string }>): string =>
      rows.slice(0, 8).map(row => `- \`${row.from}\` → ${row.target}`).join('\n')
    const dead = health ? shorten(health.dead) : ''
    const ambiguous = health
      ? health.ambiguous
          .slice(0, 8)
          .map(row => `- \`${row.from}\` → ${row.target} (${row.matches.length} candidates)`)
          .join('\n')
      : ''
    const lines = [
      `# Monthly Audit, ${label}`,
      '',
      'Written by the app, once, the first time it opened in this month. No',
      'scheduler wrote this, opening the app is the schedule. The numbers are',
      "the vault's own, read the moment this page was made.",
      '',
      '## The month in numbers',
      '',
      `- Files in the vault: ${store.countFiles()}`,
      `- Notes in 02 Sources: ${sources.files.length}${sources.capped ? ' (count stopped at the walk limit)' : ''}`,
      `- Journal entries in 08 Journal/${year}: ${journals.files.length}${journals.capped ? ' (count stopped at the walk limit)' : ''}`,
      `- Open loops still open: ${openLoops}`,
      health
        ? `- Links checked: ${health.checked} (dead: ${health.dead.length}, ambiguous: ${health.ambiguous.length})`
        : '- Links: not measured this month (the walk did not finish).',
      '',
      '## Worth a look',
      '',
      dead ? `Dead links, targets that resolve to nothing:\n\n${dead}\n` : 'No dead links found.',
      '',
      ambiguous
        ? `Ambiguous links, a basename several files share:\n\n${ambiguous}\n`
        : 'No ambiguous links found.',
      '',
      '## Settle, then move on',
      '',
      'Fix or archive what this page names, then leave it, next month writes a',
      'fresh page beside this one and never edits it.',
      '',
    ]
    // writeOnce answers true when the file was already there; the audit's
    // caller wants to know whether THIS call put a page on disk.
    const existed = store.writeOnce(`${AUDIT_DIR}/${label}.md`, lines.join('\n'))
    store.write(record, `${JSON.stringify({ month: label, at: clock().toISOString() }, null, 2)}\n`)
    return { written: !existed, relative: `${AUDIT_DIR}/${label}.md`, month: label }
  }

  /** Snapshot, open loops, parsed follow-ups and today's journal path. */
  function today() {
    const store = vault()
    const { year, date } = dhakaParts(clock())
    const bodyOf = (relative: string): string => splitDocument(store.read(relative)).body.trim()
    const loops = bodyOf('04 Working Memory/Open Loops.md')
    const journalPath = `08 Journal/${year}/${date}.md`
    return {
      date,
      snapshot: bodyOf('04 Working Memory/Current Snapshot.md'),
      openLoops: loops,
      followups: parseFollowups(loops),
      journal: bodyOf(journalPath),
      journalPath,
      vault: root,
      audit: lastAuditMonth(),
    }
  }

  /** Every pattern either canonical document declares, without duplicates. */
  function blacklist(): string[] {
    const store = vault()
    return [...new Set([...readPatterns(store.read(PRIVACY_FILE)), ...readPatterns(store.read(SCOPE_FILE))])]
  }

  /**
   * Add to, remove from, or replace the never-check list.
   *
   * Both documents are updated, their previous text is archived first under
   * "90 Archive/System Revisions", and a failed write puts the old text back —
   * so the two files are never left disagreeing about what is excluded.
   */
  function updateBlacklist(data: Payload) {
    const store = vault()
    const incomingRaw = data?.excluded_patterns
    if (
      !Array.isArray(incomingRaw) ||
      incomingRaw.length > 500 ||
      incomingRaw.some(
        pattern =>
          typeof pattern !== 'string' || !pattern.trim() || pattern.length > 500 || /[\r\n]/.test(pattern)
      )
    ) {
      throw new InputError('Use up to 500 non-empty URL/domain patterns, one per entry.')
    }
    const incoming = incomingRaw.map((pattern: string) => pattern.trim())
    const action = data?.action || 'set'
    if (!['add', 'remove', 'set'].includes(action)) throw new InputError('Invalid blacklist action.')
    const previous = blacklist()
    const next = [
      ...new Set(
        action === 'add'
          ? [...previous, ...incoming]
          : action === 'remove'
            ? previous.filter(pattern => !incoming.includes(pattern))
            : incoming
      ),
    ]
    const stamp = `${clock().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`
    const changes = [PRIVACY_FILE, SCOPE_FILE]
      .map(relative => {
        const before = store.read(relative) || '# Source Scope\n\nGlobal default allow, explicit deny.\n'
        const after = replacePatterns(before, next)
        return { relative, before, after }
      })
      .filter(change => change.before !== change.after)
    for (const { relative, before } of changes) {
      store.writeOnce(`90 Archive/System Revisions/${stamp}-${basename(relative)}`, before)
    }
    try {
      for (const { relative, after } of changes) store.write(relative, after)
    } catch (error) {
      // Best-effort rollback; the immutable revisions above are also kept.
      for (const { relative, before } of changes) {
        try {
          store.write(relative, before)
        } catch {
          /* The API reports failure, never success. */
        }
      }
      throw error
    }
    store.activity(
      `blacklist updated; ${next.length} excluded patterns; previous system documents kept in 90 Archive/System Revisions/`
    )
    return { ok: true, excluded_patterns: next }
  }

  /** Attachments are copied into the vault beside the capture that referenced them. */
  function prepareAttachments(messages: Payload[]): Payload[] {
    return messages.map(message => ({
      ...message,
      attachments: (message.attachments || []).map((file: Payload) => {
        const id = safeSegment(file.id, 'attachment id')
        if (typeof file.name !== 'string' || file.name.length > 300) throw new InputError('Invalid attachment name.')
        if (file.kind === 'image') {
          const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
          const extension = extensions[file.mime]
          if (
            !extension ||
            typeof file.data !== 'string' ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data) ||
            file.data.length > 2_800_000
          ) {
            throw new InputError('Invalid image attachment.')
          }
          const bytes = Buffer.from(file.data, 'base64')
          if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new InputError('Image must be between 1 byte and 2 MB.')
          return { id, name: file.name, mime: file.mime, kind: file.kind, relative: `02 Sources/Attachments/${id}-${digest(bytes)}.${extension}`, bytes }
        }
        if (file.kind !== 'text' || typeof file.text !== 'string' || file.text.length > 12_000) {
          throw new InputError('Invalid text attachment.')
        }
        const bytes = Buffer.from(file.text, 'utf8')
        return { id, name: file.name, kind: 'text', mime: 'text/plain', relative: `02 Sources/Attachments/${id}-${digest(bytes)}.txt`, bytes }
      }),
    }))
  }

  function capture(data: Payload) {
    const store = vault()
    if (data?.type === 'browser_visit') throw new InputError('Browser-history capture has been retired. Update the extension; existing saved visits are preserved.')
    const types = ['conversation', 'web_page', 'a11y_tree', 'capsule', 'artifact', 'journal', 'wasnt_accessible', 'blacklist_update']
    if (!data || !types.includes(data.type)) throw new InputError('Unsupported capture type.')
    if (data.url) {
      let url: URL
      try {
        url = new URL(data.url)
      } catch {
        throw new InputError('Invalid capture URL.')
      }
      if (typeof data.url !== 'string' || !['http:', 'https:'].includes(url.protocol)) {
        throw new InputError('Capture URL must be HTTP or HTTPS.')
      }
    }
    if (data.title !== undefined && typeof data.title !== 'string') throw new InputError('Capture title must be text.')
    // The never-check list is checked before anything else is read or written,
    // and a skipped capture is logged rather than silently dropped.
    if (data.url && excluded(data.url, blacklist())) {
      store.activity(`skipped - blacklist: ${data.url}; content was not written`)
      return { ok: true, skipped: true, reason: 'blacklist' }
    }
    if (data.type === 'blacklist_update') return updateBlacklist(data)

    const now = clock()
    const captured = timestamp(data.captured_at, now.toISOString())
    const { year, month } = dhakaParts(now)
    let relative = ''
    let duplicate = false

    if (data.type === 'conversation') {
      const provider = safeSegment(data.provider || 'Other', 'provider')
      const id = safeSegment(data.conversation_id || randomUUID(), 'conversation id')
      if (!Array.isArray(data.messages) || !data.messages.length || data.messages.length > 2000) {
        throw new InputError('Conversation messages are required (maximum 2,000).')
      }
      const messages = data.messages.map((message: Payload) => {
        if (
          !['user', 'assistant', 'system', 'tool', 'unknown'].includes(message.role) ||
          typeof (message.text ?? message.content) !== 'string'
        ) {
          throw new InputError('Invalid conversation message.')
        }
        if (message.attachments && (!Array.isArray(message.attachments) || message.attachments.length > 4)) {
          throw new InputError('Maximum four attachments per message.')
        }
        return { ...message, text: message.text ?? message.content, timestamp: timestamp(message.timestamp, captured) }
      })
      const prepared = prepareAttachments(messages)
      // The file is named after the content, so the same conversation captured
      // twice is one file, and an edited conversation is a new one beside it.
      const hash = digest(JSON.stringify({ provider, title: data.title, messages }))
      relative = `02 Sources/Conversations/${provider}/${year}/${id}-${hash}.md`
      const metadata = {
        id: `${id}-${hash}`,
        conversation_id: id,
        provider,
        url: data.url || '',
        title: data.title || 'Conversation',
        captured_at: captured,
        completeness: data.completeness || 'full',
      }
      const transcript = prepared
        .map((message: Payload) => {
          const attachments = message.attachments.map((file: Payload) => `- ${file.name}: [[${file.relative}]]`).join('\n')
          return `### [${message.role}] ${message.timestamp}\n\n${message.text}${
            message.thinking ? `\n\n#### Model thinking output\n${message.thinking}` : ''
          }${message.context ? `\n\n#### Included vault context (source data)\n${message.context}` : ''}${
            attachments ? `\n\n#### Attachments\n${attachments}` : ''
          }${message.status ? `\n\nResponse status: ${message.status}` : ''}`
        })
        .join('\n\n')
      for (const message of prepared) {
        for (const file of message.attachments) store.writeOnce(file.relative, file.bytes)
      }
      duplicate = store.writeOnce(
        relative,
        yamlDocument(metadata, `# ${metadata.title}\n\nProvider: ${provider}\nURL: ${metadata.url}\n\n## Transcript\n\n${transcript}`)
      )
      if (provider === 'OddBrain') {
        // A structured sidecar for new in-app captures. The original Markdown,
        // model thinking/context and attachments remain untouched. Only actual
        // message text is eligible for the separate review-only organizer.
        const sha = (value: string) => createHash('sha256').update(value).digest('hex')
        const base = `02 Sources/Conversations/App/${sha(provider + '\n' + id)}`
        for (const message of prepared) {
          const m = { id: typeof message.id === 'string' && message.id ? message.id : sha(JSON.stringify({ role: message.role, text: message.text, timestamp: message.timestamp })), role: message.role, speaker: '', text: message.text, timestamp: message.timestamp }
          const checksum = sha(JSON.stringify(m)), record = JSON.stringify({ message: m, hash: checksum, observed_at: captured })
          store.writeOnce(`${base}/revisions/${sha(m.id)}-${checksum}.json`, record)
          store.writeAtomic(`${base}/messages/${sha(m.id)}.json`, record)
        }
        store.writeAtomic(`${base}/conversation.json`, JSON.stringify({ key: id, provider, adapter: 'oddbrain', title: metadata.title, url: metadata.url, original: relative }))
      }
      // Source snapshots are immutable. Capturing a conversation title is NOT
      // confirmation of a personal fact, so no entity is created here.
    } else if (data.type === 'web_page') {
      if (!data.url || typeof data.content !== 'string') throw new InputError('Web page URL and readable content are required.')
      const id = `web-${digest(`${data.url}\n${data.content}`)}`
      relative = `02 Sources/Web Pages/${year}/${id}.md`
      duplicate = store.writeOnce(
        relative,
        yamlDocument(
          {
            id,
            url: data.url,
            title: data.title || '',
            captured_at: captured,
            completeness: data.completeness || 'partial',
            provider: 'web',
          },
          `# ${data.title || data.url}\n\nSource: ${data.url}\n\n## Content\n\n${data.content}`
        )
      )
      if (!duplicate) {
        store.append(
          `02 Sources/Browser Activity/${year}/${month}.jsonl`,
          `${JSON.stringify({
            url: data.url,
            title: data.title,
            captured_at: captured,
            visited_at: data.visited_at || null,
            capture_status: 'content-captured',
            source_id: relative,
          })}\n`
        )
      }
    } else if (data.type === 'a11y_tree') {
      // Prophet (A.7): structure over screenshots. The tree is roles and
      // names — what the page IS, never its full text — and the counts say
      // what was held back.
      if (!data.url || typeof data.tree !== 'string' || !data.tree.trim()) {
        throw new InputError('A11y tree URL and tree are required.')
      }
      if (typeof data.nodes !== 'number' || data.nodes < 1 || data.nodes > 400) {
        throw new InputError('A11y tree nodes must be between 1 and 400.')
      }
      if (typeof data.depth !== 'number' || data.depth < 1 || data.depth > 12) {
        throw new InputError('A11y tree depth must be between 1 and 12.')
      }
      const id = `a11y-${digest(`${data.url}\n${data.tree}`)}`
      relative = `02 Sources/A11y Trees/${year}/${id}.md`
      duplicate = store.writeOnce(
        relative,
        yamlDocument(
          {
            id,
            url: data.url,
            title: data.title || '',
            captured_at: captured,
            nodes: data.nodes,
            depth: data.depth,
            completeness: data.completeness || 'full',
            provider: 'web',
          },
          `# ${data.title || data.url}\n\nSource: ${data.url}\n\n## Accessibility tree\n\n\`\`\`\n${data.tree}\n\`\`\``
        )
      )
      if (!duplicate) {
        store.append(
          `02 Sources/Browser Activity/${year}/${month}.jsonl`,
          `${JSON.stringify({
            url: data.url,
            title: data.title,
            captured_at: captured,
            visited_at: data.visited_at || null,
            capture_status: 'structure-captured',
            source_id: relative,
            nodes: data.nodes,
            depth: data.depth,
          })}\n`
        )
      }
    } else if (data.type === 'wasnt_accessible') {
      if (typeof data.reason !== 'string' || !data.reason.trim()) throw new InputError('Failure reason is required.')
      relative = `01 Inbox/Processing Errors/${year}-${month}.md`
      const message = `wasn't accessible - ${data.reason}; URL: ${data.url || '(unavailable)'}; title: ${data.title || ''}; provider: ${data.provider || 'web'}`
      store.append(relative, `- [${captured}] ${message.replace(/\r?\n/g, ' ')}\n`)
      store.activity(message)
      return { ok: true, source: relative }
    } else if (data.type === 'capsule') {
      const capsule = data.capsule
      if (!capsule || typeof capsule.title !== 'string' || !capsule.title.trim()) throw new InputError('Capsule title is required.')
      const id = safeSegment(capsule.id, 'capsule id')
      if (id.startsWith('memory-')) throw new InputError('This capsule is reviewed memory. Correct it in Brain → Memory inbox instead.')
      for (const key of ['goals', 'constraints', 'decisions', 'sources', 'attachments']) {
        if (capsule[key] && (!Array.isArray(capsule[key]) || capsule[key].some((item: unknown) => typeof item !== 'string'))) {
          throw new InputError(`Capsule ${key} must be a list of strings.`)
        }
      }
      if (capsule.background && typeof capsule.background !== 'string') throw new InputError('Capsule background must be text.')
      const version = Number(capsule.version || 1)
      if (!Number.isSafeInteger(version) || version < 1) throw new InputError('Invalid capsule version.')
      const fileId = id.startsWith('capsule-') ? id : `capsule-${id}`
      relative = `03 Memory/Entities/${fileId}-v${version}-${digest(JSON.stringify(capsule))}.md`
      const metadata = { ...capsule, id, version, type: 'capsule', status: capsule.status || 'active', captured_at: captured }
      const body = `# Capsule: ${capsule.title}\n\n## Goals\n${(capsule.goals || []).map((item: string) => `- ${item}`).join('\n')}\n\n## Constraints\n${(capsule.constraints || [])
        .map((item: string) => `- ${item}`)
        .join('\n')}\n\n## Background\n${capsule.background || ''}\n\n## Decisions\n${(capsule.decisions || [])
        .map((item: string) => `- ${item}`)
        .join('\n')}\n\n## Sources\n${(capsule.sources || []).map((item: string) => `- ${item}`).join('\n')}`
      duplicate = store.writeOnce(relative, yamlDocument(metadata, body))
    } else if (data.type === 'artifact') {
      // The runnable file is stored beside a linked note, so the artifact is
      // usable from the vault alone and a later version never overwrites it.
      const artifact = data.artifact || {}
      const id = safeSegment(String(artifact.id || randomUUID()), 'artifact id')
      const kind = ['svg', 'react', 'javascript', 'python'].includes(artifact.type) ? artifact.type : 'html'
      const extension = { svg: 'svg', react: 'jsx', javascript: 'js', python: 'py', html: 'html' }[kind as string]
      if (typeof artifact.content !== 'string' || !artifact.content.trim()) throw new InputError('Artifact content is required.')
      if (artifact.content.length > 1_000_000) throw new InputError('Artifact must be under 1,000,000 characters.')
      const version = Number(artifact.version || 1)
      if (!Number.isSafeInteger(version) || version < 1) throw new InputError('Invalid artifact version.')
      const title = String(artifact.title || 'Artifact').replace(/\r?\n/g, ' ').slice(0, 200)
      const hash = digest(artifact.content)
      const fileName = `${id}-v${version}-${hash}.${extension}`
      relative = `02 Sources/Attachments/artifacts/${id}-v${version}-${hash}.md`
      duplicate = store.writeOnce(`02 Sources/Attachments/artifacts/${fileName}`, Buffer.from(artifact.content, 'utf8'))
      store.writeOnce(
        relative,
        yamlDocument(
          {
            id: `artifact-${id}`,
            type: 'artifact',
            title,
            artifact_type: kind,
            file: fileName,
            version,
            captured_at: captured,
            source_url: data.url || '',
          },
          `# ${title}\n\nFile: [[${fileName}]]\n\nVersion ${version}. The runnable file is stored beside this note and is never overwritten by a later version.`
        )
      )
    } else if (data.type === 'journal') {
      if (typeof data.content !== 'string' || !data.content.trim()) throw new InputError('Journal content is required.')
      const day = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(data.date || '') ? data.date : dhakaParts(now).date
      relative = `08 Journal/${day.slice(0, 4)}/${day}.md`
      duplicate = store.writeOnce(relative, yamlDocument({ id: `journal-${day}`, type: 'journal', date: day, captured_at: captured }, data.content))
    }

    store.activity(`${duplicate ? 'duplicate kept' : 'captured'}: ${data.type}; source: [[${relative}]]`)
    return { ok: true, source: relative, duplicate }
  }

  /** Everything in "03 Memory/Entities", newest version of each id only. */
  function listEntries(): Payload[] {
    const store = vault()
    const entries: Payload[] = []
    let reviewed: { proposals?: Array<{ id: string; kind: string; state: string; revision: number }> } = {}, projections: Record<string, string> = {}
    try { reviewed = JSON.parse(store.read('06 Review/Organizer/state.json') || '{}'); projections = JSON.parse(store.read('06 Review/Organizer/projections.json') || '{}') } catch { /* Fail closed for generated memory, not for ordinary manual capsules. */ }
    for (const file of store.listMarkdown('03 Memory/Entities')) {
      const source = `03 Memory/Entities/${file}`
      const original = store.read(source), { metadata, body } = splitDocument(original)
      if (!metadata.id) continue
      if (String(metadata.id).startsWith('memory-')) {
        const record = Array.isArray(reviewed?.proposals) ? reviewed.proposals.find(p => `memory-${p.id}` === metadata.id && p.kind === 'capsule' && p.state === 'approved' && p.revision === Number(metadata.version)) : null
        if (!record || createHash('sha256').update(original).digest('hex') !== projections?.[source]) continue
        metadata.suggestion_safe = false
      }
      const title = metadata.title || body.match(/^# (?:Capsule: )?(.+)$/m)?.[1] || file.replace(/\.md$/, '')
      if (typeof title !== 'string') continue
      entries.push({
        ...metadata,
        title,
        content: body,
        source,
        background: metadata.background || section(body, 'Background'),
        version: Number(metadata.version) || 1,
        type: metadata.type || (file.startsWith('capsule-') ? 'capsule' : 'entity'),
      })
    }
    // Immutable captures can hold several versions of the same id: the library
    // shows the latest while every older Markdown source stays intact.
    const latest = new Map<string, Payload>()
    for (const entry of entries) {
      const previous = latest.get(entry.id)
      if (
        !previous ||
        entry.version > previous.version ||
        (entry.version === previous.version && (entry.updated || entry.captured_at || '') > (previous.updated || previous.captured_at || ''))
      ) {
        latest.set(entry.id, entry)
      }
    }
    return [...latest.values()].filter(entry => !['archived', 'expired', 'superseded'].includes(entry.status))
  }

  /** Keyword ranking, no embeddings and no network: the vault searches itself. */
  function search(entries: Payload[], query: string): Payload[] {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return entries
    const words = q.split(/\s+/).filter(word => word.length > 2)
    return entries
      .map(entry => {
        const title = String(entry.title).toLowerCase()
        const body = String(entry.content).toLowerCase()
        let score = title.includes(q) ? 10 : 0
        for (const word of words) score += title.includes(word) ? 3 : body.includes(word) ? 1 : 0
        return { ...entry, score }
      })
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score)
  }

  function capsules(query = ''): Payload[] {
    return search(listEntries().filter(entry => entry.type === 'capsule' && entry.status !== 'withdrawn'), query).slice(0, 100)
  }

  function context(query: string) {
    const entries = query ? search(listEntries().filter(entry => entry.suggestion_safe !== false && entry.status !== 'withdrawn'), query).slice(0, 5) : []
    return {
      capsules: entries.filter(entry => entry.type === 'capsule'),
      entities: entries.filter(entry => entry.type !== 'capsule'),
      claims: [],
      retrieval: 'local-keyword-search',
    }
  }

  /**
   * A deployable export: a ZIP built in memory from caller-supplied text files.
   * Nothing is written to the vault and no path is taken from the request —
   * entry names are normalised and refused if they try to escape.
   */
  function exportZip(payload: Payload) {
    const list = payload?.files
    if (!Array.isArray(list) || !list.length) throw new InputError('Nothing to export: no files were provided.')
    if (list.length > 200) throw new InputError('Too many files: a deployable export is limited to 200 files.')
    let zip: Buffer
    try {
      const entries = list.map((file: Payload) => {
        if (typeof file?.content !== 'string') throw new InputError('Every exported file needs text content.')
        if (file.content.length > 2_000_000) throw new InputError('Each exported file is limited to 2 MB.')
        return { name: safeEntryName(file.name), content: file.content as string }
      })
      zip = createZip(entries)
    } catch (error) {
      // The writer refuses names that try to leave the archive. That is the
      // caller's mistake, so it is answered as one rather than as a failure.
      throw error instanceof InputError ? error : new InputError((error as Error).message)
    }
    return {
      ok: true,
      filename: `oddbrain-artifact-${dhakaParts(clock()).date}.zip`,
      zip: zip.toString('base64'),
      bytes: zip.length,
    }
  }

  /**
   * onui — the page on the user's screen, as the capture door last saw it
   * (A.6: the engine queries the browser). Reads the newest line of the
   * newest browser-activity log; when that line carries a captured page,
   * the readable text rides along, capped. A visit-only line is reported as
   * exactly that: metadata, never proof of reading. Nothing here is
   * invented — no capture, no page.
   */
  function onui(): Record<string, unknown> {
    const store = vault()
    // The logs are .jsonl, so they are walked directly (listMarkdown only
    // lists .md); the root comes from the store, so the path rules hold.
    const activityRoot = `02 Sources/Browser Activity`
    const root = store.root
    if (!existsSync(join(root, activityRoot))) {
      return { page: null, message: 'No browser capture yet. When the extension captures a page, this answers with it.' }
    }
    const years = readdirSync(join(root, activityRoot))
      .filter(entry => /^\d{4}$/.test(entry))
      .sort()
      .reverse()
    let newest = ''
    for (const year of years) {
      const files = readdirSync(join(root, activityRoot, year))
        .filter(entry => entry.endsWith('.jsonl'))
        .sort()
        .reverse()
      if (files.length) {
        newest = toPosix(join(activityRoot, year, files[0]))
        break
      }
    }
    if (!newest) return { page: null, message: 'No browser capture yet. When the extension captures a page, this answers with it.' }
    const lines = store.read(newest).split('\n').filter(line => line.trim())
    if (!lines.length) return { page: null, message: 'The newest browser-activity log is empty.' }
    let event: Record<string, unknown>
    try {
      event = JSON.parse(lines[lines.length - 1])
    } catch {
      return { page: null, message: 'The newest browser-activity entry is damaged, so nothing is reported.' }
    }
    const page: Record<string, unknown> = {
      url: typeof event.url === 'string' ? event.url : '',
      title: typeof event.title === 'string' ? event.title : '',
      captured_at: typeof event.captured_at === 'string' ? event.captured_at : '',
      capture_status: typeof event.capture_status === 'string' ? event.capture_status : 'unknown',
      source: newest,
    }
    if (typeof event.visited_at === 'string' && event.visited_at) page.visited_at = event.visited_at
    if (typeof event.source_id === 'string' && event.source_id) {
      const document = store.read(event.source_id)
      const textMarker = '\n## Content\n'
      const treeMarker = '\n## Accessibility tree\n'
      const treeAt = document.indexOf(treeMarker)
      const marker = treeAt !== -1 ? treeMarker : textMarker
      const at = treeAt !== -1 ? treeAt : document.indexOf(textMarker)
      if (at !== -1) {
        let raw = document.slice(at + marker.length).trim()
        // A tree rides inside a fenced block; the fence is presentation, not data.
        if (marker === treeMarker && raw.startsWith('```')) {
          raw = raw.replace(/^```\n/, '').replace(/\n```$/, '')
        }
        const capped = raw.slice(0, 12_000)
        page.content = capped
        if (marker === treeMarker) page.format = 'a11y-tree'
        if (capped.length < raw.length) page.content_truncated = true
      }
    }
    if (page.capture_status === 'visit-only') {
      page.note = 'A visit was recorded; the page content was never captured, so nothing about reading it is claimed.'
    }
    return { page }
  }

  /**
   * Link check (adapted from the research repos' wikilink linters): every
   * [[link]] in every markdown note, resolved the way the rulebook demands —
   * by exact vault-relative path. A link to nothing is reported dead; a bare
   * name that matches several files is reported ambiguous instead of guessed.
   * Counted, never fixed silently.
   */
  function links(): {
    files: number
    checked: number
    dead: Array<{ from: string; target: string }>
    ambiguous: Array<{ from: string; target: string; matches: string[] }>
    /** Resolved links, as the graph draws them: one target, no guessing. */
    edges: Array<{ from: string; to: string }>
  } {
    const store = vault()
    const notes: Array<{ relative: string; body: string }> = []
    const walk = (directory: string, prefix: string): void => {
      let entries
      try {
        entries = readdirSync(join(directory, prefix), { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const child = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isDirectory()) walk(directory, child)
        else if (entry.name.endsWith('.md')) {
          // Templates hold placeholder links ([[source-id]]) by design: they
          // are not claims about the vault, so they are not scanned. The notes
          // created FROM them are.
          if (child === '00 System/Templates' || child.startsWith('00 System/Templates/')) continue
          const body = store.read(child)
          if (body) notes.push({ relative: child, body })
        }
      }
    }
    walk(store.root, '')
    const basenames = new Map<string, string[]>()
    for (const note of notes) {
      const base = note.relative.split('/').slice(-1)[0].replace(/\.md$/, '')
      basenames.set(base, [...(basenames.get(base) ?? []), note.relative])
    }
    const resolveOne = (target: string): string[] => {
      const clean = target.trim().replace(/^\.\//, '')
      if (!clean) return []
      const asPath = clean.endsWith('.md') ? clean : `${clean}.md`
      const direct = notes.find(note => note.relative === asPath)
      if (direct) return [direct.relative]
      const hits = basenames.get(clean) ?? []
      return hits
    }
    const dead: Array<{ from: string; target: string }> = []
    const ambiguous: Array<{ from: string; target: string; matches: string[] }> = []
    const edges: Array<{ from: string; to: string }> = []
    let checked = 0
    const pattern = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g
    for (const note of notes) {
      for (const match of note.body.matchAll(pattern)) {
        checked += 1
        const target = match[1].trim()
        const hits = resolveOne(target)
        if (hits.length === 0) dead.push({ from: note.relative, target })
        else if (hits.length > 1) ambiguous.push({ from: note.relative, target, matches: hits })
        else edges.push({ from: note.relative, to: hits[0] })
      }
    }
    return { files: notes.length, checked, dead, ambiguous, edges }
  }


  return {
    root,
    available,
    /** The message a caller shows when there is no vault to work with. */
    missingMessage: () => noVaultMessage(root),
    status,
    today,
    monthlyAudit,
    blacklist,
    updateBlacklist,
    capture,
    conversationSync(data: Payload) {
      if (!data || typeof data.url !== 'string') throw new InputError('Conversation URL is required.')
      if (excluded(data.url, blacklist())) return { ok: false, skipped: true, reason: 'blacklist' }
      return syncConversation(vault(), data, clock().toISOString())
    },
    links,
    onui,
    listEntries,
    capsules,
    context,
    exportZip,
    /** Ranked search over notes and captured conversations. */
    search: (request: SearchRequest) => searcher().search(request),
    /**
     * The store itself, for the map of sources: it walks and reads heads, and it
     * must do both through the same path rules as everything else in this app. A
     * function rather than the store, because a vault that is not there yet must
     * be reported by the caller rather than thrown at import.
     */
    files: vault,
  }
}

