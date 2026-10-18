/**
 * The domain types, in one place.
 *
 * These are the shapes that cross every boundary in the app: a message the model
 * produced, an artifact the user kept, a chat in the sidebar, the profile in
 * Settings. The main process, the renderer and the tests all import from here,
 * so there is exactly one definition of what a Message is and no place for two
 * of them to drift apart.
 */

export type Role = 'user' | 'assistant'

/** HTML or SVG. Nothing else is renderable in a sandboxed preview. */
export type ArtifactType = 'html' | 'svg'

export type ArtifactVersion = {
  content: string
  /** ISO timestamp of when this version was written. */
  savedAt?: string
  /** True while the model is still writing this version. */
  draft?: boolean
  note?: string
}

export type Artifact = {
  id: string
  title: string
  type: ArtifactType
  chatId?: string
  messageId?: string
  createdAt?: string
  updatedAt?: string
  /** True while the closing fence has not arrived yet. Never saved to history. */
  partial?: boolean
  versions: ArtifactVersion[]
}

export type AttachmentKind = 'image' | 'text'

export type Attachment = {
  id: string
  name: string
  size?: number
  /** MIME type as the browser reported it. */
  mime?: string
  kind?: AttachmentKind
  /** Base64 image bytes, with no `data:` prefix. Images only, and not kept in
   *  the transcript — it lives in IndexedDB and is loaded when it is needed. */
  data?: string
  /** What will actually read this picture: 'direct', or the bridge model's name. */
  seenBy?: string
  /** Plain text of a text/code attachment, already read. */
  text?: string
  /** How it was read and what was left out — shown with the attachment. */
  note?: string
}

/** An attachment as it is kept in a message: the bytes are stored separately. */
export type StoredAttachment = Omit<Attachment, 'data'>

/** The bridge's description of an image, kept so follow-up turns still work. */
export type BridgeRecord = {
  description: string
  model: string
  /** How much of the description the answering model was given, in characters. */
  chars?: number
  truncated?: boolean
}

/** A citation is a link the model actually wrote, never one the app found. */
export type Citation = { id: string; url: string; label: string }

export type MessageStatus = 'streaming' | 'complete' | 'stopped' | 'error'

export type Message = {
  id: string
  role: Role
  content: string
  model?: string
  /** Reasoning text, when the model reports one separately. */
  thinking?: string
  artifacts?: Artifact[]
  attachments?: Attachment[]
  /** Vault excerpts attached to this turn, given to the model as source data. */
  context?: string
  /** Set when the reply came from the vision bridge rather than the model itself. */
  bridge?: BridgeRecord
  /** Turns marked 'error' are never sent back to the model. */
  status?: MessageStatus
  /** What the app is doing right now, shown in place of a silent pause. */
  stage?: string
  /** Imported turns are shown but not sent. */
  origin?: 'chat' | 'import'
  /** ISO timestamp. `at` is the older field name, still read for old history. */
  timestamp?: string
  at?: string
  /** Set when the user edited a question and it was answered again. */
  editedAt?: string
  /** True when this reply replaced an earlier one for the same question. */
  regenerated?: boolean
  citations?: Citation[]
  /** How long the reply took, in milliseconds. */
  ms?: number
  /** An error string when the turn failed. Never a silent empty reply. */
  error?: string
}

export type Chat = {
  id: string
  title: string
  /** Group heading in the sidebar: 'Today', 'Oct 8', 'Older'. */
  date?: string
  pinned?: boolean
  /** null means "no project", which is different from "not loaded yet". */
  projectId?: string | null
  /** The chat this one was branched from, if any. */
  branchOf?: string
  /** Epoch milliseconds, used for ordering search results. */
  updatedAt?: number
  messages: Message[]
  /** Where this chat stands with the vault. 'error' is shown as a small badge,
   *  never as a dialog, and never blocks the conversation. */
  vaultStatus?: 'saving' | 'saved' | 'error'
  vaultError?: string
  /** How many branches have been taken from this chat. */
  branches?: number
  /** Set on a branch, pointing back at what it came from. */
  branchedFrom?: { chatId: string; messageId: string; at: string }
}

export type Profile = {
  name: string
  email: string
  tagline: string
  avatar: string
}

export type ThemeChoice = 'dark' | 'light' | 'system'
export type TranscriptSize = 'Small' | 'Medium' | 'Large'
export type TranscriptWidth = 'Narrow' | 'Medium' | 'Wide'
export type MotionChoice = 'System' | 'Reduced'

export type Settings = {
  theme: ThemeChoice
  chatFont: string
  transcriptSize: TranscriptSize
  transcriptWidth: TranscriptWidth
  motion: MotionChoice
  voiceLanguage: string
  voiceStyle: string
  voiceSpeed: string
}

/** Ollama's per-request options, clamped by inference.ts before they are sent. */
export type InferenceOptions = {
  num_ctx?: number
  num_batch?: number
  num_predict?: number
  num_gpu?: number
}

export type InferenceProfile = {
  id: string
  label: string
  options: InferenceOptions
  keepAlive: string
}

export type InferenceState = {
  profile: string
  options: InferenceOptions
  keepAlive: string
  /** Only present while the profile is 'custom'. */
  customOptions?: Record<string, string | number>
}

/** What Ollama reports about an installed model. */
export type ModelInfo = {
  name: string
  size?: number
  details?: { parameter_size?: string; quantization_level?: string; family?: string }
  capabilities?: string[]
}

/**
 * What Ollama's /api/show reports. `verified` is false when the model has no
 * capability list at all — in that case vision and thinking are assumed absent,
 * because a name is never treated as proof of what a model can do.
 */
export type ModelCapabilities = {
  verified: boolean
  vision: boolean
  thinking: boolean
}

/** One turn as the model API expects it. */
export type OllamaMessage = { role: string; content: string; images?: string[] }

/** One record from the streaming path (Ollama locally, translated providers in the cloud). */
export type OllamaRecord = {
  message?: { content?: string; thinking?: string }
  done?: boolean
  error?: string
  /** Present when a provider reports token counts. Ollama's local API does not. */
  usage?: { input_tokens?: number; output_tokens?: number }
}

export type ChartSpec = {
  type: 'bar' | 'line' | 'pie'
  title?: string
  labels: string[]
  values: number[]
  unit?: string
}

export type SearchHit = {
  chat: Chat
  message: Message
  /** The message text with the match in context. */
  snippet: string
  score: number
}

export type Capsule = {
  id?: string
  title: string
  content: string
  goals?: string[]
  constraints?: string[]
  background?: string
  decisions?: string[]
}

export type PromptTemplate = {
  id: string
  name: string
  hint: string
  body: string
  builtin?: boolean
}

export type Skill = {
  id: string
  name: string
  hint: string
  system: string
  builtin?: boolean
}

/** A bundled visual language: the label shown in the picker, plus two colours
 *  used for its swatch in the list. The full token set loads separately. */
export type DesignSystem = {
  id: string
  label: string
  accent: string
  bg: string
}

export type ZipEntry = { name: string; content: string | Uint8Array }
