import type { Artifact } from '@shared/types'

/**
 * Which artifact a message should show, and from which source.
 *
 * The subtle case is a reply that is still being written. While it streams, the
 * document on screen is the throttled live sweep (see useChat), not the finished
 * artifact — and the moment the reply completes, the finished one must win, or
 * the transcript would be left showing a draft that no longer exists.
 *
 * This is separate from the panel because getting it wrong is invisible: the
 * preview looks right, it is just one version behind. Hence a test for it.
 */

export type ArtifactView = {
  artifact: Artifact
  /** The text to render: the live draft while streaming, the saved version after. */
  source: string
  /** True while this is still being written, so the preview can say so. */
  draft: boolean
}

export type LiveArtifacts = { messageId: string; artifacts: Artifact[] }

/**
 * @param messageId  the message being rendered
 * @param artifacts  the artifacts saved on that message
 * @param live       what the streaming sweep currently has, if anything
 */
export function viewsForMessage(
  messageId: string,
  artifacts: Artifact[] | undefined,
  live: LiveArtifacts
): ArtifactView[] {
  const saved = artifacts || []
  const streaming = live.messageId === messageId ? live.artifacts : []

  // Nothing streaming for this message: show what was saved.
  if (!streaming.length) {
    return saved.map(artifact => ({
      artifact,
      source: readSource(artifact),
      draft: artifact.partial === true || artifact.versions.some(version => version.draft),
    }))
  }

  // Streaming: the sweep's copy is newer for the artifacts it knows about, and
  // anything it has not reached yet still shows its last saved version.
  const byId = new Map(streaming.map(artifact => [artifact.id, artifact]))
  const ordered = [
    ...streaming,
    ...saved.filter(artifact => !byId.has(artifact.id)),
  ]
  return ordered.map(artifact => {
    const isLive = byId.has(artifact.id)
    return {
      artifact,
      source: readSource(artifact),
      draft: isLive ? true : artifact.partial === true,
    }
  })
}

/** The newest version of an artifact, or an empty string. Never throws on a
 *  half-written artifact, because those are the normal case while streaming. */
export function readSource(artifact: Artifact): string {
  const version = artifact.versions?.[artifact.versions.length - 1]
  return version?.content || ''
}

/**
 * Every artifact in a conversation, for the rail.
 *
 * Newest reply first, because that is the one you are looking at. Inside a single
 * reply the files keep the order the model wrote them: a multi-file answer is one
 * answer, and reordering it would make the rail disagree with the transcript.
 */
export function chatArtifacts(messages: Array<{ id: string; artifacts?: Artifact[] }>): Array<{
  artifact: Artifact
  messageId: string
}> {
  const out: Array<{ artifact: Artifact; messageId: string }> = []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    for (const artifact of message.artifacts || []) out.push({ artifact, messageId: message.id })
  }
  return out
}
