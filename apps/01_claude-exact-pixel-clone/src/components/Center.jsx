import { useEffect, useMemo, useRef, useState } from 'react'
import ChartBlock from './ChartBlock.jsx'
import { extractChartBlocks, extractSvgBlock } from '../lib/inlineBlocks.js'
import { Code2, FileText, Image, RefreshCw, GitBranch, Copy, Loader2, Eye, Pencil } from 'lucide-react'
import BrainMark from './BrainMark.jsx'
import { firstName } from '../lib/profile.js'
import Composer from './Composer.jsx'
import Markdown from './Markdown.jsx'
import ThinkingDisplay from './ThinkingDisplay.jsx'
export function getGreeting(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Dhaka', hour: 'numeric', hourCycle: 'h23' }).format(date))
  return hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'
}
function LiveArtifactCard({ artifact, onArtifact }) {
  return <button className="artifact-message-card live" onClick={() => onArtifact(artifact.id)}>
    <Loader2 size={19} className="spin" />
    <span><strong>{artifact.title}</strong><small>{artifact.partial ? 'Building — open the live preview' : 'HTML Application · open preview'}</small></span>
    <Eye size={14} />
  </button>
}
export default function Center({ seed, chat, onArtifact, onRetryCapture, settings, notify, onExternalLink, onBranch, liveArtifacts = [], branchFamily = [], onNavigateBranch, profile, onRegenerate, onEditResend, busyChatId, ...composerProps }) {
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const transcript = useRef(null)
  const messages = chat?.messages || []
  useEffect(() => {
    const element = transcript.current
    if (element && element.scrollHeight - element.scrollTop - element.clientHeight < 260) element.scrollTo({ top: element.scrollHeight, behavior: settings.motion === 'Reduced' ? 'instant' : 'smooth' })
  }, [messages, settings.motion, liveArtifacts])
  const hasMessages = messages.length > 0
  const liveFor = messageId => liveArtifacts.filter(artifact => artifact.messageId === messageId)
  async function copyMessage(message) {
    try { await navigator.clipboard.writeText(message.content); notify('Message copied.') } catch { notify('Clipboard permission is unavailable. Select the text and copy it instead.') }
  }
  return <main className={`center ${hasMessages ? 'has-messages' : 'home'}`} data-model-ready={composerProps.models.available}>
    {!hasMessages && <div className="free-plan"><span>Free plan</span><span>·</span><button onClick={() => notify('This is a free local Ollama app. Hosted plans and billing are not connected.')}>Upgrade</button></div>}
    {hasMessages ? <>
      <header className="chat-header"><h1>{chat.title}</h1><small>{chat.branchedFrom ? 'Branch · ' : 'Local · '}{composerProps.models.model}{composerProps.models.capabilities.vision ? ' · vision' : ''}</small>
        {branchFamily.length > 1 && <label className="branch-picker" title="Jump between branches of this conversation">
          <GitBranch size={12} />
          <select value={chat.id} onChange={event => event.target.value !== chat.id && onNavigateBranch?.(event.target.value)}>
            {branchFamily.map(branch => <option key={branch.id} value={branch.id}>{branch.isRoot ? `${branch.title} (original)` : branch.title} · {branch.messages} msg</option>)}
          </select>
        </label>}
      </header>
      <div className="transcript-scroll" ref={transcript}><div className="transcript" key={chat.id}>
        {messages.map(message => <article key={message.id} className={`message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`} aria-label={message.role === 'user' ? 'Your message' : 'Assistant response'}>
          {message.role === 'assistant' && <BrainMark size={23} />}
          <div className="message-body"><ThinkingDisplay thinking={message.thinking} streaming={message.status === 'streaming'} />
            {message.stage && <p className="message-stage"><Loader2 size={12} className="spin" />{message.stage}</p>}
            {message.role === 'user' ? (editingId === message.id
              ? <form className="message-edit" onSubmit={event => { event.preventDefault(); const value = editText.trim(); if (!value) return; setEditingId(null); onEditResend?.(message.id, value) }}>
                  <textarea aria-label="Edit your message" value={editText} rows={3} autoFocus onChange={event => setEditText(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setEditingId(null) }} />
                  <footer><button type="button" className="secondary-button" onClick={() => setEditingId(null)}>Cancel</button><button className="white-button" disabled={!editText.trim()}>Send</button></footer>
                  <small>Editing replaces this question and re-answers it. The old reply is dropped.</small>
                </form>
              : <div className="user-text">{message.content}{message.editedAt && <span className="edited-flag" title={`Edited ${new Date(message.editedAt).toLocaleString()}`}>edited</span>}</div>
            ) : <Markdown onExternalLink={onExternalLink}>{message.content}</Markdown>}
            {message.role === 'assistant' && <InlineSvg text={message.content} />}
            {message.role === 'assistant' && <ChartBlocks text={message.content} />}
            {message.role === 'assistant' && message.status !== 'streaming' && message.content && <div className="message-actions">
              <button onClick={() => copyMessage(message)} title="Copy this response"><Copy size={12} />Copy</button>
              <button onClick={() => onBranch?.(message.id)} title="Start a new chat from this point; the original stays as it is"><GitBranch size={12} />Branch from here</button>
              <button onClick={() => onRegenerate?.(message.id)} disabled={busyChatId === chat.id} title="Ask again and replace this reply"><RefreshCw size={12} />Regenerate</button>
            </div>}
            {message.role === 'user' && !message.status && editingId !== message.id && <div className="message-actions user-actions"><button onClick={() => { setEditingId(message.id); setEditText(message.content) }} title="Edit this question and get a new answer"><Pencil size={12} />Edit</button></div>}
            {message.bridge && <details className="sent-context vision-bridge"><summary>Image described by {message.bridge.model} for {message.model}</summary><p>{message.bridge.description}</p><small>{message.model} never received the picture itself, only this description.</small></details>}
            {message.attachments?.length > 0 && <div className="sent-attachments">{message.attachments.map(file => <span key={file.id}>{file.kind === 'image' ? <Image size={13} /> : <FileText size={13} />}{file.name}{file.seenBy === 'direct' ? '' : file.kind === 'image' && file.seenBy ? ` · via ${file.seenBy}` : ''}</span>)}</div>}
            {message.context && <details className="sent-context"><summary>Included vault context</summary><pre>{message.context}</pre></details>}
            {message.status === 'streaming' && !message.content && !message.thinking && !message.stage && <p className="generating">Responding locally…</p>}
            {message.error && <p className={message.status === 'error' ? 'error-text response-error' : 'muted'} role={message.status === 'error' ? 'alert' : undefined}>{message.error}</p>}
            {liveFor(message.id).map(artifact => <LiveArtifactCard key={artifact.id} artifact={artifact} onArtifact={onArtifact} />)}
            {message.artifacts?.map(artifact => <button key={artifact.id} className="artifact-message-card" onClick={() => onArtifact(artifact.id)}><Code2 size={20} /><span><strong>{artifact.title}</strong><small>{artifact.type === 'html' ? 'HTML Application' : 'SVG Image'} · {artifact.versions.length} version{artifact.versions.length === 1 ? '' : 's'}</small></span></button>)}
            {message.citations?.length > 0 && <ul className="citations">{message.citations.map(source => <li key={source.id}><button onClick={() => onExternalLink?.(source.url)}>{source.label || source.url}</button></li>)}</ul>}
          </div>
        </article>)}
      </div></div>
      <div className="reply-composer"><Composer chat={chat} notify={notify} seed={seed} {...composerProps} />
        <div className="chat-save-status">{chat.vaultStatus === 'saved' ? 'Saved in local chat history and AI-Brain' : chat.vaultStatus === 'saving' ? 'Saving to AI-Brain…' : chat.vaultStatus === 'error' ? <><span title={chat.vaultError}>Local chat kept · vault capture failed</span><button onClick={() => onRetryCapture(chat)}><RefreshCw size={11} />Retry</button></> : 'Local chat history · check important answers'}</div>
      </div>
    </> : <div className="home-content"><div className="greeting"><BrainMark size={28} /><h1>{getGreeting()}, {firstName(profile)}</h1></div><Composer chat={chat} notify={notify} seed={seed} {...composerProps} /></div>}
  </main>
}

/** Fenced ```svg blocks render directly in the transcript. */
function InlineSvg({ text }) {
  const svg = useMemo(() => extractSvgBlock(text), [text])
  if (!svg) return null
  return <figure className="inline-svg"><img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt="Generated graphic" /></figure>
}

/** Fenced ```chart blocks render as validated pure-SVG charts. Invalid stays code. */
function ChartBlocks({ text }) {
  const blocks = useMemo(() => extractChartBlocks(text), [text])
  if (!blocks.length) return null
  return <>{blocks.map((source, index) => <ChartBlock key={index} source={source} />)}</>
}
