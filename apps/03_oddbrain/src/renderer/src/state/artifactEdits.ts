import type { Artifact } from '@shared/types'

/**
 * How an artifact changes when it is edited.
 *
 * One rule governs this whole file: **history is append-only**. A comment
 * rewrite, a restore, or anything else that changes a document pushes a new
 * version onto the end. Nothing is ever overwritten and nothing is ever removed.
 *
 * That is not tidiness. The alternative — replacing versions[0] with the new text
 * — means one bad model answer destroys the document a person built, and there is
 * no way back from it. It also means these functions can be trusted by whoever
 * calls them, because they cannot lose anything.
 */

/** A no-op edit must not pretend to be a change. */
function unchanged(artifact: Artifact, source: string): boolean {
  const current = artifact.versions[artifact.versions.length - 1]
  return current?.content === source
}

/**
 * Append a new version. Used for a comment rewrite.
 *
 * @returns a new artifact; the original is untouched.
 * @throws when there is nothing to save, because a caller that reaches this with
 *   an empty document has made a mistake that would otherwise erase the preview.
 */
export function withNewVersion(artifact: Artifact, source: string, note = ''): Artifact {
  if (!source.trim()) throw new Error('There is nothing to save: the edit produced an empty document.')
  // The model returning the document unchanged is a real outcome, and it is not
  // an edit. Adding a version for it would fill the history with empty changes.
  if (unchanged(artifact, source)) return artifact

  return {
    ...artifact,
    partial: false,
    updatedAt: new Date().toISOString(),
    versions: [
      ...artifact.versions,
      { content: source, savedAt: new Date().toISOString(), ...(note ? { note } : {}) },
    ],
  }
}

/**
 * Go back to an earlier version — by putting it back at the end.
 *
 * The obvious implementation truncates the list to `index`. This one does not,
 * because "restore v1" after two edits is itself an edit: you may want v3 back a
 * minute later, and a person who has just undone something is exactly the person
 * who is about to change their mind.
 */
export function restoredInPlace(artifact: Artifact, index: number): Artifact {
  const version = artifact.versions[index]
  if (!version) throw new Error('That version is no longer in this artifact.')
  return {
    ...artifact,
    partial: false,
    updatedAt: new Date().toISOString(),
    versions: [
      ...artifact.versions,
      { content: version.content, savedAt: new Date().toISOString(), note: `restored v${index + 1}` },
    ],
  }
}

/** The newest version. */
export function currentVersion(artifact: Artifact): number {
  return Math.max(0, artifact.versions.length - 1)
}

/** How many versions there are, for the chip: "v2 of 3". */
export function versionLabel(artifact: Artifact, index = currentVersion(artifact)): string {
  const total = artifact.versions.length
  if (total <= 1) return 'v1'
  return index === total - 1 ? `v${total} of ${total}` : `v${index + 1} of ${total}`
}

/**
 * A one-line description of a picked element, for the comment box — so the person
 * can see which element the app understood them to have clicked before they
 * spend a minute describing a change to the wrong one.
 */
export function describePick(pick: {
  picked: { tag: string; id?: string; text?: string }
  width: number
  height: number
}): string {
  const name = pick.picked.id ? `${pick.picked.tag}#${pick.picked.id}` : pick.picked.tag
  const text = String(pick.picked.text || '').replace(/\s+/g, ' ').trim()
  return [name, text ? `"${text.slice(0, 40)}"` : '', `${pick.width}×${pick.height}`]
    .filter(Boolean)
    .join(' · ')
}
