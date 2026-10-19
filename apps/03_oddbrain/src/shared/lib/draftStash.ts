export type SavedDraft = { id: string; text: string; at: string }
export const DRAFT_LIMIT = 50
const ID = /^[a-zA-Z0-9-]{1,80}$/
/** One key per immutable draft avoids replacing another window's entire list. */
export function draftStash(storage: Storage, prefix: string) {
  const key = (id: string) => { if (!ID.test(id)) throw Error('Invalid saved draft.'); return `${prefix}.${id}` }
  const list = (): SavedDraft[] => {
    const entries: SavedDraft[] = []
    for (let i = 0; i < storage.length; i++) {
      const name = storage.key(i); if (!name?.startsWith(prefix + '.')) continue
      const raw = storage.getItem(name); if (raw === null) continue
      let item: SavedDraft
      try { item = JSON.parse(raw) } catch { throw Error('A saved draft is damaged. Its original was kept; no drafts were replaced.') }
      if (!item || !ID.test(item.id) || name !== key(item.id) || typeof item.text !== 'string' || typeof item.at !== 'string') throw Error('A saved draft is unreadable. Its original was kept.')
      entries.push(item)
    }
    return entries.sort((a, b) => b.at.localeCompare(a.at))
  }
  return {
    list,
    save(text: string, id: string, at = new Date().toISOString()): SavedDraft {
      if (!text.trim()) throw Error('Write a draft first.')
      if (text.length > 100_000) throw Error('This draft exceeds 100,000 characters. Copy or export it instead; nothing was shortened.')
      if (list().length >= DRAFT_LIMIT) throw Error('There are 50 saved drafts. Remove a saved copy before adding another; nothing was discarded.')
      if (storage.getItem(key(id)) !== null) throw Error('This draft identifier already exists. Nothing was overwritten.')
      const item = { id, text, at }
      try { storage.setItem(key(id), JSON.stringify(item)) } catch { throw Error('The draft could not be saved. Keep the text in the composer or copy it elsewhere.') }
      return item
    },
    remove(id: string) { storage.removeItem(key(id)) },
  }
}
