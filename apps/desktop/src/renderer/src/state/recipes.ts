import { useSyncExternalStore } from 'react'
import { getEngineApi } from '@/platform/bridge'
import { engineStore } from './engine'
import { renderRecipe, STARTER_RECIPES, type Recipe } from '@shared/lib/recipes'

/**
 * Recipes as commands. The list lives in plain files on this machine; the
 * run is exactly a normal send — the rendered prompt goes through the engine
 * store, so the same permission cards, the same throttle and the same
 * honest usage lines apply as if it were typed by hand. Nothing here can
 * approve anything: the recipe shows what it will say, the engine asks
 * before it acts. (The lesson is Block's poisoned recipe; the answer is
 * structure, not trust.)
 */

export type RecipesState = {
  recipes: Recipe[]
  /** Files in the folder that are not readable recipes: named, never hidden. */
  broken: Array<{ file: string; answer: string }>
  loaded: boolean
  status: string
  running: string
  error: string
}

let state: RecipesState = {
  recipes: [],
  broken: [],
  loaded: false,
  status: '',
  running: '',
  error: '',
}

const listeners = new Set<() => void>()
let version = 0

const emit = (): void => {
  version += 1
  for (const listener of listeners) listener()
}

const patch = (part: Partial<RecipesState>): void => {
  state = { ...state, ...part }
  emit()
}

/** Pull the folder's recipes through the door. */
export async function loadRecipes(): Promise<void> {
  const answer = await getEngineApi().recipes.list()
  patch({
    recipes: answer.recipes ?? [],
    broken: answer.broken ?? [],
    loaded: true,
  })
}

/** Save (new or overwrite by slug) and refresh. A rename leaves NO orphan:
 *  the file under the old slug is removed once the new one is on disk. */
export async function saveRecipe(recipe: Partial<Recipe>, previousName = ''): Promise<{ ok: boolean; answer: string }> {
  const answer = await getEngineApi().recipes.save(recipe)
  if (!answer.ok) {
    patch({ error: answer.answer })
    return answer
  }
  if (previousName && previousName.trim() && previousName.trim().toLowerCase() !== recipe.name?.trim()?.toLowerCase()) {
    await getEngineApi().recipes.remove(previousName.trim())
  }
  await loadRecipes()
  if (!answer.ok) {
    patch({ error: answer.answer })
    return answer
  }
  await loadRecipes()
  patch({ status: answer.answer, error: '' })
  return answer
}

/** Remove the file and refresh. The removal is real, and said to be so. */
export async function removeRecipe(name: string): Promise<boolean> {
  const answer = await getEngineApi().recipes.remove(name)
  if (!answer.ok) {
    patch({ error: answer.answer })
    return false
  }
  await loadRecipes()
  patch({ status: answer.answer, error: '' })
  return true
}

/**
 * One press for the starters: each is saved only if its slug is not already
 * on disk — an owner's own recipe is never silently overwritten by ours.
 */
export async function addStarterRecipes(): Promise<void> {
  const existing = new Set(state.recipes.map(recipe => recipe.name.toLowerCase()))
  const fresh = STARTER_RECIPES.filter(recipe => !existing.has(recipe.name.toLowerCase()))
  if (!fresh.length) {
    patch({ status: 'The starters are already in. Nothing was overwritten.' })
    return
  }
  for (const recipe of fresh) {
    const answer = await getEngineApi().recipes.save(recipe)
    if (!answer.ok) {
      patch({ error: answer.answer })
      return
    }
  }
  await loadRecipes()
  patch({ status: `${fresh.length} starter ${fresh.length === 1 ? 'recipe' : 'recipes'} added. They are plain files now, yours to edit.` })
}

/**
 * Run a recipe: fill it in, show-check is the caller's job (the dialog shows
 * the rendered prompt before this is called), then send it the ONE way work
 * is sent. Refuses while a turn is already running — the engine works one
 * task at a time, and pretending otherwise would hide the first task.
 */
export async function runRecipe(recipe: Recipe, values: Record<string, string> = {}): Promise<{ ok: boolean; answer: string }> {
  if (state.running) return { ok: false, answer: 'A recipe is already running. Stop is in the header if it is stuck.' }
  const store = engineStore()
  if ((store.turn?.state ?? '') === 'running') return { ok: false, answer: 'The engine is still on the last task. Wait for it, or press Stop.' }
  const rendered = renderRecipe(recipe, values)
  if (!rendered.ok) {
    patch({ error: rendered.answer })
    return rendered
  }
  patch({ running: recipe.name, error: '' })
  try {
    const sent = await store.send(rendered.prompt)
    if (!sent.ok) {
      patch({ running: '', error: sent.answer })
      return { ok: false, answer: sent.answer }
    }
    patch({ running: '', status: `${recipe.name} sent. It runs like any other work order.` })
    return { ok: true, answer: sent.answer }
  } catch (failure) {
    patch({ running: '', error: (failure as Error).message })
    return { ok: false, answer: (failure as Error).message }
  }
}

export const clearRecipeNotice = (): void => patch({ status: '', error: '' })

/** The state without React, for orchestration and tests. */
export const recipesState = (): RecipesState => state

export function useRecipes(): RecipesState {
  useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => version,
  )
  return state
}
