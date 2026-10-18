import { useRef, useState } from 'react'
import type { Artifact } from '@shared/types'
import { askLocal } from '@shared/lib/ask'
import { applyElementRewrite, cleanElementRewrite, rewritePrompt, type ElementPick } from '@shared/lib/artifacts'
import type { InferenceSettings } from '@shared/lib/inference'

/**
 * Comment mode: rewrite one element of a document, in place.
 *
 * Everything that decides *what* to change lives in the shared library and was
 * tested before this file existed — the prompt that tells a small model to return
 * one element and nothing else, the cleaning that strips the fences and the whole
 * document it may add anyway, and the replacement itself, which parses the source
 * and the replacement with the same HTML parser so the index path the preview
 * reported means the same thing on both sides.
 *
 * What is here is the part that needs a running app: one rewrite at a time, a
 * stage the person can read while it works, and plain-language failures.
 *
 * A rewrite that comes back wrong is not an error state — it is a version. The
 * document keeps its old self (see artifactEdits), so the cost of a bad answer is
 * one click to go back, not a lost file.
 */

export type RewriteRequest = {
  artifact: Artifact
  /** The text currently on screen, which is what gets rewritten. */
  source: string
  pick: ElementPick
  comment: string
}

export type ArtifactRewrite = {
  /** Run one rewrite. Resolves with the new source, or null when it failed. */
  rewrite: (request: RewriteRequest) => Promise<string | null>
  /** The artifact being rewritten right now, or null. */
  busyId: string | null
  /** A line to show while it works, and to say why nothing changed when it stops. */
  stage: string
  error: string
  /** Which artifact that error belongs to. One rewrite runs at a time, so a
   *  failure must not be printed on every other card in the conversation. */
  errorFor: string
  /** Give up on the current change. The document is left exactly as it was. */
  stop: () => void
}

export default function useArtifactRewrite({
  model,
  available,
  inference,
}: {
  model: string
  /** False when Ollama is offline or the selected model is not installed. */
  available: boolean
  inference?: InferenceSettings | string
}): ArtifactRewrite {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [errorFor, setErrorFor] = useState('')
  const controller = useRef<AbortController | null>(null)

  async function rewrite({ artifact, source, pick, comment }: RewriteRequest): Promise<string | null> {
    if (controller.current) {
      setError('Wait for the current change to finish.')
      setErrorFor(artifact.id)
      return null
    }
    if (!available) {
      setError('Changing a document needs a local model. Start Ollama and pick an installed model first.')
      setErrorFor(artifact.id)
      return null
    }
    const instruction = String(comment || '').trim()
    if (!instruction) {
      setError('Say what should change about this element.')
      setErrorFor(artifact.id)
      return null
    }

    const job = new AbortController()
    controller.current = job
    setBusyId(artifact.id)
    setError('')
    setErrorFor('')
    // Not the chat engine: this is a direct, local-brain edit with its own
    // stop button — said out loud so nobody wonders which model ran.
    setStage('Asking the local brain (not the chat engine) to rewrite that element…')
    try {
      const { content } = await askLocal({
        model,
        messages: [
          {
            role: 'user',
            content: rewritePrompt({ pick, comment: instruction, source, type: artifact.type }),
          },
        ],
        signal: job.signal,
        // A single element is small, so this is generous rather than tight.
        timeoutMs: 180_000,
        budgetLabel: 'This change',
        inference,
        onChunk: piece =>
          setStage(`Rewriting that element… ${piece.content.trim().length} characters so far`),
      })

      // The model may wrap the element in fences or hand back a whole document.
      const replacement = cleanElementRewrite(content)
      if (!replacement.trim()) {
        throw new Error('The model returned nothing to put there, so the document is unchanged.')
      }
      // applyElementRewrite throws with a sentence we can show as-is: the element
      // moved, or the replacement was not valid HTML. Nothing is changed on failure.
      const next = applyElementRewrite(source, pick.path, replacement)
      setStage('')
      return next
    } catch (failure) {
      const problem = failure as Error
      setError(
        job.signal.aborted
          ? 'Stopped. The document is exactly as it was.'
          : problem.message
      )
      setErrorFor(artifact.id)
      setStage('')
      return null
    } finally {
      controller.current = null
      setBusyId(null)
    }
  }

  return {
    rewrite,
    busyId,
    stage,
    error,
    errorFor,
    stop: () => controller.current?.abort(),
  }
}
