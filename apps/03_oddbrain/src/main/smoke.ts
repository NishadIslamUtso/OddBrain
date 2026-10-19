/**
 * The one place that decides whether a native smoke run passed.
 *
 * The smoke run is the only check that proves the window opens, paints and
 * scrolls on the real Electron binary. Its verdict used to be a single boolean
 * expression buried in `index.ts`, which meant the rule "a warning is already
 * a failure" was a claim in a comment rather than something a test could hold.
 * This returns the reason, in words, or an empty string when it passed.
 */
export type SmokeFacts = {
  /** The renderer reached `readyState === 'complete'` with the shell mounted. */
  ready: boolean
  errors: number
  warnings: number
  /** The window actually became visible, i.e. someone could have seen it. */
  visible: boolean
  /** The captured frame was empty. */
  blank: boolean
  /** `SCROLL OK`, `SCROLL BROKEN …`, `SCROLL FAILED …`, or the not-run line. */
  scrollLine: string
}

export function smokeFailure(facts: SmokeFacts): string {
  if (!facts.ready) return 'the interface did not reach a painted, mounted state within 8s'
  if (!facts.visible) return 'the window never became visible'
  if (facts.blank) return 'the window photographed blank after four attempts'
  if (facts.scrollLine.startsWith('SCROLL BROKEN')) return `the message list did not scroll (${facts.scrollLine})`
  if (facts.scrollLine.startsWith('SCROLL FAILED')) return `the scroll probe could not run (${facts.scrollLine})`
  if (facts.errors > 0) return `${facts.errors} renderer error${facts.errors === 1 ? '' : 's'}`
  if (facts.warnings > 0) return `${facts.warnings} renderer warning${facts.warnings === 1 ? '' : 's'}`
  if (!facts.scrollLine.startsWith('SCROLL OK')) return `the scroll proof did not run (${facts.scrollLine})`
  return ''
}
