/**
 * Auto memory: what matters survives the session, as real markdown in HIS
 * vault — and every line is his to see and delete. The design is his word
 * for word: auto-keep but show everything; memories live in the vault
 * (06 Review/Memory); the ENGINE may write, through its own normal tools —
 * which means every memory write rides this app's permission cards, a
 * visible diff before it lands. The app adds the folder, the order, and the
 * pane that shows what exists; the engine does the remembering.
 */

export const MEMORY_DIR = '06 Review/Memory'
export const MEMORY_FILE = 'engine-notes.md'

/** The memory path inside the vault, folder and file. */
export function memoryVaultPath(): string {
  return `${MEMORY_DIR}/${MEMORY_FILE}`
}

/** Local calendar day for owner-visible journal headings (never UTC rollover). */
export function localJournalDay(now = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** The work order for a memory pass. The engine writes through its own tools. */
export function buildMemoryOrder(folder = '', now = new Date()): string {
  const today = localJournalDay(now)
  return [
    `Memory pass. Look back over this conversation and note what matters for future sessions: decisions made, preferences shown, facts learned, work left open.`,
    `Write them as short dated lines into your memory file at ${folder ? JSON.stringify(folder.replace(/\\/g, '/') + '/' + MEMORY_FILE) : memoryVaultPath() + ' inside the current workspace'} (create the folder and file if they do not exist). Append under '## ${today}' for today in this device's local calendar; never delete or rewrite lines that are already there.`,
    `One line per item, plain words. Nothing sensitive beyond what this conversation already holds. If there is truly nothing worth keeping, say so and write nothing.`,
  ].join(' ')
}

/** What the pane shows for one memory file. */
export type MemoryFile = {
  name: string
  path: string
  updated: string
  /** The whole file, bounded: memory lines are short; the cap is honest. */
  content: string
  /** True when the content was cut at the cap — the pane says so. */
  clipped: boolean
}

export const MEMORY_READ_CAP = 20_000

/** The vault-relative path is validated against tricks before any read. */
export function safeMemoryRelative(name: string): { ok: true; rel: string } | { ok: false; answer: string } {
  const clean = name.replace(/\\/g, '/').trim()
  if (!clean.startsWith(`${MEMORY_DIR}/`)) return { ok: false, answer: 'Only files inside 06 Review/Memory are memory.' }
  const rest = clean.slice(MEMORY_DIR.length + 1)
  if (!rest || rest.includes('..') || rest.startsWith('/') || rest.split('/').some(part => part.startsWith('.'))) {
    return { ok: false, answer: 'That path is not a memory file.' }
  }
  if (!rest.endsWith('.md')) return { ok: false, answer: 'Memory is markdown only.' }
  return { ok: true, rel: clean }
}
