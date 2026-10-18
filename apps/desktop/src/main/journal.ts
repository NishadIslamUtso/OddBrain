/**
 * The turn journal: finished engine turns, kept as a small plain record so a
 * reopened window can show what happened here BEFORE this window opened —
 * beyond the last turn the live memory remembers. A RECORD, honestly
 * bounded, never a fake resumable transcript: the engine's own --resume
 * already restores the context server-side; this is the visible history.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type JournalEntry = {
  at: string
  prompt: string
  /** The engine's last words, clipped: a record line, not a transcript. */
  answer: string
  sessionId: string | null
  /** The engine's own usage line, preformatted. */
  usage: string
  workspace: string
}

export const JOURNAL_CAP = 60
export const MAX_PROMPT_CHARS = 400
export const MAX_ANSWER_CHARS = 400

export function clipForJournal(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

export function createJournalManager(file: string) {
  const read = async (): Promise<JournalEntry[]> => {
    try {
      const parsed = JSON.parse(await readFile(file, 'utf8')) as JournalEntry[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return {
    list: async (): Promise<{ ok: boolean; entries: JournalEntry[] }> => ({
      ok: true,
      entries: (await read()).slice(-JOURNAL_CAP).reverse(),
    }),
    append: async (entry: Partial<JournalEntry>): Promise<{ ok: boolean; answer: string }> => {
      const prompt = typeof entry?.prompt === 'string' ? clipForJournal(entry.prompt, MAX_PROMPT_CHARS) : ''
      if (!prompt) return { ok: false, answer: 'A journal line needs the work order; nothing was kept.' }
      const record: JournalEntry = {
        at: typeof entry.at === 'string' && entry.at ? entry.at : new Date().toISOString(),
        prompt,
        answer: clipForJournal(typeof entry.answer === 'string' ? entry.answer : '', MAX_ANSWER_CHARS),
        sessionId: typeof entry.sessionId === 'string' ? entry.sessionId : null,
        usage: clipForJournal(typeof entry.usage === 'string' ? entry.usage : '', 120),
        workspace: clipForJournal(typeof entry.workspace === 'string' ? entry.workspace : '', 300),
      }
      const entries = await read()
      entries.push(record)
      try {
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file, JSON.stringify(entries.slice(-JOURNAL_CAP), null, 2), 'utf8')
        return { ok: true, answer: 'Kept.' }
      } catch (failure) {
        return { ok: false, answer: `Could not keep the record: ${(failure as Error).message}` }
      }
    },
    clear: async (): Promise<{ ok: boolean; answer: string }> => {
      try {
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file, '[]', 'utf8')
        return { ok: true, answer: 'The record is cleared. The engine\u2019s own memory was never in this file.' }
      } catch (failure) {
        return { ok: false, answer: `Could not clear: ${(failure as Error).message}` }
      }
    },
  }
}

export type JournalManager = ReturnType<typeof createJournalManager>
