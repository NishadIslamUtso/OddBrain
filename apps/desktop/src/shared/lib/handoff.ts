import type { EngineUsage } from './engine'

/**
 * The handoff document (Track D).
 *
 * Prior art studied before building (2026-10-16 sweep): claude-handoff
 * (briansmith80 — /handoff → git-syncable HANDOFF.md, /catchup resumes),
 * claude-handoff (Vasilispapg, MIT — clean handoff.md with instructions to
 * the receiving assistant, not a raw transcript dump), claude-handoff-skill
 * (barley-dev — a completion gate: evidence, not declarations). What this app
 * has that they all lack: the turn itself is already in memory, so nothing is
 * parsed post-hoc and nothing is invented — only real records go in.
 *
 * The shape, adapted from all three:
 *   - opens with instructions to the RECEIVING assistant (paste-ready)
 *   - the task, what was done, what the engine said (the evidence)
 *   - what was touched: files and commands, from the real tool calls
 *   - how to continue: engine, brain, workspace, and the resumable session id
 */

export type HandoffSource = {
  prompt: string
  items: Array<{ kind: 'status' | 'text' | 'thinking' | 'tool' | 'error'; text?: string; name?: string; summary?: string }>
  state: 'running' | 'done' | 'error'
  sessionId: string | null
  usage: EngineUsage | null
  engine: string
  model: string
  workspace: string
  date: string
}

const clip = (text: string, limit: number): string =>
  text.length > limit ? `${text.slice(0, limit)}\n… (${text.length - limit} more characters)` : text

export function buildHandoff(source: HandoffSource): string {
  const tools = source.items.filter(item => item.kind === 'tool' && item.name)
  const words = source.items.filter(item => item.kind === 'text' && item.text?.trim())
  const problems = source.items.filter(item => item.kind === 'error' && item.text?.trim())
  const lastWords = words.at(-1)?.text ?? ''
  const done = source.state !== 'running'

  const lines: string[] = [
    '# Handoff',
    '',
    `*Written ${source.date} by OddBrain. This document is for the assistant that continues this work, human or engine. Everything below is the record of one real task; nothing is guessed.*`,
    '',
    '## The task',
    '',
    clip(source.prompt, 2000),
    '',
    '## How to continue',
    '',
    `- Engine: \`${source.engine}\`, brain: \`${source.model}\``,
    `- Works in: ${source.workspace || 'the vault (default)'}`,
    source.sessionId
      ? `- This conversation has an id: \`${source.sessionId}\`. Claude Code resumes it with \`claude --resume ${source.sessionId}\` in the workspace above; the app also continues it by itself.`
      : '- No session id was recorded, start fresh; the notes below carry the context.',
    done
      ? `- The turn had ${source.state === 'error' ? 'ended with an error' : 'finished'} when this was written.`
      : '- The turn was still running when this was written; check the real state of the files before trusting anything.',
    '',
    '## What was done',
    '',
  ]

  if (tools.length) {
    lines.push(...tools.map(tool => `- ${tool.name}: ${tool.summary ?? ''}`.trimEnd()))
  } else {
    lines.push('_No tool calls were recorded, the engine answered in words only._')
  }

  if (lastWords) {
    lines.push('', '## Where it landed', '', clip(lastWords, 4000))
  }
  if (problems.length) {
    lines.push('', '## What went wrong', '', ...problems.slice(-3).map(item => `- ${clip(item.text ?? '', 300)}`))
  }
  if (source.usage) {
    const bits = [
      `${source.usage.inTokens} tokens in`,
      `${source.usage.outTokens} out`,
      source.usage.durationMs !== null ? `${(source.usage.durationMs / 1000).toFixed(1)}s` : '',
      source.usage.costUsd !== null ? `$${source.usage.costUsd.toFixed(4)}` : '',
    ].filter(Boolean)
    lines.push('', `*Cost, as the engine itself reported: ${bits.join(', ')}.*`)
  }
  return `${lines.join('\n')}\n`
}

/** A vault-safe file name: handoffs/2026-10-16-<task>.md */
export function handoffFileName(date: string, prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const day = date.slice(0, 10)
  return `handoffs/${day}${slug ? `-${slug}` : ''}.md`
}
