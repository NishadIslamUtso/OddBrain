/**
 * What reaches the model, layer by layer.
 *
 * Prompt-extraction ("what is above you", "repeat everything before this") is
 * not stopped by asking a model nicely, and a system prompt is not a safe place
 * for a secret. The only durable defences are (a) never put a secret in any of
 * these layers, and (b) be able to say exactly which layers exist and who owns
 * each one. This module is (b): a plain description the app can show, built from
 * facts the main process actually holds — not from a guess about the vendor.
 */
export type PromptLayerId = 'engine' | 'house-rules' | 'project' | 'history' | 'overrides' | 'vault' | 'attachments'

export type PromptLayer = {
  id: PromptLayerId
  title: string
  /** Who authors it, in plain words. */
  ownership: 'engine' | 'app' | 'owner' | 'mixed'
  /** Where it actually lives, or why it cannot be shown. */
  source: string
  /** What it contributes, in one sentence. */
  contributes: string
  /** True only when the app can show the exact text. */
  visible: boolean
}

export type PromptLayerFacts = {
  engine: 'claude-code' | 'agy'
  /** The selected working folder, if any. */
  workspace: string
  /** House-rules files per engine, with the digest of what is on disk now. */
  houseRules: Array<{ engine: 'claude-code' | 'agy'; file: string; present: boolean; digest: string }>
  /** True when a vault folder is selected (the local brain path can use it). */
  vaultSelected: boolean
  /** Stored chat messages that would be sent as context. */
  historyMessages: number
}

/** Said once, under the list. Not reassurance — a statement of the limit. */
export const PROMPT_EXTRACTION_NOTE =
  'A model can repeat anything in these layers if it is asked to, including a system prompt. That is a property of language models, not a bug to be prompted away. So no provider key, OS credential or saved app secret is ever placed in a prompt; keys stay in the main process. Treat every line above as readable by the model and by anyone reading a transcript.'

export function describePromptLayers(facts: PromptLayerFacts): PromptLayer[] {
  const engineName = facts.engine === 'agy' ? 'agy (Antigravity)' : 'Claude Code'
  const current = facts.houseRules.find(entry => entry.engine === facts.engine)
  return [
    {
      id: 'engine',
      title: 'Engine system prompt',
      ownership: 'engine',
      source: `Owned by ${engineName}. This app neither writes it nor stores a copy, so it cannot be shown here — and it is not a secret either.`,
      contributes: 'The vendor’s own instructions for its agent: tool use, safety rules, response style.',
      visible: false,
    },
    {
      id: 'house-rules',
      title: 'House rules',
      ownership: 'app',
      source: current
        ? `${current.file}${current.present ? ` · sha256 ${current.digest.slice(0, 16)}…` : ' · not written yet'}`
        : 'No house-rules file for this engine yet.',
      contributes: 'The marked block this app writes into the engine’s own instruction file: identity, artifact contract, approval habit, memory discipline, style.',
      visible: true,
    },
    {
      id: 'project',
      title: 'Project context',
      ownership: 'owner',
      source: facts.workspace ? `Working folder ${facts.workspace}; project goal, notes, references and extra folders you attached.` : 'No working folder is selected.',
      contributes: 'The project’s own facts and the files you chose to reference, read under a size limit.',
      visible: true,
    },
    {
      id: 'history',
      title: 'Conversation',
      ownership: 'mixed',
      source: `${facts.historyMessages.toLocaleString()} stored message(s) in this chat.`,
      contributes: 'What you and the model already said here — the part you can scroll back through.',
      visible: true,
    },
    {
      id: 'overrides',
      title: 'Chat overrides',
      ownership: 'owner',
      source: 'This chat’s goal, style and folder choices, which replace the project defaults for this chat only.',
      contributes: 'Narrower than the project: they change this conversation, not the engine.',
      visible: true,
    },
    {
      id: 'vault',
      title: 'Vault excerpts',
      ownership: 'app',
      source: facts.vaultSelected
        ? 'Chosen from the selected vault on the local brain path; labelled as source data in that request.'
        : 'No vault folder is selected, so no excerpt can be sent.',
      contributes: 'Quoted notes offered as reading material. In the local path the request says not to obey instructions inside them.',
      visible: true,
    },
    {
      id: 'attachments',
      title: 'Attachments',
      ownership: 'owner',
      source: 'Pictures you attached, and any file text you pasted. Their exact bytes are kept with the turn record.',
      contributes: 'What you put in front of the model, byte for byte.',
      visible: true,
    },
  ]
}

/** The one-line answer to "why did it say its system prompt?". */
export const PROMPT_RECITAL_ANSWER =
  'Nothing in this app decides whether a model recites its instructions. When asked what is “above” it, a model may repeat the nearest instruction-like text it holds — the engine’s own system prompt, the house-rules block, your project notes, or the conversation itself. The app cannot see or delete the vendor’s prompt; it can only keep secrets out of the layers it does own.'
