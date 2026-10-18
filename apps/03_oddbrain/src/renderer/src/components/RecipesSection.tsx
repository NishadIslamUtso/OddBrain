import { useEffect, useState } from 'react'
import { Plus, ScrollText, Trash2 } from 'lucide-react'
import { addStarterRecipes, clearRecipeNotice, loadRecipes, removeRecipe, saveRecipe, useRecipes } from '@/state/recipes'
import { recipeSlug, type Recipe, type RecipeParameter } from '@shared/lib/recipes'

/**
 * The Recipes pane: saved work orders as plain markdown on this machine.
 * Create, edit, remove, and the three starters in one press. The pane says
 * where the files live and what a run does — nothing hidden, nothing that
 * approves itself.
 */
export default function RecipesSection() {
  const recipes = useRecipes()
  const [editing, setEditing] = useState<Recipe | null>(null)

  useEffect(() => {
    if (!recipes.loaded) void loadRecipes()
  }, [recipes.loaded])

  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[16px] font-semibold text-ink">
            <ScrollText size={15} aria-hidden />
            Recipes
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            A recipe is a work order that worked, saved as one plain markdown file: a prompt with
            {' '}{'{{parameters}}'}. Run it from the composer's Recipes button. It is shown in full before it
            sends, and the engine still asks before it acts — a recipe approves nothing by itself.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ name: '', description: '', parameters: [], body: '' })}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12px] text-ink hover:border-ok"
        >
          <Plus size={12} aria-hidden />
          New recipe
        </button>
      </header>

      {recipes.status ? (
        <p role="status" className="mt-3 rounded-lg border border-line bg-bg px-3 py-2 text-[12px] text-ink">
          {recipes.status}
          <button type="button" onClick={clearRecipeNotice} aria-label="Clear" className="ml-2 text-muted hover:text-ink">
            ×
          </button>
        </p>
      ) : null}
      {recipes.error ? <p className="mt-3 text-[12px] text-warn">{recipes.error}</p> : null}

      <ul className="mt-4 space-y-2" aria-label="Saved recipes">
        {recipes.recipes.map(recipe => (
          <li key={recipe.name} className="rounded-xl border border-line bg-card px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">{recipe.name}</p>
                {recipe.description ? <p className="mt-0.5 text-[12px] text-muted">{recipe.description}</p> : null}
                <p className="mt-1 text-[11px] text-muted">
                  {recipe.parameters.length
                    ? `Parameters: ${recipe.parameters.map(parameter => parameter.name).join(', ')}`
                    : 'No parameters'}
                  {` · file: ${recipeSlug(recipe.name)}.md`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditing(recipe)}
                  className="rounded-lg border border-line px-2 py-1 text-[11.5px] text-ink hover:border-ok"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void removeRecipe(recipe.name)}
                  aria-label={`Remove ${recipe.name}`}
                  title={`Delete ${recipeSlug(recipe.name)}.md from disk`}
                  className="rounded-lg border border-line p-1.5 text-muted hover:text-warn"
                >
                  <Trash2 size={12} aria-hidden />
                </button>
              </div>
            </div>
          </li>
        ))}
        {recipes.loaded && recipes.recipes.length === 0 ? (
          <li className="rounded-xl border border-line bg-card px-3 py-3 text-[12.5px] text-muted">
            No recipes yet. Add the three starters below, or write your own.
          </li>
        ) : null}
      </ul>

      {recipes.broken.length ? (
        <div className="mt-3 rounded-xl border border-warn/40 px-3 py-2.5">
          <p className="text-[12px] font-medium text-warn">Files that are not readable recipes</p>
          <ul className="mt-1 space-y-1">
            {recipes.broken.map(entry => (
              <li key={entry.file} className="text-[11.5px] leading-relaxed text-muted">
                <span className="text-ink">{entry.file}</span> — {entry.answer}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-3 py-2.5">
        <p className="text-[12px] leading-relaxed text-muted">
          Three starters, written the way this app works: Standup notes, Explain this folder, Fix the failing test.
        </p>
        <button
          type="button"
          onClick={() => void addStarterRecipes()}
          className="h-8 shrink-0 rounded-lg border border-line px-2.5 text-[12px] text-ink hover:border-ok"
        >
          Add the starters
        </button>
      </div>

      <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
        The files live in this app's data folder under <code className="text-ink">recipes/</code> — plain markdown, yours
        to read, version, and share. A recipe file you did not write is still shown in full before it runs.
      </p>

      {editing ? <RecipeEditor initial={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  )
}

function RecipeEditor({ initial, onClose }: { initial: Recipe; onClose: () => void }) {
  const [name, setName] = useState(initial.name)
  const [description, setDescription] = useState(initial.description ?? '')
  const [body, setBody] = useState(initial.body)
  const [parameters, setParameters] = useState<RecipeParameter[]>(initial.parameters)
  const [error, setError] = useState('')

  const submit = async (): Promise<void> => {
    setError('')
    const answer = await saveRecipe({ name, description, body, parameters }, initial.name)
    if (answer.ok) onClose()
    else setError(answer.answer)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" role="dialog" aria-label={initial.name ? `Edit ${initial.name}` : 'New recipe'} onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-[640px] overflow-y-auto rounded-2xl border border-line bg-card p-5" onClick={event => event.stopPropagation()}>
        <h2 className="text-[15px] font-semibold text-ink">{initial.name ? `Edit ${initial.name}` : 'New recipe'}</h2>
        <div className="mt-3 grid grid-cols-1 gap-3">
          <label className="block">
            <span className="text-[12px] font-medium text-ink">Name</span>
            <input
              type="text"
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Standup notes"
              aria-label="Recipe name"
              className="mt-1 w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-muted"
            />
          </label>
          <label className="block">
            <span className="text-[12px] font-medium text-ink">When to reach for it</span>
            <input
              type="text"
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="One line under the name"
              aria-label="Recipe description"
              className="mt-1 w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-muted"
            />
          </label>
          <div>
            <span className="text-[12px] font-medium text-ink">Parameters</span>
            <ul className="mt-1 space-y-1.5" aria-label="Recipe parameters">
              {parameters.map((parameter, index) => (
                <li key={index} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-bg px-2 py-1.5">
                  <input
                    type="text"
                    value={parameter.name}
                    onChange={event => setParameters(current => current.map((entry, at) => (at === index ? { ...entry, name: event.target.value } : entry)))}
                    placeholder="name"
                    aria-label={`Parameter ${index + 1} name`}
                    className="w-[130px] rounded-md border border-line bg-card px-2 py-1 text-[12px] text-ink outline-none"
                  />
                  <input
                    type="text"
                    value={parameter.description ?? ''}
                    onChange={event => setParameters(current => current.map((entry, at) => (at === index ? { ...entry, description: event.target.value } : entry)))}
                    placeholder="what it is"
                    aria-label={`Parameter ${index + 1} description`}
                    className="min-w-[140px] flex-1 rounded-md border border-line bg-card px-2 py-1 text-[12px] text-ink outline-none"
                  />
                  <input
                    type="text"
                    value={parameter.default ?? ''}
                    onChange={event => setParameters(current => current.map((entry, at) => (at === index ? { ...entry, default: event.target.value } : entry)))}
                    placeholder="default"
                    aria-label={`Parameter ${index + 1} default`}
                    className="w-[110px] rounded-md border border-line bg-card px-2 py-1 text-[12px] text-ink outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setParameters(current => current.filter((_, at) => at !== index))}
                    aria-label={`Remove parameter ${index + 1}`}
                    className="text-muted hover:text-warn"
                  >
                    <Trash2 size={12} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setParameters(current => [...current, { name: '', description: '', default: '' }])}
              className="mt-1.5 flex items-center gap-1 text-[11.5px] text-muted hover:text-ink"
            >
              <Plus size={11} aria-hidden />
              Add parameter
            </button>
          </div>
          <label className="block">
            <span className="text-[12px] font-medium text-ink">
              The work order — write {'{{name}}'} where a parameter goes
            </span>
            <textarea
              value={body}
              onChange={event => setBody(event.target.value)}
              rows={8}
              placeholder="Look at the folder I chose and… {{project}} …"
              aria-label="Recipe prompt body"
              className="mt-1 w-full resize-y rounded-lg border border-line bg-bg px-2.5 py-2 text-[12.5px] leading-relaxed text-ink outline-none placeholder:text-muted"
            />
          </label>
        </div>
        {error ? <p className="mt-2 text-[11.5px] text-warn">{error}</p> : null}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="h-8 rounded-lg border border-line px-3 text-[12px] text-muted hover:text-ink">
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} className="h-8 rounded-lg bg-accent px-3 text-[12.5px] font-medium text-[var(--accent-ink)] hover:bg-accent/90">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
