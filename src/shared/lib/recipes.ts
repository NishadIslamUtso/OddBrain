/**
 * Recipes: saved work orders. A workflow that worked is baked into one plain
 * markdown file — a prompt with {{parameters}} — so it can run again in one
 * press, on ANY engine (the app-built rule: nothing here belongs to one CLI).
 * The idea is Goose's ("learn from doing"); the honesty is ours, learned from
 * Block's own poisoned-recipe lesson: a recipe is shown in full before it is
 * sent, and it rides the same permission cards as anything typed by hand.
 * A recipe can never approve anything by itself.
 */

export type RecipeParameter = {
  /** The {{token}} inside the prompt body, also the form label. */
  name: string
  /** What to put here, in one line. */
  description?: string
  /** Used as-is when the form is left empty. */
  default?: string
}

export type Recipe = {
  /** The name on the button. Slugged for the file name. */
  name: string
  /** One line under the name, saying when to reach for it. */
  description?: string
  parameters: RecipeParameter[]
  /** The work order itself, with {{parameters}} inside. */
  body: string
}

const PARAM_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/

/** The file name a recipe carries: slug of its name, plain and safe. */
export function recipeSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || ''
}

/** The {{tokens}} a body asks for, first-seen order, duplicates dropped. */
export function recipeTokens(body: string): string[] {
  const seen: string[] = []
  for (const match of body.matchAll(/\{\{\s*([A-Za-z][A-Za-z0-9_-]*)\s*\}\}/g)) {
    if (!seen.includes(match[1])) seen.push(match[1])
  }
  return seen
}

/**
 * Fill the body in. Every token must be a declared parameter, and every
 * declared parameter must end up with something — the form's value or its
 * default. Anything else is refused with the name said out loud, never
 * guessed, so a half-filled recipe can never send a half-said work order.
 */
export function renderRecipe(
  recipe: Recipe,
  values: Record<string, string> = {},
): { ok: true; prompt: string } | { ok: false; answer: string } {
  const tokens = recipeTokens(recipe.body)
  const unknown = tokens.filter(token => !recipe.parameters.some(parameter => parameter.name === token))
  if (unknown.length) {
    return { ok: false, answer: `The prompt uses {{${unknown[0]}}}, but no parameter says what it is. Fix the recipe first.` }
  }
  const missing: string[] = []
  const filled = tokens.map(token => {
    const declared = recipe.parameters.find(parameter => parameter.name === token)
    const value = (values[token] ?? '').trim() || (declared?.default ?? '').trim()
    if (!value) missing.push(token)
    return { token, value }
  })
  if (missing.length) {
    return { ok: false, answer: `${missing.map(name => `{{${name}}}`).join(', ')} needs an answer before this can run.` }
  }
  let prompt = recipe.body
  for (const { token, value } of filled) {
    prompt = prompt.replaceAll(new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, 'g'), value)
  }
  const stripped = prompt.trim()
  if (!stripped) return { ok: false, answer: 'This recipe would send nothing at all.' }
  return { ok: true, prompt: stripped }
}

/**
 * Check a recipe from a form or a file. Refuses: no name, a parameter with a
 * broken name, a parameter declared twice, a body with nothing to send. The
 * answer always says WHICH rule failed, in plain words.
 */
export function validateRecipe(input: Partial<Recipe>): { ok: true; recipe: Recipe } | { ok: false; answer: string } {
  const name = (input.name ?? '').trim()
  if (!name) return { ok: false, answer: 'A recipe needs a name.' }
  if (name.length > 80) return { ok: false, answer: 'Keep the name under 80 characters.' }
  if (!recipeSlug(name)) return { ok: false, answer: 'The name needs at least one letter or number.' }
  const body = (input.body ?? '').replace(/\r\n/g, '\n')
  if (!body.trim()) return { ok: false, answer: 'The recipe needs a prompt — what should the engine actually do?' }
  const seen = new Set<string>()
  const parameters: RecipeParameter[] = []
  for (const raw of Array.isArray(input.parameters) ? input.parameters : []) {
    const parameterName = (raw?.name ?? '').trim()
    if (!PARAM_NAME.test(parameterName)) {
      return { ok: false, answer: `Parameter names are letters, digits, - and _, starting with a letter. "${parameterName}" does not fit.` }
    }
    if (seen.has(parameterName)) return { ok: false, answer: `Two parameters are both named ${parameterName}.` }
    seen.add(parameterName)
    parameters.push({
      name: parameterName,
      ...(raw.description?.trim() ? { description: raw.description.trim() } : {}),
      ...(raw.default?.trim() ? { default: raw.default.trim() } : {}),
    })
  }
  const recipe: Recipe = {
    name,
    parameters,
    body,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
  }
  return { ok: true, recipe }
}

const safeLine = (text: string): string => text.replace(/[\r\n]+/g, ' ').trim()

/** Serialize to the file format: frontmatter, then the prompt body. */
export function serializeRecipeFile(recipe: Recipe): string {
  const lines = ['---', `name: ${safeLine(recipe.name)}`]
  if (recipe.description) lines.push(`description: ${safeLine(recipe.description)}`)
  if (recipe.parameters.length) {
    lines.push('parameters:')
    for (const parameter of recipe.parameters) {
      lines.push(`  - name: ${parameter.name}`)
      if (parameter.description) lines.push(`    description: ${safeLine(parameter.description)}`)
      if (parameter.default) lines.push(`    default: ${safeLine(parameter.default)}`)
    }
  }
  lines.push('---', '')
  return lines.join('\n') + recipe.body.trim() + '\n'
}

/**
 * Parse a recipe file. The frontmatter is a deliberately small YAML subset —
 * only the keys this app writes. Anything else is refused BY NAME, so a
 * hand-edited or hand-shared file cannot smuggle a key the app would
 * silently ignore (the Operation Palefire lesson: read everything, trust
 * nothing that was not meant to be read).
 */
export function parseRecipeFile(text: string): { ok: true; recipe: Recipe } | { ok: false; answer: string } {
  const source = text.replace(/\r\n/g, '\n').trim()
  if (!source.startsWith('---')) return { ok: false, answer: 'Not a recipe: it needs to start with --- frontmatter.' }
  const end = source.indexOf('\n---', 3)
  if (end < 0) return { ok: false, answer: 'Not a recipe: the frontmatter never closes with ---.' }
  const head = source.slice(4, end)
  const body = source.slice(end + 4).replace(/^\n+/, '')
  if (!body.trim()) return { ok: false, answer: 'The recipe file has no prompt in it.' }
  const fields: Record<string, string> = {}
  const parameters: RecipeParameter[] = []
  let current: RecipeParameter | null = null
  for (const [index, line] of head.split('\n').entries()) {
    const where = `frontmatter line ${index + 1}`
    if (!line.trim()) continue
    const listItem = line.match(/^  - name:\s*(.+)$/)
    if (listItem) {
      if (current) return { ok: false, answer: `${where}: a parameter is missing its fields.` }
      const parameterName = listItem[1].trim()
      if (!PARAM_NAME.test(parameterName)) {
        return { ok: false, answer: `${where}: "${parameterName}" is not a usable parameter name.` }
      }
      current = { name: parameterName }
      parameters.push(current)
      continue
    }
    const field = line.match(/^    (description|default):\s*(.*)$/)
    if (field) {
      if (!current) return { ok: false, answer: `${where}: ${field[1]} belongs under a parameter.` }
      if (field[1] === 'description') current.description = field[2].trim()
      else current.default = field[2].trim()
      continue
    }
    if (line === 'parameters:') {
      if (current) return { ok: false, answer: `${where}: a parameter is still open.` }
      if (fields.parameters) return { ok: false, answer: `${where}: parameters appears twice.` }
      fields.parameters = ''
      continue
    }
    const top = line.match(/^(name|description):\s*(.*)$/)
    if (top) {
      if (current) return { ok: false, answer: `${where}: back at top level, but a parameter is still open.` }
      if (fields[top[1]] !== undefined) return { ok: false, answer: `${where}: ${top[1]} appears twice.` }
      fields[top[1]] = top[2].trim()
      continue
    }
    return { ok: false, answer: `${where}: this app writes only name, description and parameters — found: ${line.trim().slice(0, 60)}` }
  }
  const checked = validateRecipe({ name: fields.name, description: fields.description, parameters, body })
  if (!checked.ok) return checked
  return { ok: true, recipe: checked.recipe }
}

/** One-press starters, written through the same door as any hand-made recipe. */
export const STARTER_RECIPES: Recipe[] = [
  {
    name: 'Standup notes',
    description: 'Turns a messy day into three standup bullets',
    parameters: [{ name: 'project', description: 'which project the notes cover', default: 'everything' }],
    body:
      'Look at the folder I chose and write my standup notes for {{project}}: three bullets, past tense, what moved, what stalled, what is next. Plain words, no filler. If the folder says nothing happened, say exactly that instead of inventing work.',
  },
  {
    name: 'Explain this folder',
    description: 'A newcomer-readable tour of any folder',
    parameters: [{ name: 'audience', description: 'who is reading the tour', default: 'a new teammate' }],
    body:
      'Give {{audience}} a short tour of the folder I chose: what it is for, the five files that matter most and what each does, and one thing that looks stale or broken. Read the files before saying anything about them.',
  },
  {
    name: 'Fix the failing test',
    description: 'Makes one test pass without touching the others',
    parameters: [{ name: 'test', description: 'the test to make pass' }],
    body:
      'The test "{{test}}" is failing. Run it, read the failure, fix the smallest real cause, run it again, and show me the passing output. Do not weaken the test to make it pass, and do not touch other tests.',
  },
]
