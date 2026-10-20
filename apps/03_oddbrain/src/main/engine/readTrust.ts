import { createHash, randomUUID } from 'node:crypto'
import { closeSync, constants, existsSync, fstatSync, fsyncSync, mkdirSync, openSync, readSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import type { EngineId } from '../../shared/lib/engine'
import { READ_TRUST_MODES, type ReadTrustMode, type ReadTrustRule, type ReadTrustView } from '../../shared/lib/readTrust'

const VERSION = 1
const MAX_RULES = 1_000
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_LEGACY_BYTES = 1024 * 1024
const ENGINE_IDS: EngineId[] = ['claude-code', 'agy']
type Stored = { version: 1; rules: ReadTrustRule[] }

export type ReadTrustCandidate = {
  engine: EngineId
  workspace: string
  tool: string
  file?: string
  risk?: string
  projectId?: string
  turnId: string
}

type Eligible = ReadTrustCandidate & { engine: EngineId; workspace: string; file: string; folder: string }

function safeText(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= limit && !/[\0\r\n]/.test(value)
}

function canonicalExisting(path: string, kind: 'file' | 'folder'): string {
  if (!safeText(path, 32_000)) throw Error(`The read ${kind} path is invalid.`)
  const absolute = realpathSync(resolve(path))
  const stats = statSync(absolute)
  if (kind === 'file' ? !stats.isFile() : !stats.isDirectory()) throw Error(`The read ${kind} is not an ordinary ${kind}.`)
  return absolute
}

function within(folder: string, file: string): boolean {
  const child = relative(folder, file)
  return child === '' || (!child.startsWith('..') && !isAbsolute(child))
}

function idOf(rule: Omit<ReadTrustRule, 'id' | 'createdAt'>): string {
  return createHash('sha256').update(JSON.stringify([rule.mode, rule.engine, rule.workspace, rule.scope, rule.projectId || '', rule.turnId || ''])).digest('hex')
}

function validateRule(value: unknown, ephemeral = false): ReadTrustRule {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('A saved read approval is invalid.')
  const row = value as Record<string, unknown>
  if (!(READ_TRUST_MODES as readonly unknown[]).includes(row.mode) || (row.mode === 'turn') !== ephemeral) throw Error('A saved read approval has an invalid lifetime.')
  if (!ENGINE_IDS.includes(row.engine as EngineId) || !safeText(row.workspace, 32_000) || !safeText(row.scope, 32_000) || !safeText(row.id, 128) || !safeText(row.createdAt, 100)) throw Error('A saved read approval is invalid.')
  if (row.mode === 'project' && !safeText(row.projectId, 200)) throw Error('A project read approval has no project.')
  if (row.mode !== 'project' && row.projectId !== undefined) throw Error('A saved read approval has an unexpected project.')
  if (row.mode === 'turn' && !safeText(row.turnId, 200)) throw Error('A turn read approval has no turn.')
  if (row.mode !== 'turn' && row.turnId !== undefined) throw Error('A saved read approval has an unexpected turn.')
  if (row.active !== undefined) throw Error('A saved read approval has an invalid active marker.')
  const base: Omit<ReadTrustRule, 'id' | 'createdAt'> = { mode: row.mode as ReadTrustMode, engine: row.engine as EngineId, workspace: row.workspace, scope: row.scope,
    ...(typeof row.projectId === 'string' ? { projectId: row.projectId } : {}), ...(typeof row.turnId === 'string' ? { turnId: row.turnId } : {}) }
  if (row.id !== idOf(base)) throw Error('A saved read approval identity is damaged.')
  return { id: row.id, ...base, createdAt: row.createdAt }
}

function readBounded(file: string): string {
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
  try {
    const stats = fstatSync(fd)
    if (!stats.isFile() || stats.size > MAX_FILE_BYTES) throw Error('The saved read-approval file is not a bounded ordinary file.')
    const body = Buffer.allocUnsafe(stats.size)
    let offset = 0
    while (offset < body.length) { const count = readSync(fd, body, offset, body.length - offset, null); if (count === 0) throw Error('The saved read-approval file changed while it was read.'); offset += count }
    if (readSync(fd, Buffer.allocUnsafe(1), 0, 1, null) !== 0) throw Error('The saved read-approval file changed while it was read.')
    return body.toString('utf8')
  } finally { closeSync(fd) }
}

function atomicWrite(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`
  let fd: number | undefined
  try {
    fd = openSync(temporary, 'wx', 0o600)
    writeFileSync(fd, text, 'utf8'); fsyncSync(fd); closeSync(fd); fd = undefined
    renameSync(temporary, file)
    try { const parent = openSync(dirname(file), 'r'); fsyncSync(parent); closeSync(parent) } catch { /* Windows cannot always fsync a directory. */ }
  } catch (error) {
    if (fd !== undefined) try { closeSync(fd) } catch {}
    try { if (existsSync(temporary)) unlinkSync(temporary) } catch {}
    throw error
  }
}

export function createReadTrustStore(root: string, options: { maxRules?: number } = {}) {
  const maxRules = options.maxRules ?? MAX_RULES
  if (!Number.isSafeInteger(maxRules) || maxRules < 1 || maxRules > MAX_RULES) throw Error('Invalid read-approval limit.')
  const file = resolve(root, 'rules.json'), previous = resolve(root, 'rules.previous.json')
  const migration = resolve(root, 'migration', 'renderer-v1.json')
  const turns = new Map<string, ReadTrustRule>()

  const readFile = (target: string): ReadTrustRule[] => {
    const parsed = JSON.parse(readBounded(target)) as Stored
    if (!parsed || parsed.version !== VERSION || !Array.isArray(parsed.rules) || parsed.rules.length > maxRules) throw Error('The saved read approvals are damaged or exceed their limit. Originals were kept.')
    const rules = parsed.rules.map(rule => validateRule(rule))
    if (new Set(rules.map(rule => rule.id)).size !== rules.length) throw Error('The saved read approvals contain duplicate identities. Originals were kept.')
    return rules
  }
  const persistent = (): { rules: ReadTrustRule[]; recoveredRules?: ReadTrustRule[]; notice?: string; recovered?: boolean } => {
    if (!existsSync(file)) return { rules: [] }
    try { return { rules: readFile(file) } }
    catch (currentError) {
      if (!existsSync(previous)) throw currentError
      try { return { rules: [], recoveredRules: readFile(previous), recovered: true, notice: 'The newest read-approval index is damaged. Previous rules are shown as inactive recovery evidence; none are auto-applied.' } }
      catch { throw currentError }
    }
  }
  const view = (): ReadTrustView => {
    const saved = persistent()
    return { rules: [...saved.rules, ...(saved.recoveredRules || []).map(rule => ({ ...rule, active: false as const })), ...turns.values()], ...(saved.notice ? { notice: saved.notice } : {}) }
  }
  const write = (rules: ReadTrustRule[]): void => {
    if (rules.length > maxRules) throw Error(`The ${maxRules.toLocaleString()} saved read-approval limit is full. Revoke an old rule explicitly; none were silently removed.`)
    const text = JSON.stringify({ version: VERSION, rules } satisfies Stored, null, 2)
    if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw Error('Saved read approvals exceed their storage bound. Revoke rules explicitly; none were silently removed.')
    const before = persistent()
    if (before.recovered && existsSync(file)) {
      const damaged = readBounded(file), recovery = resolve(root, 'recovery', `rules-${createHash('sha256').update(damaged).digest('hex').slice(0, 16)}.json`)
      if (!existsSync(recovery)) atomicWrite(recovery, damaged)
    } else if (existsSync(file)) atomicWrite(previous, readBounded(file))
    else atomicWrite(previous, text)
    atomicWrite(file, text)
  }
  const eligible = (candidate: ReadTrustCandidate): Eligible | null => {
    if (candidate.tool !== 'Read' || candidate.risk || !safeText(candidate.turnId, 200) || !ENGINE_IDS.includes(candidate.engine)) return null
    try {
      const workspace = canonicalExisting(candidate.workspace, 'folder')
      if (!candidate.file) return null
      const unresolved = resolve(workspace, candidate.file)
      const file = canonicalExisting(unresolved, 'file')
      // A linked path that resolves outside the active workspace is not eligible
      // for remembered approval, even if the engine can ask to read it once.
      if (!within(workspace, file)) return null
      return { ...candidate, workspace, file, folder: dirname(file) }
    } catch { return null }
  }
  const match = (candidate: ReadTrustCandidate): ReadTrustRule | undefined => {
    const checked = eligible(candidate)
    if (!checked) return undefined
    return view().rules.find(rule => rule.active !== false && rule.engine === checked.engine && rule.workspace === checked.workspace &&
      (rule.mode === 'file' ? rule.scope === checked.file : within(rule.scope, checked.file)) &&
      (rule.mode !== 'project' || (!!checked.projectId && rule.projectId === checked.projectId)) &&
      (rule.mode !== 'turn' || rule.turnId === checked.turnId))
  }
  const add = (candidate: ReadTrustCandidate, mode: ReadTrustMode): { rule: ReadTrustRule; created: boolean } => {
    if (!(READ_TRUST_MODES as readonly string[]).includes(mode)) throw Error('Unknown read-approval scope. Nothing was approved.')
    const checked = eligible(candidate)
    if (!checked) throw Error('Only an ordinary Read file inside the active working folder, with no executable-configuration warning, can receive a saved read approval.')
    if (mode === 'project' && !safeText(candidate.projectId, 200)) throw Error('This turn has no project identity. Choose turn, file, or folder scope instead.')
    const base: Omit<ReadTrustRule, 'id' | 'createdAt'> = { mode, engine: checked.engine, workspace: checked.workspace,
      scope: mode === 'file' ? checked.file : checked.folder,
      ...(mode === 'project' ? { projectId: candidate.projectId! } : {}), ...(mode === 'turn' ? { turnId: checked.turnId } : {}) }
    const rule: ReadTrustRule = { id: idOf(base), ...base, createdAt: new Date().toISOString() }
    if (mode === 'turn') {
      const existing = turns.get(rule.id)
      if (existing) return { rule: existing, created: false }
      turns.set(rule.id, rule); return { rule, created: true }
    }
    const current = persistent().rules
    const existing = current.find(item => item.id === rule.id)
    if (existing) return { rule: existing, created: false }
    write([...current, rule])
    return { rule, created: true }
  }
  const revoke = (id: string): ReadTrustView => {
    if (!safeText(id, 128)) throw Error('Invalid read-approval identity.')
    if (turns.delete(id)) return view()
    const current = persistent().rules, next = current.filter(rule => rule.id !== id)
    if (next.length === current.length) throw Error('That read approval no longer exists. Nothing was changed.')
    write(next)
    return view()
  }
  const clearTurn = (turnId: string): boolean => {
    let changed = false
    for (const [id, rule] of turns) if (rule.turnId === turnId) { turns.delete(id); changed = true }
    return changed
  }
  const clearTurns = (): boolean => { const changed = turns.size > 0; turns.clear(); return changed }
  const migrateLegacy = (raw: string | null, defaultWorkspace = ''): { view: ReadTrustView; migrated: number; skipped: number } => {
    if (raw === null) return { view: view(), migrated: 0, skipped: 0 }
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_LEGACY_BYTES) throw Error('Legacy read approvals exceed the migration bound. Their renderer copy was left untouched.')
    mkdirSync(dirname(migration), { recursive: true })
    if (!existsSync(migration)) atomicWrite(migration, raw)
    else if (readBounded(migration) !== raw) {
      const beside = resolve(dirname(migration), `renderer-v1-${createHash('sha256').update(raw).digest('hex').slice(0, 16)}.json`)
      if (!existsSync(beside)) atomicWrite(beside, raw)
    }
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { throw Error('Legacy read approvals are malformed. Exact recovery data and the renderer copy were kept.') }
    if (!Array.isArray(parsed) || parsed.length > 100) throw Error('Legacy read approvals have an invalid shape. Exact recovery data and the renderer copy were kept.')
    const current = persistent().rules, additions: ReadTrustRule[] = []; let skipped = 0
    for (const value of parsed) {
      try {
        if (!value || typeof value !== 'object') throw Error()
        const row = value as Record<string, unknown>
        if (row.tool !== 'Read' || !ENGINE_IDS.includes(row.engine as EngineId) || typeof row.workspace !== 'string' || (row.workspace !== '' && !safeText(row.workspace, 32_000)) || !safeText(row.scope, 32_000)) throw Error()
        const workspace = canonicalExisting(row.workspace || defaultWorkspace, 'folder'), target = canonicalExisting(resolve(workspace, row.scope), 'file')
        if (!within(workspace, target)) throw Error()
        const base: Omit<ReadTrustRule, 'id' | 'createdAt'> = { mode: 'file', engine: row.engine as EngineId, workspace, scope: target }
        const rule: ReadTrustRule = { id: idOf(base), ...base, createdAt: safeText(row.createdAt, 100) ? row.createdAt : new Date().toISOString() }
        if (![...current, ...additions].some(item => item.id === rule.id)) additions.push(rule)
      } catch { skipped++ }
    }
    if (current.length + additions.length > maxRules) throw Error(`Legacy migration would exceed the ${maxRules.toLocaleString()} read-approval limit. No rule was evicted or imported; the renderer copy remains.`)
    if (additions.length) write([...current, ...additions])
    return { view: view(), migrated: additions.length, skipped }
  }

  return { view, eligible, match, add, revoke, clearTurn, clearTurns, migrateLegacy }
}
