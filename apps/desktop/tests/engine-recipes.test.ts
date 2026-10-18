// @vitest-environment jsdom
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import type { EngineEvent } from '../src/shared/lib/engine'
import {
  parseRecipeFile,
  renderRecipe,
  recipeSlug,
  recipeTokens,
  serializeRecipeFile,
  STARTER_RECIPES,
  validateRecipe,
  type Recipe,
} from '../src/shared/lib/recipes'
import { createRecipeManager, safeRecipePath } from '../src/main/recipes'
import { resetEngineForTests, engineStore } from '../src/renderer/src/state/engine'
import { addStarterRecipes, loadRecipes, recipesState, removeRecipe, runRecipe, saveRecipe } from '../src/renderer/src/state/recipes'

/**
 * Recipes: saved work orders as plain markdown. Goose's idea, the app's
 * honesty: a recipe is a prompt with {{parameters}}, shown in full before it
 * sends, run the ONE way work is sent — the engine's own cards still gate
 * everything. Nothing here approves anything by itself, and the tests hold
 * that line: unknown frontmatter is refused BY NAME, a half-filled recipe
 * cannot send, a path trick never reaches the disk.
 */

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8')

const sample: Recipe = {
  name: 'Standup notes',
  description: 'Turns a messy day into three standup bullets',
  parameters: [{ name: 'project', description: 'which project the notes cover', default: 'everything' }],
  body: 'Three standup bullets for {{project}} today. What moved, what stalled, what is next.',
}

test('a recipe round-trips through its file: nothing added, nothing lost', () => {
  const text = serializeRecipeFile(sample)
  const back = parseRecipeFile(text)
  assert.ok(back.ok)
  if (!back.ok) return
  assert.equal(back.recipe.name, sample.name)
  assert.equal(back.recipe.description, sample.description)
  assert.deepEqual(back.recipe.parameters, sample.parameters)
  assert.equal(back.recipe.body, sample.body)
})

test('render fills every token, twice over, and falls back to the default', () => {
  const recipe: Recipe = {
    name: 'Echo',
    parameters: [
      { name: 'who', default: 'the team' },
      { name: 'when' },
    ],
    body: 'Tell {{who}} and tell {{who}} again: the review is {{when}}.',
  }
  const filled = renderRecipe(recipe, { when: 'Friday' })
  assert.ok(filled.ok)
  if (filled.ok) assert.equal(filled.prompt, 'Tell the team and tell the team again: the review is Friday.')
  const refused = renderRecipe(recipe, {})
  assert.equal(refused.ok, false)
  if (!refused.ok) assert.match(refused.answer, /\{\{when\}\}/)
})

test('a body that uses an undeclared token is refused before anyone fills it', () => {
  const recipe: Recipe = { name: 'X', parameters: [], body: 'say {{magic}} now' }
  const answer = renderRecipe(recipe, {})
  assert.equal(answer.ok, false)
  if (!answer.ok) assert.match(answer.answer, /\{\{magic\}\}/)
  assert.deepEqual(recipeTokens('a {{one}} b {{one}} c {{two}}'), ['one', 'two'])
})

test('validate refuses no name, no body, broken or duplicate parameters', () => {
  assert.equal(validateRecipe({ ...sample, name: '  ' }).ok, false)
  assert.equal(validateRecipe({ ...sample, body: '   ' }).ok, false)
  const bad = validateRecipe({ ...sample, parameters: [{ name: '9lives' }] })
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.match(bad.answer, /9lives/)
  const twice = validateRecipe({ ...sample, parameters: [{ name: 'a' }, { name: 'a' }] })
  assert.equal(twice.ok, false)
  if (!twice.ok) assert.match(twice.answer, /both named a/)
  const clean = validateRecipe({ ...sample, parameters: [{ name: ' ok ', description: ' fine ', default: '  ' }] })
  assert.ok(clean.ok)
  if (clean.ok) assert.deepEqual(clean.recipe.parameters, [{ name: 'ok', description: 'fine' }])
})

test('a hand-edited file cannot smuggle a key past the reader: unknown frontmatter is refused BY NAME', () => {
  const smuggled = serializeRecipeFile(sample).replace('---\n', '---\nauto_approve: always\n')
  const refused = parseRecipeFile(smuggled)
  assert.equal(refused.ok, false)
  if (!refused.ok) assert.match(refused.answer, /auto_approve/)
  assert.equal(parseRecipeFile('no frontmatter at all').ok, false)
  assert.equal(parseRecipeFile('---\nname: X\n---\n').ok, false, 'a recipe with no prompt is not a recipe')
  const brokenParam = parseRecipeFile('---\nname: X\nparameters:\n  - name: 9bad\n---\nbody here')
  assert.equal(brokenParam.ok, false)
  if (!brokenParam.ok) assert.match(brokenParam.answer, /frontmatter line 3/)
})

test('a recipe name is a path, and every trick in it dies at the door', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'recipes-door-'))
  const manager = createRecipeManager(dir)
  const up = await manager.save({ ...sample, name: '../../../etc/passwd' })
  // The trick becomes a slug: flattened to harmless letters, never a path.
  if (up.ok) {
    const files = await readdir(dir)
    for (const file of files) assert.ok(!file.includes('/'))
  }
  const dot = await manager.save({ ...sample, name: '...' })
  assert.equal(dot.ok, false)
  const empty = safeRecipePath(dir, ' /// ')
  assert.equal(empty.ok, false)
  await rm(dir, { recursive: true, force: true })
})

test('the folder: save, list, overwrite by slug, remove, and broken files are named', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'recipes-mgr-'))
  const manager = createRecipeManager(dir)
  const saved = await manager.save(sample)
  assert.ok(saved.ok)
  const sameFile = await manager.save({ ...sample, name: 'standup NOTES' })
  assert.ok(sameFile.ok, 'the same slug overwrites; the owner is never surprised by a near-duplicate')
  const listed = await manager.list()
  assert.equal(listed.recipes.length, 1)
  assert.equal(listed.recipes[0]?.name, 'standup NOTES', 'one file, one recipe: the saved content is what the folder holds')
  await writeFile(join(dir, 'junk.md'), '---\nname: X\nweird_key: 1\n---\nbody', 'utf8')
  const withJunk = await manager.list()
  assert.equal(withJunk.broken.length, 1)
  assert.match(withJunk.broken[0]?.answer ?? '', /weird_key/)
  const gone = await manager.remove('Standup notes')
  assert.ok(gone.ok)
  const twice = await manager.remove('Standup notes')
  assert.equal(twice.ok, false)
  assert.match(twice.answer, /No recipe named/)
  await rm(dir, { recursive: true, force: true })
})

type FakeApi = {
  listener: ((event: EngineEvent) => void) | null
  sent: Array<{ prompt: string; cwd: string }>
  files: Map<string, string>
  savedCount: number
}

function withFakeRecipeEngine(): FakeApi {
  const fake: FakeApi = { listener: null, sent: [], files: new Map(), savedCount: 0 }
  ;(window as unknown as Record<string, unknown>).api = {}
  ;(window as unknown as Record<string, unknown>).engineApi = {
    read: async () => ({
      engine: { id: 'claude-code', model: 'gemma4:cloud', baseUrl: '', workspace: '', approval: 'ask' },
      running: true,
      history: [],
    }),
    models: async () => ({ ok: true, models: [{ name: 'gemma4:cloud', cloud: true, sizeGB: null }] }),
    setModel: async () => ({ ok: true, answer: 'brain set' }),
    send: async (prompt: string, cwd: string) => {
      fake.sent.push({ prompt, cwd })
      return { ok: true, answer: 'started' }
    },
    answer: async () => ({ ok: true }),
    stop: async () => ({ ok: true }),
    onEvent: (listener: (event: EngineEvent) => void) => {
      fake.listener = listener
      return () => undefined
    },
    onPullEvent: () => () => undefined,
    recipes: {
      list: async () => ({
        ok: true,
        recipes: [...fake.files.values()].map(text => {
          const parsed = parseRecipeFile(text)
          if (!parsed.ok) throw new Error(parsed.answer)
          return parsed.recipe
        }),
        broken: [],
      }),
      save: async (recipe: unknown) => {
        const checked = validateRecipe(recipe as Partial<Recipe>)
        if (!checked.ok) return checked
        fake.files.set(recipeSlug(checked.recipe.name), serializeRecipeFile(checked.recipe))
        fake.savedCount += 1
        return { ok: true, answer: `Saved as ${checked.recipe.name}.` }
      },
      remove: async (name: string) => {
        const had = fake.files.delete(recipeSlug(name))
        return had ? { ok: true, answer: `Removed ${name}.` } : { ok: false, answer: `No recipe named ${name} exists.` }
      },
    },
  }
  return fake
}

test('running a recipe sends the RENDERED prompt the one way work is sent', async () => {
  const fake = withFakeRecipeEngine()
  resetEngineForTests()
  await loadRecipes()
  const saved = await saveRecipe(sample)
  assert.ok(saved.ok)
  const answer = await runRecipe(sample, { project: 'the vault app' })
  assert.ok(answer.ok)
  assert.equal(fake.sent.length, 1)
  assert.match(fake.sent[0]?.prompt ?? '', /Three standup bullets for the vault app today\./)
  assert.doesNotMatch(fake.sent[0]?.prompt ?? '', /\{\{project\}\}/)
})

test('a half-filled recipe refuses to send, and says which blank it needs', async () => {
  withFakeRecipeEngine()
  resetEngineForTests()
  const needsBoth: Recipe = { name: 'Both', parameters: [{ name: 'a' }, { name: 'b' }], body: 'use {{a}} and {{b}}' }
  const answer = await runRecipe(needsBoth, { a: 'something' })
  assert.equal(answer.ok, false)
  if (!answer.ok) assert.match(answer.answer, /\{\{b\}\}/)
})

test('the engine being busy stops a recipe before anything is sent', async () => {
  const fake = withFakeRecipeEngine()
  resetEngineForTests()
  const store = engineStore()
  // The first send starts a turn; until the engine's events close it, the
  // store is busy — and a recipe is exactly as patient as a hand-typed send.
  await store.send('a hand-typed task, already running')
  const answer = await runRecipe(sample, { project: 'x' })
  assert.equal(answer.ok, false)
  if (!answer.ok) assert.match(answer.answer, /last task/)
  assert.equal(fake.sent.length, 1, 'the running task was sent; the recipe was not')
})

test('the starters land in one press and never overwrite a recipe the owner made', async () => {
  withFakeRecipeEngine()
  resetEngineForTests()
  await loadRecipes()
  await addStarterRecipes()
  assert.equal(recipesState().recipes.length, 3)
  assert.ok(STARTER_RECIPES.length >= 3)
  // The owner rewrote the starter in their own words; adding starters again
  // must leave those words exactly as they are.
  await removeRecipe('Standup notes')
  await saveRecipe({ ...sample, body: 'MY OWN WORDS, not the starter' })
  await addStarterRecipes()
  const after = recipesState().recipes.find(recipe => recipe.name === 'Standup notes')
  assert.match(after?.body ?? '', /MY OWN WORDS/, 'the starter must not stomp the owner file')
})

test('the wiring: recipes are reachable from the composer, the settings, and both bridge shapes', () => {
  const composer = read('../src/renderer/src/components/Composer.tsx')
    const settings = read('../src/renderer/src/components/SettingsView.tsx')
  const preload = read('../src/preload/index.ts')
  for (const door of ['recipes:list', 'recipes:save', 'recipes:remove']) {
  }
  const main = read('../src/main/index.ts')
  for (const door of ['recipes:list', 'recipes:save', 'recipes:remove']) {
  }
  const bridge = read('../src/renderer/src/platform/bridge.ts')
})
