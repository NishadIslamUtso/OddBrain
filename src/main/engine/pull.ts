/**
 * pull.ts — bringing a brain home, with the progress shown.
 *
 * Ollama answers a pull request with one JSON sentence per progress tick:
 * manifest, then download chunks carrying `total` and `completed` bytes, then
 * success. These helpers keep that parsing pure and testable; the door in
 * main/index.ts feeds it the stream and forwards the ticks to the window.
 *
 * The name is validated before anything leaves the app: a model name is
 * letters, digits, dots, colons, slashes, dashes and spaces — nothing that
 * could be a second flag or a URL of its own.
 */

export type PullTick = {
  status: string
  /** Both present during a download: the progress bar's numerator and denominator. */
  total: number | null
  completed: number | null
  done: boolean
  error: string
}

export const EMPTY_TICK: PullTick = { status: '', total: null, completed: null, done: false, error: '' }

export function validateModelName(name: string): string {
  const clean = String(name || '').trim()
  // A brain's name is short and plain. A URL is not a name, and neither is
  // anything that could ride a shell or a second flag.
  if (clean.includes('://')) return ''
  return /^[A-Za-z0-9][A-Za-z0-9._:/\- ]{0,110}$/.test(clean) ? clean : ''
}

/** One pull-progress sentence → what the window should show. */
export function parsePullLine(line: string): PullTick {
  const text = line.trim()
  if (!text) return { ...EMPTY_TICK }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ...EMPTY_TICK }
  }
  const record = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>
  if (typeof record.error === 'string') return { ...EMPTY_TICK, error: record.error.slice(0, 300) }
  const status = typeof record.status === 'string' ? record.status : ''
  const total = typeof record.total === 'number' ? record.total : null
  const completed = typeof record.completed === 'number' ? record.completed : null
  const done = status === 'success'
  return { status, total, completed, done, error: '' }
}

/** What fraction of the download has landed, 0..1, for the bar. */
export function pullFraction(tick: PullTick): number | null {
  if (tick.done) return 1
  if (tick.total === null || tick.completed === null || tick.total <= 0) return null
  return Math.max(0, Math.min(1, tick.completed / tick.total))
}
