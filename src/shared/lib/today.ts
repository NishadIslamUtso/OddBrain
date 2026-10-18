/**
 * today.ts — the landing screen's honest arithmetic.
 *
 * "Today" is the one screen that must never pretend: every number on it is
 * counted from real records (chats kept, artifacts in the library, sources
 * in the vault's maps), and every suggestion under "worth doing" comes from
 * one of those records — never an invented task. These helpers are pure so
 * the counting can be tested without a window, a vault or a clock beyond the
 * one handed in.
 */

export type TodayChat = { id: string; title: string; updatedAt?: string | number }
export type TodayArtifact = { id: string; title: string; type: string; createdAt: string }

/** Midnight of the day a timestamp belongs to. Non-dates collapse to zero. */
function startOfDay(value: string | number | undefined, now: Date): number | null {
  if (value === undefined) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  // A future timestamp is a lie from some record; it still counts as today.
  void now
  const day = new Date(date)
  day.setHours(0, 0, 0, 0)
  return day.getTime()
}

/** Whether a record's timestamp falls on the same day as `now`. */
export function isToday(value: string | number | undefined, now: Date = new Date()): boolean {
  const day = startOfDay(value, now)
  if (day === null) return false
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  return day === today.getTime()
}

/** The records from today, newest first. */
export function todaysChats<T extends TodayChat>(chats: T[], now: Date = new Date()): T[] {
  return chats
    .filter((chat) => isToday(chat.updatedAt ?? (chat as { createdAt?: string }).createdAt, now))
    .sort((first, second) => stamp(second.updatedAt) - stamp(first.updatedAt))
}

export function todaysArtifacts<T extends TodayArtifact>(artifacts: T[], now: Date = new Date()): T[] {
  return artifacts
    .filter((artifact) => isToday(artifact.createdAt, now))
    .sort((first, second) => stamp(second.createdAt) - stamp(first.createdAt))
}

function stamp(value: string | number | undefined): number {
  const date = new Date(value ?? 0)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

/** One suggestion: a sentence built from a real record, and where it leads. */
export type Suggestion = {
  label: string
  detail: string
  action: 'chat' | 'open-chat' | 'artifacts'
  /** The chat to open, when the suggestion leads to one. */
  chatId?: string
}

/**
 * "Worth doing next" — at most three, each from a real record, in priority
 * order: continue today's latest conversation, open today's newest artifact,
 * or (when the day has nothing yet) start something. Never a filler list.
 */
export function worthDoing(
  chats: TodayChat[],
  artifacts: TodayArtifact[],
  now: Date = new Date(),
): Suggestion[] {
  const out: Suggestion[] = []
  const chat = todaysChats(chats, now)[0]
  if (chat) {
    out.push({
      label: 'Continue the latest conversation',
      detail: chat.title || 'Untitled conversation',
      action: 'open-chat',
      chatId: chat.id,
    })
  }
  const artifact = todaysArtifacts(artifacts, now)[0]
  if (artifact) {
    out.push({
      label: 'Open what was made today',
      detail: artifact.title || 'Untitled artifact',
      action: 'artifacts',
    })
  }
  if (out.length === 0) {
    out.push({
      label: 'Start something',
      detail: 'Nothing has been made or asked today yet. One conversation changes that.',
      action: 'chat',
    })
  }
  return out.slice(0, 3)
}
