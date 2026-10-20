/**
 * Isolated checkouts, so reviewed work can run beside the owner's own folder
 * without editing it.
 *
 * A worktree here is a Git checkout of the selected folder's repository at one
 * commit, created by this app in its own storage, detached (no branch), and
 * never pushed, merged, committed to on the owner's behalf, or deleted with the
 * owner's files in it.
 *
 * This is isolation of *folders*, not a sandbox: a command that runs in a
 * worktree still runs as the OS user and can read or write anything that user
 * can reach. The app says that plainly rather than implying safety.
 */
export type Worktree = {
  id: string
  /** Absolute path of the checkout. */
  path: string
  /** Absolute path of the repository's main working tree. */
  repo: string
  /** Commit the checkout was created at. */
  base: string
  createdAt: string
  /** Files reported changed in the checkout right now (0 for a clean tree). */
  changes: number
  /** Present when the checkout is gone but the record is kept as history. */
  removedAt?: string
}

export type WorktreeAnswer = { ok: boolean; answer: string; worktree?: Worktree }

export type WorktreeBridge = {
  list(): Promise<{ worktrees: Worktree[]; problem: string }>
  /** Create one from the folder the app has selected; the renderer names no path. */
  create(): Promise<WorktreeAnswer>
  /** `discardChanges` must be an explicit choice; otherwise a dirty tree refuses. */
  remove(id: string, discardChanges: boolean): Promise<{ ok: boolean; answer: string }>
}

/** What to say before a worktree is used to run work. */
export const WORKTREE_DISCLOSURE =
  'An isolated checkout of the selected folder’s repository, created by this app. Commands run in that folder as your OS user; the folder is separate, the permissions are not. Nothing is committed, pushed or merged back, and files there are kept until you remove the checkout.'
