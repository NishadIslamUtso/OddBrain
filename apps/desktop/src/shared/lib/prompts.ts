/**
 * prompts.js — the slash menu.
 *
 * The idea is open-design's prompt-templates directory: a library of named
 * prompts kept as data, so adding one is not a code change. Here they are
 * reachable by typing "/" in the composer, which is the behaviour in
 * docs/claude-exact-pixel-clone-APP-DESIGN.md.
 *
 * The built-ins are chosen for a small local model. A 3B model does well when
 * you name the shape of the answer you want, and badly when you leave it to
 * guess — so most of these are instructions about *form*, which is exactly
 * what a small model cannot infer on its own.
 *
 * User prompts are stored locally alongside the built-ins and can be edited or
 * deleted, the same way skills work.
 */
import type { PromptTemplate } from '../types'
import { readStored, writeStored } from './storage'

const KEY = 'ai_assistant_prompts'
const MAX_NAME = 40
const MAX_BODY = 4000

/** A user prompt as stored; built-ins carry no extra fields. */
export type StoredPrompt = PromptTemplate
/** A prompt ready for the menu, with its origin resolved. */
export type MenuPrompt = PromptTemplate & { builtin: boolean }

export const BUILT_IN_PROMPTS = Object.freeze([
  {
    id: 'builtin-explain',
    name: 'explain',
    hint: 'Plain language, no jargon',
    body: 'Explain {{topic}} in simple, plain language. Avoid jargon. If you must use a technical term, define it in the same sentence. Use one short example.',
  },
  {
    id: 'builtin-summarise',
    name: 'summarise',
    hint: 'Short summary with the key points',
    body: 'Summarise the following in a few sentences, then list the key points as short bullets. Keep it under 150 words.\n\n{{text}}',
  },
  {
    id: 'builtin-code',
    name: 'code',
    hint: 'Write code with a brief explanation',
    body: 'Write code for: {{task}}\n\nGive the code first in a single fenced block, then explain the important parts in a few short bullets. Prefer standard libraries.',
  },
  {
    id: 'builtin-fix',
    name: 'fix',
    hint: 'Find the bug and explain it',
    body: 'Here is code that is not working:\n\n```\n{{code}}\n```\n\nWhat it should do: {{expected}}\n\nFind the bug, explain why it happens, and give the corrected code.',
  },
  {
    id: 'builtin-email',
    name: 'email',
    hint: 'Draft a short, clear email',
    body: 'Draft a short email. Tone: {{tone, e.g. friendly / formal / apologetic}}.\n\nTo: {{recipient}}\nAbout: {{subject}}\n\nKeep it under 120 words. No filler openings.',
  },
  {
    id: 'builtin-shorten',
    name: 'shorten',
    hint: 'Same meaning, fewer words',
    body: 'Rewrite the following so it says the same thing in roughly half the words. Keep the tone. Do not add new information.\n\n{{text}}',
  },
  {
    id: 'builtin-proscons',
    name: 'proscons',
    hint: 'Balanced pros and cons, then a recommendation',
    body: 'Give a balanced list of pros and cons for: {{decision}}\n\nThen give one short recommendation and say what would change your mind.',
  },
  {
    id: 'builtin-stepbystep',
    name: 'steps',
    hint: 'Numbered steps, in order',
    body: 'Give numbered steps to: {{goal}}\n\nStart from a clean slate. One action per step. Flag any step that cannot be undone.',
  },
])

const clean = (value: unknown, max: number): string => String(value ?? '').trim().slice(0, max)

const normalize = (value: unknown): StoredPrompt[] => Array.isArray(value)
  ? value
      .filter(prompt => prompt && typeof prompt.id === 'string' && typeof prompt.body === 'string')
      .slice(0, 60)
      .map(prompt => ({
        id: String(prompt.id),
        name: clean(prompt.name, MAX_NAME) || 'untitled',
        hint: clean(prompt.hint, 140),
        body: clean(prompt.body, MAX_BODY),
      }))
      .filter(prompt => prompt.name && prompt.body)
  : []

export function loadPrompts(): StoredPrompt[] {
  return readStored<StoredPrompt[]>(KEY, [], normalize).value
}

function persist(prompts: StoredPrompt[]): StoredPrompt[] {
  try { writeStored(KEY, normalize(prompts)) } catch { /* a full disk must not lose the draft */ }
  return normalize(prompts)
}

export function savePrompt({
  name,
  hint = '',
  body,
  id,
}: {
  name: string
  hint?: string
  body: string
  id?: string
}): { prompts: StoredPrompt[]; prompt: StoredPrompt } {
  const prompts = loadPrompts()
  const entry: StoredPrompt = {
    id: id || `prompt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: clean(name, MAX_NAME) || 'untitled',
    hint: clean(hint, 140),
    body: clean(body, MAX_BODY),
  }
  if (!entry.body) throw new Error('A prompt needs some text.')
  const next = prompts.some(prompt => prompt.id === entry.id)
    ? prompts.map(prompt => (prompt.id === entry.id ? entry : prompt))
    : [entry, ...prompts]
  return { prompts: persist(next), prompt: entry }
}

export function deletePrompt(id: string): StoredPrompt[] {
  return persist(loadPrompts().filter(prompt => prompt.id !== id))
}

/** Built-ins first, then the user's own, in the order they were saved. */
export function allPrompts(userPrompts: StoredPrompt[] = []): MenuPrompt[] {
  return [...BUILT_IN_PROMPTS.map(prompt => ({ ...prompt, builtin: true })), ...userPrompts.map(prompt => ({ ...prompt, builtin: false }))]
}

/**
 * Filter by what has been typed after the "/". Matches the name first and the
 * hint second, so `/sum` finds "summarise" without also dragging in everything
 * whose description happens to contain "sum".
 */
export function filterPrompts(prompts: StoredPrompt[], query: string): MenuPrompt[] {
  const needle = String(query || '').toLowerCase().trim()
  const list = allPrompts(prompts)
  if (!needle) return list
  const byName = list.filter(prompt => prompt.name.toLowerCase().startsWith(needle))
  const byOther = list.filter(prompt => !byName.includes(prompt)
    && (prompt.name.toLowerCase().includes(needle) || prompt.hint.toLowerCase().includes(needle)))
  return [...byName, ...byOther]
}

/**
 * Placeholders look like {{topic}}. They are left in the text on purpose —
 * the person fills them in, because a 3B model asked to guess the topic will
 * invent one.
 */
export function placeholdersIn(body: string): string[] {
  return [...String(body || '').matchAll(/\{\{([^}]+)\}\}/g)].map(match => match[1].trim())
}
