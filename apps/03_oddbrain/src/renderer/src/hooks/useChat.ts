import { branchChat } from '@shared/lib/chatContext'
import { useRef, useState } from 'react'
import type {
  Artifact,
  Attachment,
  BridgeRecord,
  Chat,
  Message,
  ModelCapabilities,
} from '@shared/types'
import { newId } from '@shared/lib/storage'
import { loadImage, persistAttachments, toOllamaMessages } from '@shared/lib/attachments'
import { splitThinking, streamChat, systemPrompt } from '@shared/lib/ollama'
import { extractArtifacts, extractStreamingArtifacts, wantsArtifact } from '@shared/lib/artifacts'
import {
  BRIDGE_MAX_CHARS,
  buildBridgeMessages,
  cleanDescription,
  needsBridge,
} from '@shared/lib/vision'
import { askLocal } from '@shared/lib/ask'
import { extractCitations } from '@shared/lib/citations'
import { wantsChart } from '@shared/lib/chart'
import { resolveInference, type InferenceSettings } from '@shared/lib/inference'
import { readStored } from '@shared/lib/storage'
import { parseCloudModel } from '@shared/lib/providers'
import { WORKING_NOTES_PROPOSAL_GUIDANCE } from '@shared/lib/workingNotesProposal'
import {
  modelContextKey,
  packModelContext,
  parseContextOverflow,
  resolveModelContext,
  trimOneContextGroup,
  type ModelContextOverrides,
  type ModelContextReceipt,
  type PackedContextMessage,
} from '@shared/lib/modelContext'

/**
 * Sending a message, and everything that happens after it.
 *
 * Lifted from the old app unchanged in behaviour, because the behaviour is the
 * part that was hard to get right on a 4 GB card:
 *
 *  - the composer clears as soon as the send is accepted, so typing never waits
 *    on the model;
 *  - the reply is streamed into the transcript as it is written, with the
 *    thinking separated out rather than shown as raw tags;
 *  - stopping keeps the partial text, because on a 3B model four seconds of
 *    generation is a usable draft, not a mistake;
 *  - an artifact is extracted from the finished text, and a partial one is
 *    marked as a draft rather than presented as done.
 */

export type ChatModels = {
  model: string
  capabilities: ModelCapabilities
  available: boolean
  error: string
}

export type ChatVision = { bridgeModel: string }

export type SendInput = {
  content: string
  attachments?: Attachment[]
  context?: string
  artifactMode?: boolean
  thinking?: boolean
  projectId?: string | null
}

export type UseChatOptions = {
  chats: Chat[]
  setChats: (update: Chat[] | ((previous: Chat[]) => Chat[])) => void
  currentChat: string
  navigate: (chatId: string) => void
  models: ChatModels
  vision: ChatVision
  notify: (message: string) => void
  inference?: InferenceSettings | string
  contextProfiles?: ModelContextOverrides
  setContextProfiles?: (value: ModelContextOverrides | ((previous: ModelContextOverrides) => ModelContextOverrides)) => void
  /** Where a finished conversation goes to be kept. Defaults to doing nothing,
   *  which is what happens until the vault service exists — see capture() below. */
  capture?: (chat: Chat) => Promise<void>
}

type RunArgs = {
  chat: Chat
  userMessage: Message
  assistant: Message
  requested: boolean
  wantsBridge: boolean
  thinking: boolean
  controller: AbortController
  history: Message[]
}

export default function useChat({
  chats,
  setChats,
  currentChat,
  navigate,
  models,
  vision,
  notify,
  inference,
  contextProfiles = {},
  setContextProfiles,
  capture: captureTo,
}: UseChatOptions) {
  const [busyChatId, setBusyChatId] = useState<string | null>(null)
  const [live, setLive] = useState<{ chatId: string; messageId: string; artifacts: Artifact[] }>({
    chatId: '',
    messageId: '',
    artifacts: [],
  })
  const jobRef = useRef<{ controller: AbortController; chatId: string } | null>(null)
  const chatsRef = useRef(chats)
  const captures = useRef(new Map<string, string>())
  chatsRef.current = chats

  const patch = (chatId: string, messageId: string, update: Partial<Message>): void =>
    setChats(previous =>
      previous.map(chat =>
        chat.id !== chatId
          ? chat
          : {
              ...chat,
              messages: chat.messages.map(message =>
                message.id === messageId ? { ...message, ...update } : message
              ),
            }
      )
    )

  const clearLive = (): void => setLive({ chatId: '', messageId: '', artifacts: [] })

  /** Keep the conversation. Silently does nothing when no vault is configured. */
  async function capture(chat: Chat): Promise<void> {
    if (!captureTo) return
    const token = newId()
    captures.current.set(chat.id, token)
    setChats(previous =>
      previous.map(item => (item.id === chat.id ? { ...item, vaultStatus: 'saving' } : item))
    )
    try {
      await captureTo(chat)
      if (captures.current.get(chat.id) === token) {
        setChats(previous =>
          previous.map(item => (item.id === chat.id ? { ...item, vaultStatus: 'saved' } : item))
        )
      }
    } catch (error) {
      // A vault that is not running is a state, not an emergency: one small
      // badge, no dialog, and the conversation itself is untouched.
      if (captures.current.get(chat.id) === token) {
        setChats(previous =>
          previous.map(item =>
            item.id === chat.id
              ? { ...item, vaultStatus: 'error', vaultError: (error as Error).message }
              : item
          )
        )
        // One line, no dialog, and the conversation itself is untouched. A
        // capture that failed without saying so would be the worst outcome: a
        // vault that looks like it is keeping things and is not.
        notify(`This conversation was not kept: ${(error as Error).message}`)
      }
    }
  }

  /**
   * The vision bridge: a text-only model cannot see a picture, so a verified
   * vision model describes it first and that description is what the answering
   * model receives. It runs before the request and is reported on the message,
   * so the transcript never pretends the answer came from what it saw.
   */
  async function describeImages({
    attachments,
    userText,
    signal,
    onStage,
  }: {
    attachments: Attachment[]
    userText: string
    signal: AbortSignal
    onStage?: (stage: string) => void
  }): Promise<BridgeRecord | null> {
    const bridge = vision.bridgeModel
    if (!bridge) return null
    onStage?.(`Looking at your image with ${bridge}…`)
    const images = await Promise.all(
      attachments.filter(file => file.kind === 'image').map(loadImage)
    )
    const { content } = await askLocal({
      model: bridge,
      messages: buildBridgeMessages({ images, userText, language: 'English' }),
      signal,
      budgetLabel: 'The image',
      timeoutMs: 180_000,
      inference,
      onChunk: piece =>
        onStage?.(`${bridge} is looking at your image… ${piece.content.length} characters read`),
    })
    const description = cleanDescription(content)
    if (!description) {
      throw new Error(
        `${bridge} returned no description, so the text model has nothing to work from. Nothing was sent.`
      )
    }
    return {
      model: bridge,
      description,
      chars: Math.min(description.length, BRIDGE_MAX_CHARS),
      truncated: cleanDescription(content).length < content.length,
    }
  }

  async function send({
    content,
    attachments = [],
    context = '',
    artifactMode = false,
    thinking = false,
    projectId = null,
  }: SendInput): Promise<boolean> {
    if ((!content.trim() && !attachments.length) || jobRef.current) return false
    if (!models.available) {
      notify(
        models.error ||
          `The selected model ${models.model} is not installed, or Ollama is not running. Open the model menu and refresh.`
      )
      return false
    }
    const existing = chatsRef.current.find(chat => chat.id === currentChat)
    const chatId = existing?.id || newId()
    const controller = new AbortController()
    jobRef.current = { controller, chatId }
    setBusyChatId(chatId)
    try {
      const requested = wantsArtifact(content, artifactMode)
      const wantsBridge = needsBridge(models.capabilities, attachments)
      if (wantsBridge && !vision.bridgeModel) {
        throw new Error(
          `Images need a model that can see. ${models.model} cannot, and no other installed model has reported "vision" through Ollama's own metadata — names are never trusted for this. Nothing is downloaded automatically: run "ollama pull qwen3-vl:4b" on this machine if you want a local vision model, then refresh the model list.`
        )
      }
      const userMessage: Message = {
        id: newId(),
        role: 'user',
        content: content.trim() || 'Please look at the attached file.',
        attachments,
        context,
        timestamp: new Date().toISOString(),
      }
      userMessage.attachments = await persistAttachments(attachments)
      const history = [...(existing?.messages || []), userMessage]
      const assistant: Message = {
        id: newId(),
        role: 'assistant',
        content: '',
        thinking: '',
        status: 'streaming',
        timestamp: new Date().toISOString(),
        model: models.model,
        ...(wantsBridge ? { stage: `Describing your image with ${vision.bridgeModel}…` } : {}),
      }
      const chat: Chat = {
        ...(existing || {
          id: chatId,
          title: userMessage.content.slice(0, 55),
          date: 'Today',
          projectId,
        }),
        messages: [...(existing?.messages || []), userMessage, assistant],
      }
      setChats(previous =>
        existing ? previous.map(item => (item.id === chatId ? chat : item)) : [chat, ...previous]
      )
      if (!existing) navigate(chatId)
      setLive({ chatId, messageId: assistant.id, artifacts: [] })
      // No capture here: the reply is still streaming, and a half-written turn is
      // not evidence. The conversation is kept when the turn ends — complete,
      // stopped or failed — a few lines below.
      void run({ chat, userMessage, assistant, requested, wantsBridge, thinking, controller, history })
      // Return once the send is accepted, so the composer clears immediately.
      return true
    } catch (error) {
      jobRef.current = null
      setBusyChatId(null)
      clearLive()
      notify((error as Error).message)
      return false // Keep the unsent draft and files, so nothing is lost by failing.
    }
  }

  async function run({
    chat,
    userMessage,
    assistant,
    requested,
    wantsBridge,
    thinking,
    controller,
    history,
  }: RunArgs): Promise<void> {
    let final: Message = { ...assistant }
    const searchHint = userMessage.content
    const started = Date.now()
    let lastSweep = 0

    // The live view is throttled: sweeping a whole growing document on every
    // token would cost more than the generation itself on a 4 GB machine.
    const sweep = (text: string, force = false): void => {
      if (!requested) return
      const now = Date.now()
      if (!force && now - lastSweep < 500) return
      lastSweep = now
      setLive({
        chatId: chat.id,
        messageId: assistant.id,
        artifacts: extractStreamingArtifacts(text, {
          requested,
          messageId: assistant.id,
          chatId: chat.id,
          title: searchHint,
        }),
      })
    }

    const timer = setTimeout(() => controller.abort('timeout'), 300_000)
    try {
      // 1 — the bridge, when the selected model cannot see the image itself.
      if (wantsBridge) {
        const bridge = await describeImages({
          attachments: userMessage.attachments || [],
          userText: userMessage.content,
          signal: controller.signal,
          onStage: stage => patch(chat.id, assistant.id, { stage }),
        })
        if (bridge) patch(chat.id, userMessage.id, { bridge })
        patch(chat.id, assistant.id, {
          stage: `${models.model} is answering from the description…`,
        })
      } else {
        patch(chat.id, assistant.id, { stage: '' })
      }

      // 2 — the answering model. Unknown models in Auto mode get no invented
      // small cap. Reported, observed or owner-set capacities retain the newest
      // complete turns; the receipt names every omitted message.
      const converted = await toOllamaMessages(history, models.capabilities)
      const eligible = history.filter(message => message.status !== 'error' && message.origin !== 'import')
      const selectedModel = assistant.model || models.model
      const cloud = parseCloudModel(selectedModel)
      const key = modelContextKey(cloud ? `cloud:${cloud.provider}` : 'ollama', selectedModel)
      const runtimeLimit = cloud ? null : resolveInference(inference).options.num_ctx ?? null
      const reportedLimit = [models.capabilities.contextWindowTokens, runtimeLimit]
        .filter((value): value is number => typeof value === 'number' && value > 0)
        .reduce<number | null>((smallest, value) => smallest === null ? value : Math.min(smallest, value), null)
      let profile = resolveModelContext({ key, label: selectedModel, reportedTokens: reportedLimit, override: contextProfiles[key] })
      const items: PackedContextMessage[] = [
        { id: 'system', required: true, message: { role: 'system', content: `${systemPrompt(requested, wantsChart(userMessage.content))}\n\nWorking Notes proposals:\n${WORKING_NOTES_PROPOSAL_GUIDANCE}` } },
        ...converted.map((message, index) => ({ id: eligible[index]?.id || `message-${index}`, required: index === converted.length - 1, message })),
      ]
      let packed = packModelContext(items, profile)
      let active = packed.messages
      let omitted = [...packed.omitted]
      let attempts = 0
      let overflowRetry = false
      let raw = ''
      let nativeThinking = ''
      for (;;) {
        attempts += 1
        try {
          await streamChat(
            {
              model: selectedModel,
              messages: active.map(item => item.message),
              ...(models.capabilities.thinking ? { think: Boolean(thinking) } : {}),
            },
            controller.signal,
            record => {
              raw += record.message?.content || ''
              nativeThinking += record.message?.thinking || ''
              const piece = splitThinking(raw, nativeThinking)
              final = { ...final, ...piece, stage: '' }
              patch(chat.id, assistant.id, final)
              sweep(piece.content)
            },
            inference,
            readStored<boolean>('oddbrain.keepLoadedAlways', false).value ? -1 : undefined,
            profile.mode === 'manual' && !cloud ? profile.capacityTokens ?? undefined : undefined
          )
          break
        } catch (error) {
          const overflow = parseContextOverflow(error)
          if (!overflow.overflow || profile.mode === 'manual' || raw || attempts >= 2) throw error
          overflowRetry = true
          patch(chat.id, assistant.id, { stage: 'The model rejected an oversized context. Retrying with lower-priority history removed…' })
          let next
          if (overflow.limitTokens) {
            setContextProfiles?.(previous => ({ ...previous, [key]: { ...(previous[key] || { mode: 'auto' }), mode: 'auto', observedTokens: overflow.limitTokens! } }))
            profile = resolveModelContext({ key, label: selectedModel, override: { ...(contextProfiles[key] || { mode: 'auto' }), mode: 'auto', observedTokens: overflow.limitTokens } })
            next = packModelContext(active, profile, 'provider-overflow')
          } else next = trimOneContextGroup(active)
          if (next.messages.length >= active.length) throw error
          active = next.messages
          omitted = [...omitted, ...next.omitted].filter((entry, index, all) => all.findIndex(other => other.id === entry.id) === index)
          packed = next
        }
      }
      const contextReceipt: ModelContextReceipt = {
        model: selectedModel,
        capacity: { source: profile.source, tokens: profile.capacityTokens, mode: profile.mode },
        estimate: { inputTokens: packed.estimatedInputTokens, exact: false, method: 'UTF-8 bytes divided by three, plus message and image allowances; provider tokenization may differ.' },
        includedMessages: active.length,
        omitted,
        attempts,
        overflowRetry,
        note: overflowRetry ? 'The provider rejected the larger request before generation. OddBrain reported it, removed lower-priority history, and retried without changing stored messages.' : omitted.length ? 'Lower-priority stored messages were not sent to stay within this model profile. Stored history was not changed.' : 'No stored conversation message was omitted by OddBrain.',
      }
      final.contextReceipt = contextReceipt
      final.status = 'complete'
      final.stage = ''
      final.artifacts = extractArtifacts(final.content, {
        requested,
        messageId: assistant.id,
        chatId: chat.id,
        title: userMessage.content,
      })
      final.citations = extractCitations(final.content)
      final.ms = Date.now() - started
    } catch (error) {
      if (controller.signal.aborted) {
        final.status = 'stopped'
        final.error =
          controller.signal.reason === 'timeout'
            ? 'Stopped after five minutes. The partial answer is kept.'
            : 'Stopped. The partial answer is kept.'
      } else {
        final.status = 'error'
        final.error = (error as Error).message
      }
      final.stage = ''
    } finally {
      clearTimeout(timer)
      // Stopping mid-build must not throw the work away: the partial document is
      // kept, marked as a draft, so it can be finished instead of started over.
      if (!final.artifacts && requested && final.content) {
        final.artifacts =
          final.status === 'complete'
            ? extractArtifacts(final.content, {
                requested,
                messageId: assistant.id,
                chatId: chat.id,
                title: userMessage.content,
              })
            : extractStreamingArtifacts(final.content, {
                requested,
                messageId: assistant.id,
                chatId: chat.id,
                title: userMessage.content,
              })
      }
      patch(chat.id, assistant.id, final)
      jobRef.current = null
      setBusyChatId(null)
      clearLive()
      const latest = chatsRef.current.find(item => item.id === chat.id) || chat
      void capture({
        ...latest,
        messages: chat.messages.map(message => (message.id === assistant.id ? final : message)),
      })
    }
  }

  /** Fork a conversation at a message: the branch keeps the history before it. */
  function branch(
    chatId: string,
    messageId: string,
    { includeMessage = true }: { includeMessage?: boolean } = {}
  ): string | null {
    const source = chatsRef.current.find(chat => chat.id === chatId)
    if (!source) return null
    let chat: Chat
    try { chat = branchChat(source, messageId, newId, includeMessage) }
    catch (error) { notify((error as Error).message); return null }
    setChats(previous => [
      { ...chat, branches: undefined },
      ...previous.map(item =>
        item.id === chatId ? { ...item, branches: (item.branches || 0) + 1 } : item
      ),
    ])
    return chat.id
  }

  /**
   * Re-run the reply that produced `assistantMessageId`, as if it had never been
   * generated. Everything after it is dropped: an answer made in a different
   * context is not a correction of this one, and keeping both is confusing.
   */
  async function regenerate(assistantMessageId: string): Promise<boolean> {
    if (jobRef.current) {
      notify('Wait for the current reply to finish.')
      return false
    }
    if (!models.available) {
      notify(models.error || 'Ollama is not running.')
      return false
    }
    const chat = chatsRef.current.find(entry => entry.id === currentChat)
    if (!chat) return false
    if (chat.messages.some(message => message.status === 'streaming')) { notify('Finish or stop the stored streaming reply before revising this chat.'); return false }
    const index = chat.messages.findIndex(message => message.id === assistantMessageId)
    if (index === -1) return false
    const before = chat.messages.slice(0, index)
    const userMessage = [...before].reverse().find(message => message.role === 'user')
    if (!userMessage) {
      notify('There is no question before this reply to run again.')
      return false
    }

    const original = branchChat(chat, chat.messages[chat.messages.length - 1].id, newId)
    original.title = `${chat.title} (before regeneration)`
    const controller = new AbortController()
    jobRef.current = { controller, chatId: chat.id }
    setBusyChatId(chat.id)
    const assistant: Message = {
      id: newId(),
      role: 'assistant',
      content: '',
      thinking: '',
      status: 'streaming',
      timestamp: new Date().toISOString(),
      model: models.model,
      regenerated: true,
    }
    const next: Chat = { ...chat, messages: [...before, assistant] }
    setChats(previous => [original, ...previous.map(item => (item.id === chat.id ? next : item))])
    setLive({ chatId: chat.id, messageId: assistant.id, artifacts: [] })
    void run({
      chat: next,
      userMessage,
      assistant,
      controller,
      requested: wantsArtifact(userMessage.content, false),
      wantsBridge: false,
      thinking: Boolean(assistant.thinking),
      history: [...before],
    })
    return true
  }

  /**
   * Replace a question and answer it again. Editing is how a conversation gets
   * corrected without losing the thread: the old wording goes, and the reply
   * above it is regenerated against the new one.
   */
  async function editAndResend(userMessageId: string, content: string): Promise<boolean> {
    const text = String(content || '').trim()
    if (!text) {
      notify('A message needs some text.')
      return false
    }
    if (jobRef.current) {
      notify('Wait for the current reply to finish.')
      return false
    }
    if (!models.available) {
      notify(models.error || 'Ollama is not running.')
      return false
    }
    const chat = chatsRef.current.find(entry => entry.id === currentChat)
    if (!chat) return false
    if (chat.messages.some(message => message.status === 'streaming')) { notify('Finish or stop the stored streaming reply before revising this chat.'); return false }
    const index = chat.messages.findIndex(message => message.id === userMessageId)
    if (index === -1) return false
    // Keep the edit where it was and drop the old answer, which no longer
    // corresponds to the question above it.
    const before = chat.messages.slice(0, index)
    const edited: Message = {
      ...chat.messages[index],
      content: text,
      editedAt: new Date().toISOString(),
    }
    const original = branchChat(chat, chat.messages[chat.messages.length - 1].id, newId)
    original.title = `${chat.title} (before edit)`
    const controller = new AbortController()
    jobRef.current = { controller, chatId: chat.id }
    setBusyChatId(chat.id)
    const assistant: Message = {
      id: newId(),
      role: 'assistant',
      content: '',
      thinking: '',
      status: 'streaming',
      timestamp: new Date().toISOString(),
      model: models.model,
      regenerated: true,
    }
    const next: Chat = { ...chat, messages: [...before, edited, assistant] }
    setChats(previous => [original, ...previous.map(item => (item.id === chat.id ? next : item))])
    setLive({ chatId: chat.id, messageId: assistant.id, artifacts: [] })
    void run({
      chat: next,
      userMessage: edited,
      assistant,
      controller,
      requested: wantsArtifact(text, false),
      wantsBridge: false,
      thinking: false,
      history: [...before, edited],
    })
    return true
  }

  return {
    send,
    busyChatId,
    live,
    branch,
    regenerate,
    editAndResend,
    stop: () => jobRef.current?.controller.abort(),
    retryCapture: (chat: Chat) => capture(chat),
  }
}
