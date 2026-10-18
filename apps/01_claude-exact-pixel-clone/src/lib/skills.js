/**
 * skills.js — named, reusable instructions for sub-agents.
 *
 * The idea is taken from nexu-io/open-design (Apache-2.0), which keeps 163
 * skills as plain markdown files with a little frontmatter: a name, a
 * description, and the instruction itself. The point is that a capability is
 * data you can add, edit and delete, not code you have to ship.
 *
 * Here the six built-in roles stay in code because they are tuned for a 3B
 * model, but anything you write yourself is a skill: name it once, reuse it on
 * any sub-agent afterwards. Skills live in this browser's local storage, next
 * to everything else that never leaves the machine.
 */
import { readStored, writeStored } from './storage.js'

const KEY = 'claude_exact_skills'
const MAX_SKILLS = 40
const MAX_INSTRUCTION = 4000

const clean = text => String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_INSTRUCTION)

const normalize = value => Array.isArray(value)
  ? value
      .filter(skill => skill && typeof skill.id === 'string' && typeof skill.system === 'string')
      .slice(0, MAX_SKILLS)
      .map(skill => ({
        id: skill.id,
        name: String(skill.name || '').trim().slice(0, 60) || 'Untitled skill',
        hint: String(skill.hint || '').trim().slice(0, 140),
        system: clean(skill.system),
        createdAt: skill.createdAt || new Date().toISOString(),
      }))
      .filter(skill => skill.system)
  : []

export function loadSkills() {
  return readStored(KEY, [], normalize).value
}

function persist(skills) {
  try { writeStored(KEY, normalize(skills)) } catch { /* a full disk must not lose the running job */ }
  return normalize(skills)
}

export function saveSkill({ name, hint = '', system, id }) {
  const skills = loadSkills()
  const entry = {
    id: id || `skill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: String(name || '').trim().slice(0, 60) || 'Untitled skill',
    hint: String(hint || '').trim().slice(0, 140),
    system: clean(system),
    createdAt: new Date().toISOString(),
  }
  if (!entry.system) throw new Error('A skill needs an instruction.')
  const next = skills.some(skill => skill.id === entry.id)
    ? skills.map(skill => (skill.id === entry.id ? entry : skill))
    : [entry, ...skills]
  return { skills: persist(next), skill: entry }
}

export function deleteSkill(id) {
  return persist(loadSkills().filter(skill => skill.id !== id))
}

/**
 * Render a skill the way open-design does, so a library can be exported and
 * read by a person. Import is intentionally not automatic: pasted instructions
 * are instructions, and nothing should enter the app without being shown first.
 */
export function skillToMarkdown(skill) {
  return [
    '---',
    `name: ${skill.name}`,
    skill.hint ? `description: ${skill.hint}` : '',
    '---',
    '',
    `# ${skill.name}`,
    '',
    skill.system,
    '',
  ].filter(Boolean).join('\n')
}
