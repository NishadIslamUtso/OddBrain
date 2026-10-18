import { useRef, useState } from 'react'
import { newId } from '../lib/storage.js'
import { loadImage, persistAttachments, toOllamaMessages } from '../lib/attachments.js'
import { splitThinking, streamChat, systemPrompt } from '../lib/ollama.js'
import { extractArtifacts, extractStreamingArtifacts, wantsArtifact } from '../lib/artifacts.js'
import { BRIDGE_MAX_CHARS, buildBridgeMessages, bridgeBlock, cleanDescription, needsBridge } from '../lib/vision.js'
import { askLocal } from '../lib/ask.js'
import { vaultPost } from '../lib/vault.js'
import { extractCitations } from '../lib/citations.js'
import { wantsChart } from '../lib/chart.js'

export default function useChat({ chats, setChats, currentChat, navigate, models, vision, notify, inference }) {
  const [busyChatId, setBusyChatId] = useState(null)
  const [live, setLive] = useState({ chatId: '', messageId: '', artifacts: [] })
  const jobRef = useRef(null)
  const chatsRef = useRef(chats)
  const captures = useRef(new Map())
  chatsRef.current = chats
  const patch = (chatId, messageId, update) => setChats(previous => previous.map(chat => chat.id !== chatId ? chat : {
    ...chat, messages: chat.messages.map(message => message.id === messageId ? { ...message, ...update } : message),
  }))
  const clearLive = () => setLive({ chatId: '', messageId: '', artifacts: [] })

  async function capture(chat) {
    const token = newId()
    captures.current.set(chat.id, token)
    setChats(previous => previous.map(item => item.id === chat.id ? { ...item, vaultStatus: 'saving' } : item))
    try {
      await vaultPost('/capture', {
        type: 'conversation', provider: 'AI ASSistant', conversation_id: chat.id,
        title: chat.title, captured_at: new Date().toISOString(), completeness: chat.messages.at(-1)?.status === 'complete' ? 'full' : 'partial',
        messages: await Promise.all(chat.messages.filter(message => message.content || message.attachments?.length).map(async message => ({
          id: message.id, role: message.role, text: message.content, timestamp: message.timestamp,
          status: message.status, thinking: message.thinking || '', context: message.context || '',
          ...(message.bridge ? { vision_bridge: { model: message.bridge.model, description: message.bridge.description } } : {}),
          attachments: await Promise.all((message.attachments || []).map(async file => file.kind === 'image' ? { ...file, data: await loadImage(file) } : file)),
        }))),
      })
      if (captures.current.get(chat.id) === token) setChats(previous => previous.map(item => item.id === chat.id ? { ...item, vaultStatus: 'saved' } : item))
    } catch (error) {
      if (captures.current.get(chat.id) === token) setChats(previous => previous.map(item => item.id === chat.id ? { ...item, vaultStatus: 'error', vaultError: error.message } : item))
    }
  }

  /**
   * Vision Bridge: a text-only model cannot see the picture, so a verified
   * vision model describes it first and that description is what the answering
   * model receives. Runs before the main request and is reported on the message.
   */
  async function describeImages({ attachments, userText, signal, onStage }) {
    const bridge = vision?.bridgeModel
    if (!bridge) return null
    onStage?.(`Looking at your image with ${bridge}…`)
    const images = await Promise.all(attachments.filter(file => file.kind === 'image').map(loadImage))
    const { content } = await askLocal({
      model: bridge, messages: buildBridgeMessages({ images, userText, language: 'English' }),
      signal, budgetLabel: 'The image', timeoutMs: 180_000, inference,
      onChunk: piece => onStage?.(`${bridge} is looking at your image… ${piece.content.length} characters read`),
    })
    const description = cleanDescription(content)
    if (!description) throw new Error(`${bridge} returned no description, so the text model has nothing to work from. Nothing was sent.`)
    return {
      model: bridge, description, chars: Math.min(description.length, BRIDGE_MAX_CHARS),
      truncated: cleanDescription(content).length < content.length,
      at: new Date().toISOString(),
    }
  }

  async function send({ content, attachments = [], context = '', artifactMode = false, thinking = false, projectId = null }) {
    if ((!content.trim() && !attachments.length) || jobRef.current) return false
    if (!models.available) { notify(models.error || `The selected model ${models.model} is not installed or Ollama is offline. Open the model selector and refresh.`); return false }
    const existing = chatsRef.current.find(chat => chat.id === currentChat)
    const chatId = existing?.id || newId()
    const controller = new AbortController()
    jobRef.current = { controller, chatId }
    setBusyChatId(chatId)
    try {
      const requested = wantsArtifact(content, artifactMode)
      const wantsBridge = needsBridge(models.capabilities, attachments)
      if (wantsBridge && !vision?.bridgeModel) {
        throw new Error(`Images need a model that can see. ${models.model} cannot, and no other installed model has reported "vision" through Ollama /api/show — names are never trusted for this. Nothing is downloaded automatically: run "ollama pull qwen3-vl:4b" on your machine if you want a local vision model, then refresh the model list.`)
      }
      const userMessage = { id: newId(), role: 'user', content: content.trim() || 'Please look at the attached file.', attachments, context, timestamp: new Date().toISOString() }
      userMessage.attachments = await persistAttachments(attachments)
      const history = [...(existing?.messages || []), userMessage]
      const assistant = {
        id: newId(), role: 'assistant', content: '', thinking: '', status: 'streaming', timestamp: new Date().toISOString(),
        model: models.model, ...(wantsBridge ? { stage: `Describing your image with ${vision.bridgeModel}…` } : {}),
      }
      const chat = { ...(existing || { id: chatId, title: userMessage.content.slice(0, 55), date: 'Today', projectId }), messages: [...(existing?.messages || []), userMessage, assistant] }
      setChats(previous => existing ? previous.map(item => item.id === chatId ? chat : item) : [chat, ...previous])
      if (!existing) navigate(chatId)
      setLive({ chatId, messageId: assistant.id, artifacts: [] })
      void capture(chat)
      void run({ chat, userMessage, assistant, requested, wantsBridge, thinking, controller, history })
      // Return once the send is accepted so the composer clears immediately.
      return true
    } catch (error) {
      jobRef.current = null; setBusyChatId(null); clearLive(); notify(error.message)
      return false // Keep the unsent draft and files available for correction.
    }
  }

  async function run({ chat, userMessage, assistant, requested, wantsBridge, thinking, controller, history }) {
    let final = { ...assistant }
    let searchHint = userMessage.content
    const started = Date.now()
    let lastSweep = 0
    // The live view is throttled: sweeping the whole growing document on every
    // token would cost more than the generation itself on a 4 GB machine.
    const sweep = (text, force = false) => {
      if (!requested) return
      const now = Date.now()
      if (!force && now - lastSweep < 500) return
      lastSweep = now
      setLive({ chatId: chat.id, messageId: assistant.id, artifacts: extractStreamingArtifacts(text, { requested, messageId: assistant.id, chatId: chat.id, title: searchHint }) })
    }
    const timer = setTimeout(() => controller.abort('timeout'), 300_000)
    try {
      // 1 — the bridge, when the selected model cannot see the image itself.
      if (wantsBridge) {
        const bridge = await describeImages({
          attachments: userMessage.attachments, userText: userMessage.content, signal: controller.signal,
          onStage: stage => patch(chat.id, assistant.id, { stage }),
        })
        patch(chat.id, userMessage.id, { bridge })
        patch(chat.id, assistant.id, { stage: `${models.model} is answering with the description…` })
      } else {
        patch(chat.id, assistant.id, { stage: '' })
      }
      // 2 — the answering model.
      const requestMessages = [
        { role: 'system', content: systemPrompt(requested, wantsChart(userMessage.content)) },
        ...await toOllamaMessages(history, models.capabilities),
      ]
      const size = requestMessages.reduce((total, message) => total + message.content.length, 0)
      if (size > 12_000) throw new Error('This chat and its files/context exceed the conservative 12,000-character budget for the 4,096-token local context. Start a new chat with a smaller capsule. The original transcript is kept.')
      let raw = '', nativeThinking = ''
      await streamChat({ model: assistant.model, messages: requestMessages,
        ...(models.capabilities.thinking ? { think: Boolean(thinking) } : {}) }, controller.signal, record => {
        raw += record.message?.content || ''
        nativeThinking += record.message?.thinking || ''
        const piece = splitThinking(raw, nativeThinking)
        final = { ...final, ...piece, stage: '' }
        patch(chat.id, assistant.id, final)
        sweep(piece.content)
      }, inference)
      final.status = 'complete'
      final.stage = ''
      final.artifacts = extractArtifacts(final.content, { requested, messageId: assistant.id, chatId: chat.id, title: userMessage.content })
      final.citations = extractCitations(final.content)
      final.ms = Date.now() - started
    } catch (error) {
      if (controller.signal.aborted) {
        final.status = 'stopped'
        final.error = controller.signal.reason === 'timeout' ? 'Stopped after five minutes. Partial text is kept.' : 'Response stopped. Partial text is kept.'
      } else { final.status = 'error'; final.error = error.message }
      final.stage = ''
    } finally {
      clearTimeout(timer)
      // Stopping mid-build must not throw the work away: on a 3B model a
      // four-second stop can be the difference between a usable draft and
      // starting over. The partial document is kept as a draft version.
      if (!final.artifacts && requested && final.content) {
        final.artifacts = final.status === 'complete'
          ? extractArtifacts(final.content, { requested, messageId: assistant.id, chatId: chat.id, title: userMessage.content })
          : extractStreamingArtifacts(final.content, { requested, messageId: assistant.id, chatId: chat.id, title: userMessage.content })
      }
      patch(chat.id, assistant.id, final)
      jobRef.current = null; setBusyChatId(null); clearLive()
      const latest = chatsRef.current.find(item => item.id === chat.id) || chat
      void capture({ ...latest, messages: chat.messages.map(message => message.id === assistant.id ? final : message) })
    }
  }

  /** Fork a conversation at a message: the branch keeps the history before it. */
  function branch(chatId, messageId, { includeMessage = true } = {}) {
    const source = chatsRef.current.find(chat => chat.id === chatId)
    if (!source) return null
    const index = source.messages.findIndex(message => message.id === messageId)
    if (index === -1) return null
    const kept = source.messages.slice(0, includeMessage ? index + 1 : index).map(message => ({
      ...message,
      // Status belongs to the old run; a branch is a clean transcript.
      status: message.status === 'error' ? undefined : message.status,
      error: undefined,
    }))
    const chat = {
      id: newId(), title: `${source.title.replace(/ \(branch(?: \d+)?\)$/, '')} (branch${source.branches ? ` ${source.branches + 1}` : ''})`,
      date: 'Today', projectId: source.projectId || null, messages: kept, branchedFrom: { chatId, messageId, at: new Date().toISOString() },
    }
    setChats(previous => [{ ...chat, branches: undefined }, ...previous.map(item => item.id === chatId ? { ...item, branches: (item.branches || 0) + 1 } : item)])
    return chat.id
  }

  /**
   * Re-run the reply that produced `assistantMessageId`, as if it had never
   * been generated. Everything after it is dropped, because a reply made in a
   * different context is not a correction of this one — it is a different
   * answer to the same question, and keeping both would be confusing.
   */
  async function regenerate(assistantMessageId) {
    if (jobRef.current) { notify('Wait for the current reply to finish.'); return false }
    if (!models.available) { notify(models.error || 'Ollama is offline.'); return false }
    const chat = chatsRef.current.find(entry => entry.id === currentChat)
    if (!chat) return false
    const index = chat.messages.findIndex(message => message.id === assistantMessageId)
    if (index === -1) return false
    const before = chat.messages.slice(0, index)
    const userMessage = [...before].reverse().find(message => message.role === 'user')
    if (!userMessage) { notify('There is no question before this reply to regenerate.'); return false }

    const controller = new AbortController()
    jobRef.current = { controller, chatId: chat.id }
    setBusyChatId(chat.id)
    const assistant = {
      id: newId(), role: 'assistant', content: '', thinking: '', status: 'streaming',
      timestamp: new Date().toISOString(), model: models.model, regenerated: true,
    }
    const next = { ...chat, messages: [...before, assistant] }
    setChats(previous => previous.map(item => item.id === chat.id ? next : item))
    setLive({ chatId: chat.id, messageId: assistant.id, artifacts: [] })
    void run({
      chat: next, userMessage, assistant, controller,
      requested: wantsArtifact(userMessage.content, false),
      wantsBridge: false, thinking: Boolean(assistant.thinking),
      history: [...before],
    })
    return true
  }

  /**
   * Replace a question and re-answer it. Editing is how a conversation gets
   * corrected without losing the thread — the old wording goes, and the reply
   * is regenerated against the new one.
   */
  async function editAndResend(userMessageId, content) {
    const text = String(content || '').trim()
    if (!text) { notify('A message needs some text.'); return false }
    if (jobRef.current) { notify('Wait for the current reply to finish.'); return false }
    if (!models.available) { notify(models.error || 'Ollama is offline.'); return false }
    const chat = chatsRef.current.find(entry => entry.id === currentChat)
    if (!chat) return false
    const index = chat.messages.findIndex(message => message.id === userMessageId)
    if (index === -1) return false
    // Keep the edit where it was and drop the old answer, which no longer
    // corresponds to the question above it.
    const before = chat.messages.slice(0, index)
    const edited = { ...chat.messages[index], content: text, editedAt: new Date().toISOString() }
    const controller = new AbortController()
    jobRef.current = { controller, chatId: chat.id }
    setBusyChatId(chat.id)
    const assistant = {
      id: newId(), role: 'assistant', content: '', thinking: '', status: 'streaming',
      timestamp: new Date().toISOString(), model: models.model, regenerated: true,
    }
    const next = { ...chat, messages: [...before, edited, assistant] }
    setChats(previous => previous.map(item => item.id === chat.id ? next : item))
    setLive({ chatId: chat.id, messageId: assistant.id, artifacts: [] })
    void run({
      chat: next, userMessage: edited, assistant, controller,
      requested: wantsArtifact(text, false),
      wantsBridge: false, thinking: false,
      history: [...before, edited],
    })
    return true
  }

  return {
    send, busyChatId, live, branch, regenerate, editAndResend,
    stop: () => jobRef.current?.controller.abort(),
    retryCapture: chat => capture(chat),
  }
}
