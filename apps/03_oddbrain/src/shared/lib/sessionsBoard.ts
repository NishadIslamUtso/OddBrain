/**
 * sessionsBoard.ts — the session board (A.5: session kanban + session↔file links).
 *
 * The engine already remembers, per workspace, the one thread a fresh launch
 * will resume (engine-sessions.json, `--resume`). What it does not know is
 * what the OWNER thinks: which threads are still live work, which are done,
 * and which files each thread touches. That is this board — the owner's
 * notes about real threads, stored in one small file, plain JSON, no
 * server. Two columns only: Continuing (the engine resumes these) and Done
 * (the id is forgotten — the engine starts clean there; the card stays as
 * history). Nothing on the board pretends to control the engine: moving a
 * card to Done really forgets the id, and a done card cannot come back —
 * the resume id no longer exists.
 */

export type BoardFiles = {
  /** The files this thread touches, as the owner linked them. */
  files: string[]
}

export type DoneCard = {
  workspace: string
  sessionId: string
  endedAt: string
}

export type SessionsBoard = {
  /** Per workspace (the engine's own cwd key): links + any owner note. */
  continuing: Record<string, BoardFiles>
  /** Finished threads. The engine will not resume these any more. */
  done: DoneCard[]
}

/**
 * Scope the board to one workspace — what a project's Code button asks for.
 * An empty folder means no scope: everything, exactly as before. The filter
 * is honest both ways: a scoped board says so, and nothing is hidden that a
 * "show all" press cannot bring back.
 */
export function scopeBoard<T extends { workspace: string }, TDone extends { workspace: string }>(
  sessions: T[],
  done: TDone[],
  focusFolder: string
): { sessions: T[]; done: TDone[]; scoped: boolean } {
  if (!focusFolder) return { sessions, done, scoped: false }
  return {
    sessions: sessions.filter(entry => entry.workspace === focusFolder),
    done: done.filter(entry => entry.workspace === focusFolder),
    scoped: true,
  }
}

export const MAX_LINKED_FILES = 24
export const MAX_DONE_CARDS = 4000

const cleanWorkspace = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 4096) return ''
  // A workspace is a folder path the engine already used; anything that is
  // not path-shaped (a URL, a newline smuggler) is not a workspace.
  if (/[\n\r]|\bhttps?:\/\//.test(trimmed)) return ''
  return trimmed
}

const cleanPath = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 4096) return ''
  if (/[\n\r]|\bhttps?:\/\//.test(trimmed)) return ''
  return trimmed
}

/** The board as stored, rebuilt strictly. Damaged entries are dropped. */
export function normalizeBoard(value: unknown): SessionsBoard {
  const out: SessionsBoard = { continuing: {}, done: [] }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  const record = value as Record<string, unknown>
  const rawContinuing = record['continuing']
  if (rawContinuing && typeof rawContinuing === 'object' && !Array.isArray(rawContinuing)) {
    for (const [workspace, entry] of Object.entries(rawContinuing as Record<string, unknown>)) {
      const key = cleanWorkspace(workspace)
      if (!key) continue
      const files = (entry as { files?: unknown })?.files
      if (!Array.isArray(files)) continue
      const clean: string[] = []
      for (const path of files) {
        const ok = cleanPath(path)
        if (ok && !clean.includes(ok)) clean.push(ok)
      }
      out.continuing[key] = { files: clean }
    }
  }
  if (Array.isArray(record['done'])) {
    for (const entry of record['done'] as unknown[]) {
      const card = (entry ?? {}) as Record<string, unknown>
      const workspace = cleanWorkspace(card['workspace'])
      const sessionId = typeof card['sessionId'] === 'string' ? card['sessionId'] : ''
      if (!workspace || !sessionId) continue
      out.done.push({ workspace, sessionId, endedAt: typeof card['endedAt'] === 'string' ? card['endedAt'].slice(0, 40) : '' })
    }
  }
  return out
}

/** Link files to a continuing thread. Known paths stay first; new ones join the end. */
export function linkFiles(
  board: SessionsBoard,
  workspace: string,
  paths: string[],
): { board: SessionsBoard; added: number } {
  const key = cleanWorkspace(workspace)
  if (!key || !paths.length) return { board, added: 0 }
  const current = board.continuing[key]?.files ?? []
  const next = [...current]
  let added = 0
  for (const path of paths) {
    const clean = cleanPath(path)
    if (!clean || next.includes(clean)) continue
    if (next.length >= MAX_LINKED_FILES) throw Error(`A thread supports ${MAX_LINKED_FILES} linked files. Nothing was added; choose fewer files.`)
    next.push(clean)
    added += 1
  }
  return { board: { ...board, continuing: { ...board.continuing, [key]: { files: next } } }, added }
}

export function unlinkFile(board: SessionsBoard, workspace: string, path: string): SessionsBoard {
  const key = cleanWorkspace(workspace)
  if (!key) return board
  const current = board.continuing[key]?.files ?? []
  return { ...board, continuing: { ...board.continuing, [key]: { files: current.filter(entry => entry !== path) } } }
}

/**
 * A thread is done: the engine must forget the resume id (the caller does
 * that through the engine door — this only moves the card), and the card
 * stays as history. Capacity refuses a new entry rather than evicting an old one.
 */
export function markDone(board: SessionsBoard, workspace: string, sessionId: string, endedAt: string): SessionsBoard {
  const key = cleanWorkspace(workspace)
  if (!key || !sessionId) return board
  const older = board.done.filter(card => card.workspace !== key || card.sessionId !== sessionId)
  if (older.length >= MAX_DONE_CARDS) throw Error('Session board capacity reached. No IDs were forgotten; export or explicitly remove older cards first.')
  const done = [{ workspace: key, sessionId, endedAt }, ...older]
  const continuing = { ...board.continuing }
  delete continuing[key]
  return { continuing, done }
}

export function dropDoneCard(board: SessionsBoard, workspace: string): SessionsBoard {
  return { ...board, done: board.done.filter(card => card.workspace !== workspace) }
}
