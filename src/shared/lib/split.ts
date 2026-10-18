/**
 * Split: one big work order becomes numbered steps, run one by one.
 *
 * Aider's architect/editor and Goose's lead/worker split a task between two
 * models; Claude Code spawns subagents inside its own CLI (and when it does,
 * they already show in this app's story as tool lines — the engine's own
 * workers were always visible here). This app's version is the harness move
 * that works on EVERY engine: the engine's own brain breaks the work into a
 * short list of steps (its words, shown in full before anything runs), then
 * the app runs them IN ORDER as normal work orders in the same session —
 * each one gated by the same permission cards, each one visible, each one
 * stoppable. A step that fails halts the run and says so; the rest wait for
 * the owner. The app adds the sequencing; the engine keeps the thinking.
 */

/** The work order that asks for the steps. Shown before it sends. */
export const SPLIT_ORDER =
  'Break this work order into the shortest honest list of steps that can each be checked off: between 2 and 6 steps, no preamble. ' +
  'Write each step on its own line starting with STEP, like "STEP 1: ...". Each step must be a task THIS session can actually do in one turn; ' +
  'if the work order is too small to need steps, say SOLE instead. The work order follows on the next line.\nWORK ORDER: '

/** SOLE is the engine's honest "this needs no steps" — kept as a verdict, not an error. */
export const SOLE_VERDICT = 'SOLE'

export type ParsedSteps = { ok: true; steps: string[] } | { ok: false; answer: string }

const STEP_LINE = /^\s*STEP\s*\d*\s*[:.)-]?\s*(.+)$/i
const NUMBERED_LINE = /^\s*\d+\s*[.)]\s*(.+)$/

/** Read the steps out of the engine's finished turn. Strict on purpose. */
export function parseSteps(text: string): ParsedSteps {
  const trimmed = text.trim()
  if (!trimmed) return { ok: false, answer: 'The engine said nothing, so there are no steps to read.' }
  const sole = new RegExp(`^\\s*${SOLE_VERDICT}\\b`, 'i')
  if (sole.test(trimmed)) return { ok: false, answer: 'SOLE' }
  const steps: string[] = []
  for (const line of trimmed.split('\n')) {
    if (/^\s*$/.test(line)) continue
    const step = line.match(STEP_LINE) ?? line.match(NUMBERED_LINE)
    const content = step?.[1]?.trim()
    if (!content) continue
    if (content.length > 400) continue
    steps.push(content)
  }
  if (steps.length === 1) return { ok: false, answer: 'The engine wrote one step, which is no split at all. Run the work order as it stands.' }
  if (steps.length === 0) {
    return { ok: false, answer: 'The engine\u2019s answer is not a step list, so nothing was split. Nothing was changed; try again or run the order whole.' }
  }
  return { ok: true, steps: steps.slice(0, 6) }
}

/** A step's line on the checklist: kept short, never cut mid-word silently. */
export function stepLabel(step: string, index: number): string {
  const clean = step.replace(/\s+/g, ' ').trim()
  return `${index + 1}. ${clean}`
}

/** How the finished run announces itself. */
export function splitSummary(total: number, done: number, failed: number): string {
  if (failed === 0 && done === total) return `All ${total} steps ran.`
  if (failed === 0) return `${done} of ${total} steps ran.`
  return `${done} of ${total} steps ran; ${failed} ${failed === 1 ? 'step failed' : 'steps failed'} and the rest did not run.`
}
