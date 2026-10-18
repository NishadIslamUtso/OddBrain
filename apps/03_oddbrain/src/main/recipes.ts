/**
 * The recipe folder: plain markdown files the owner can read, edit, version,
 * and share. One file, one recipe, named after its slug. Refuses anything
 * that is not exactly that — a path trick, a foreign format, a broken file —
 * and says so instead of guessing.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  parseRecipeFile,
  recipeSlug,
  serializeRecipeFile,
  validateRecipe,
  type Recipe,
} from '../shared/lib/recipes'

export type RecipesList = {
  ok: boolean
  recipes: Recipe[]
  /** Files that exist but do not parse: named, never silently hidden. */
  broken: Array<{ file: string; answer: string }>
}

/** The name is the path: refuse every trick before it reaches the disk. */
export function safeRecipePath(root: string, name: string): { ok: true; file: string } | { ok: false; answer: string } {
  const slug = recipeSlug(name)
  if (!slug) return { ok: false, answer: 'The name needs at least one letter or number.' }
  if (slug.startsWith('.')) return { ok: false, answer: 'A recipe name cannot start with a dot.' }
  return { ok: true, file: join(root, `${slug}.md`) }
}

export function createRecipeManager(root: string) {
  const ensure = async (): Promise<void> => {
    await mkdir(root, { recursive: true })
  }

  const list = async (): Promise<RecipesList> => {
    await ensure()
    const files = (await readdir(root)).filter(entry => entry.endsWith('.md')).sort()
    const recipes: Recipe[] = []
    const broken: RecipesList['broken'] = []
    for (const file of files) {
      try {
        const parsed = parseRecipeFile(await readFile(join(root, file), 'utf8'))
        if (parsed.ok) recipes.push(parsed.recipe)
        else broken.push({ file, answer: parsed.answer })
      } catch (failure) {
        broken.push({ file, answer: `Could not be read: ${(failure as Error).message}` })
      }
    }
    return { ok: true, recipes, broken }
  }

  const save = async (input: Partial<Recipe>): Promise<{ ok: boolean; answer: string; recipe?: Recipe }> => {
    const checked = validateRecipe(input)
    if (!checked.ok) return checked
    const path = safeRecipePath(root, checked.recipe.name)
    if (!path.ok) return path
    await ensure()
    try {
      await writeFile(path.file, serializeRecipeFile(checked.recipe), 'utf8')
      return { ok: true, answer: `Saved as ${checked.recipe.name}.`, recipe: checked.recipe }
    } catch (failure) {
      return { ok: false, answer: `Could not save: ${(failure as Error).message}` }
    }
  }

  const remove = async (name: string): Promise<{ ok: boolean; answer: string }> => {
    const path = safeRecipePath(root, name)
    if (!path.ok) return path
    try {
      await rm(path.file, { force: false })
      return { ok: true, answer: `Removed ${name}. The file is gone; nothing was kept in secret.` }
    } catch (failure) {
      const code = (failure as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { ok: false, answer: `No recipe named ${name} exists.` }
      return { ok: false, answer: `Could not remove: ${(failure as Error).message}` }
    }
  }

  const read = async (name: string): Promise<{ ok: boolean; recipe?: Recipe; answer?: string }> => {
    const path = safeRecipePath(root, name)
    if (!path.ok) return path
    try {
      const parsed = parseRecipeFile(await readFile(path.file, 'utf8'))
      if (!parsed.ok) return parsed
      return parsed
    } catch (failure) {
      const code = (failure as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { ok: false, answer: `No recipe named ${name} exists.` }
      return { ok: false, answer: `Could not read: ${(failure as Error).message}` }
    }
  }

  return { list, save, remove, read }
}

export type RecipeManager = ReturnType<typeof createRecipeManager>
