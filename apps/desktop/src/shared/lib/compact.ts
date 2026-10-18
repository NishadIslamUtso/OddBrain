/**
 * Compaction: a long conversation becomes a brief, and the engine starts
 * fresh with the brief riding along.
 *
 * OpenCode's compaction and Claude Code's /compact both answer the same
 * problem — a context window that fills up until the engine degrades — but
 * both live inside one CLI. This app sits ABOVE the engine, so it does what
 * only a harness can, on ANY engine: ask the engine's own brain to pour what
 * matters into a brief, then end the session, forget the resume id, and hand
 * the brief to the next session like a note passed between workers. Hybrid
 * by design: the brief is the engine's own words; the fresh start is the
 * app's. Nothing is summarized behind the owner's back — the brief is shown
 * in full before the session ends, and it is saved as a plain file.
 */

/** The steps a compaction walks through, each one visible to the owner. */
export type CompactPhase = 'idle' | 'briefing' | 'ready' | 'ending' | 'seeded'

/** The work order that asks the engine for the brief. Shown before it sends. */
export const BRIEF_ORDER =
  'Write the handoff brief of this conversation so far: what was asked, what was decided, what was done, what remains. ' +
  'Plain words, under 300 words, no preamble. Use the headings ASKED, DECIDED, DONE, NEXT, each with its lines underneath. ' +
  'This brief will carry the work into a fresh session, so it must stand alone: a reader who sees nothing else should know exactly where things are.'

/** The seeded prompt the next task rides inside. The brief is context, not the task. */
export function buildSeededPrompt(brief: string, task: string): string {
  return [
    '[Handoff brief from the previous conversation — context, not the task]',
    brief.trim(),
    '',
    '[The task]',
    task.trim(),
  ].join('\n')
}

/** An honest size for the status line: whitespace-split words, counted. */
export function countWords(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.length
}

/** The file name a saved brief carries: epoch, plain suffix. */
export function compactFileName(epochMs: number): string {
  return `${epochMs}-brief.md`
}

/** The saved file: the brief, when it was poured, where the work lived. */
export function briefFileContent(brief: string, workspace: string, at: string): string {
  return [
    '# Handoff brief',
    '',
    `*Poured ${at} by OddBrain's Compact, before the engine's session was ended. ${workspace ? `Workspace: ${workspace}.` : 'No workspace was set.'} This file is the record; the brief below rode into the next session.*`,
    '',
    brief.trim(),
    '',
  ].join('\n')
}

/** A brief that says nothing cannot carry anything: the honest minimum. */
export function briefWorthKeeping(brief: string): boolean {
  return brief.trim().length >= 40 && countWords(brief) >= 8
}
