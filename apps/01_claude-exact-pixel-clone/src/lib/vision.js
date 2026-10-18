/**
 * vision.js — the Vision Bridge.
 *
 * A text-only local model cannot look at a picture. Instead of refusing the
 * attachment (the old behaviour) or silently dropping it, the app asks an
 * installed *vision* model to describe the image, then hands that description to
 * the text model as plain source data.
 *
 * This is what makes images usable on a 4 GB card: qwen2.5:3b answers, and
 * qwen3-vl:4b is loaded only for the few seconds it takes to look.
 *
 * The description is always labelled in the transcript, so it is never
 * presented as if the answering model had seen the image itself.
 */

/** The tag the description is fenced with when it reaches the text model. */
export const BRIDGE_TAG = 'vision_bridge'

/** Longest description kept, in characters. The main model only has a 4k context. */
export const BRIDGE_MAX_CHARS = 1600

export function hasImages(attachments = []) {
  return attachments.some(file => file?.kind === 'image')
}

/** True when images are attached but the selected model has no verified vision. */
export function needsBridge(capabilities, attachments = []) {
  return hasImages(attachments) && !capabilities?.vision
}

/**
 * Choose a bridge model. Only models whose capabilities were verified by
 * Ollama's /api/show are candidates: a name is never treated as proof.
 * The user's explicit choice wins when it is still installed and verified.
 */
export function pickBridgeModel(verifiedVisionModels = [], preferred = '', selected = '') {
  const names = verifiedVisionModels.map(entry => (typeof entry === 'string' ? entry : entry.name)).filter(Boolean)
  if (preferred && names.includes(preferred) && preferred !== selected) return preferred
  return names.find(name => name !== selected) || ''
}

/** Instruction given to the vision model. Tuned for a small local model. */
export function bridgePrompt({ userText = '', imageCount = 1, language = 'English' } = {}) {
  const question = userText.trim()
    ? `The person asking also wrote: "${userText.trim().slice(0, 400)}". Spend most of the description on what that question needs.`
    : 'The person did not write a question, so describe the image generally.'
  return [
    `You are a careful image describer. ${imageCount > 1 ? `${imageCount} images follow. Describe each one separately, numbered.` : 'One image follows.'}`,
    'Transcribe every visible piece of text exactly, including numbers, labels, buttons, headings and code.',
    'Describe layout, objects, people, colours, charts (with their values if readable) and any UI elements.',
    'Report only what is visible. If something is unclear or unreadable, say so instead of guessing.',
    `Answer in ${language}. Be dense and factual, no preamble, no markdown headings, at most 180 words.`,
    question,
  ].join(' ')
}

/** Messages for the bridge request: one user turn carrying the images. */
export function buildBridgeMessages({ images = [], userText = '', language = 'English' }) {
  if (!images.length) throw new Error('The vision bridge needs at least one image.')
  return [{ role: 'user', content: bridgePrompt({ userText, imageCount: images.length, language }), images }]
}

/** Drop a stray markdown heading or bullet chatter a small model adds. */
export function cleanDescription(text = '') {
  const cleaned = String(text)
    .replace(/^\s*(?:#{1,6}\s*)?(?:image )?description:?\s*/i, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (cleaned.length <= BRIDGE_MAX_CHARS) return cleaned
  return `${cleaned.slice(0, BRIDGE_MAX_CHARS).trimEnd()}\n[description truncated by the app to fit the local context]`
}

/** The block appended to the text model's user turn. */
export function bridgeBlock({ descriptions = [], model = '', truncated = false }) {
  const body = descriptions.map((entry, index) => descriptions.length > 1 ? `Image ${index + 1}: ${entry}` : entry).join('\n\n')
  return `<${BRIDGE_TAG} described_by="${model}" note="The answering model cannot see the image; this text is its only view of it."${truncated ? ' truncated="true"' : ''}>\n${body}\n</${BRIDGE_TAG}>`
}

/** One short line for the composer and transcript, so the hop is never hidden. */
export function bridgeSummary(model, count) {
  return `${count} image${count === 1 ? '' : 's'} described by ${model}`
}
