import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { filterPrompts, loadPrompts, placeholdersIn } from '../lib/prompts.js'
import { Plus, Mic, AudioLines, ChevronDown, ArrowUp, Square, Paperclip, Code2, Sparkles, Layers, X, FileText, Image } from 'lucide-react'
import ModelSelector from './ModelSelector.jsx'
import { MAX_ATTACHMENTS, readAttachment } from '../lib/attachments.js'
import { CAPSULE_DRAG_TYPE, parseCapsuleDrop } from '../lib/vault.js'
import useDismiss from '../hooks/useDismiss.js'
export default function Composer({ models, vision, chat, busyChatId, onSend, onStop, projects, projectId, setProjectId, onVault, onContextPreview, contextBundle, clearContext, onCook, notify, seed }) {
  const [input, setInput] = useState('')
  useEffect(() => { if (seed?.text) setInput(seed.text) }, [seed?.n])
  const [attachments, setAttachments] = useState([])
  const [artifactMode, setArtifactMode] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [addingFiles, setAddingFiles] = useState(false)
  const [plusOpen, setPlusOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  // The slash menu: "/" at the start of a word opens the prompt library.
  const [userPrompts, setUserPrompts] = useState(() => loadPrompts())
  const [slashIndex, setSlashIndex] = useState(0)
  const slash = useMemo(() => {
    const match = /(?:^|\s)\/([^\s/]*)$/.exec(input)
    return match ? { query: match[1], start: match.index + (match[0].startsWith('/') ? 0 : 1) } : null
  }, [input])
  const slashMatches = useMemo(
    () => (slash ? filterPrompts(userPrompts, slash.query) : []),
    [slash, userPrompts],
  )
  const slashOpen = Boolean(slash) && slashMatches.length > 0
  useEffect(() => { setSlashIndex(0) }, [slash?.query])
  const textarea = useRef(null)
  /** Replace the "/query" the person typed with the prompt they picked. */
  const applyPrompt = useCallback(prompt => {
    if (!slash) return
    const before = input.slice(0, slash.start)
    const body = prompt.body
    setInput(before + body)
    setSlashIndex(0)
    const blanks = placeholdersIn(body).length
    notify(blanks
      ? `Inserted "${prompt.name}". It has ${blanks} placeholder${blanks === 1 ? '' : 's'} in {{braces}} to fill in.`
      : `Inserted "${prompt.name}".`)
    requestAnimationFrame(() => {
      const node = textarea.current
      if (!node) return
      node.focus()
      // Park the cursor at the first placeholder so it can be typed over.
      const at = body.indexOf('{{')
      const position = before.length + (at === -1 ? body.length : at)
      node.setSelectionRange(position, position)
    })
  }, [slash, input, notify])
  const fileInput = useRef(null)
  const plusRef = useRef(null)
  const projectRef = useRef(null)
  useDismiss(plusRef, () => setPlusOpen(false), plusOpen)
  useDismiss(projectRef, () => setProjectOpen(false), projectOpen)
  useEffect(() => {
    textarea.current.style.height = 'auto'
    textarea.current.style.height = `${Math.min(200, Math.max(45, textarea.current.scrollHeight))}px`
  }, [input])
  useEffect(() => { if (!models.capabilities.thinking) setThinking(false) }, [models.capabilities.thinking])
  async function addFiles(files) {
    if (addingFiles || busyChatId) return
    if (files.length + attachments.length > MAX_ATTACHMENTS) { notify(`Attach at most ${MAX_ATTACHMENTS} files per message.`); return }
    setAddingFiles(true)
    try {
      const loaded = []
      for (const file of files) loaded.push(await readAttachment(file, models.capabilities, { bridge: vision?.bridgeModel }))
      setAttachments(previous => [...previous, ...loaded])
      // Never let the hop happen silently the first time it is used.
      const bridged = loaded.filter(file => file.kind === 'image' && file.seenBy !== 'direct')
      if (bridged.length) notify(`${bridged.length} image${bridged.length === 1 ? '' : 's'} will be described locally by ${vision.bridgeModel} before ${models.model} answers, because ${models.model} cannot see images.`)
    } catch (error) { notify(error.message) }
    finally { setAddingFiles(false); if (fileInput.current) fileInput.current.value = '' }
  }
  async function send() {
    if (busyChatId || addingFiles) return
    const accepted = await onSend({ content: input, attachments, context: contextBundle?.content || '', artifactMode, thinking, projectId: chat?.projectId || projectId })
    if (accepted) { setInput(''); setAttachments([]); setArtifactMode(false); clearContext(); textarea.current?.focus() }
  }
  async function drop(event) {
    setDragOver(false)
    if (event.dataTransfer.types.includes(CAPSULE_DRAG_TYPE)) {
      event.preventDefault()
      try { const capsule = parseCapsuleDrop(event.dataTransfer); if (capsule) onContextPreview(capsule) } catch (error) { notify(error.message) }
    } else if (event.dataTransfer.files.length) { event.preventDefault(); await addFiles([...event.dataTransfer.files]) }
  }
  const hasContent = input.trim() || attachments.length
  const activeProject = projects.find(project => project.id === (chat?.projectId || projectId))
  return <div className="composer-wrap">
    <div className={`composer ${dragOver ? 'drag-over' : ''}`} onDragOver={event => { if (event.dataTransfer.types.includes('Files') || event.dataTransfer.types.includes(CAPSULE_DRAG_TYPE)) { event.preventDefault(); setDragOver(true) } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragOver(false) }} onDrop={drop}>
      {(attachments.length > 0 || contextBundle || artifactMode) && <div className="attachment-chips">
        {attachments.map(file => <div key={file.id} className="attachment-chip">{file.kind === 'image' ? <Image size={14} /> : <FileText size={14} />}<span>{file.name}{file.kind === 'image' && file.seenBy && file.seenBy !== 'direct' ? ` · ${file.seenBy} looks` : ''}</span><button aria-label={`Remove attachment ${file.name}`} onClick={() => setAttachments(previous => previous.filter(item => item.id !== file.id))}><X size={12} /></button></div>)}
        {contextBundle && <div className="attachment-chip context-chip"><Layers size={14} /><button onClick={() => onContextPreview(contextBundle)}>Context: {contextBundle.title}</button><button aria-label="Remove context" onClick={clearContext}><X size={12} /></button></div>}
        {artifactMode && <div className="attachment-chip"><Code2 size={14} />HTML artifact<button aria-label="Cancel artifact mode" onClick={() => setArtifactMode(false)}><X size={12} /></button></div>}
      </div>}
      {slashOpen && slashIndex >= 0 && <div className="slash-menu" role="listbox" aria-label="Prompts">
        <p className="slash-menu-head">Prompts</p>
        {slashMatches.map((prompt, index) => <button key={prompt.id} role="option" aria-selected={index === slashIndex}
          className={index === slashIndex ? 'slash-item selected' : 'slash-item'}
          onMouseEnter={() => setSlashIndex(index)}
          onMouseDown={event => { event.preventDefault(); applyPrompt(prompt) }}>
          <span className="slash-name">/{prompt.name}</span>
          <span className="slash-hint">{prompt.hint}</span>
        </button>)}
        <p className="slash-menu-foot">↑↓ to choose · Tab or Enter to insert · Esc to dismiss</p>
      </div>}
      <textarea ref={textarea} aria-label="Message" placeholder={chat?.messages?.length ? 'Reply…' : 'How can I help you today?'} value={input} onChange={event => setInput(event.target.value)} rows={2} onKeyDown={event => {
        if (slashOpen) {
          if (event.key === 'ArrowDown') { event.preventDefault(); setSlashIndex((slashIndex + 1) % slashMatches.length); return }
          if (event.key === 'ArrowUp') { event.preventDefault(); setSlashIndex((slashIndex - 1 + slashMatches.length) % slashMatches.length); return }
          if (event.key === 'Escape') { event.preventDefault(); setSlashIndex(-1); return }
          if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
            event.preventDefault()
            if (slashIndex >= 0) applyPrompt(slashMatches[slashIndex])
            return
          }
        }
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send() }
      }} />
      <div className="composer-controls"><div ref={plusRef} className="composer-plus">
        <button className="icon-button" aria-label="Add attachments or tools" aria-expanded={plusOpen} onClick={() => setPlusOpen(!plusOpen)} disabled={Boolean(busyChatId) || addingFiles}><Plus size={21} /></button>
        {plusOpen && <div className="popup plus-menu" role="menu" aria-label="Composer tools">
          <button role="menuitem" onClick={() => { setPlusOpen(false); fileInput.current.click() }}><Paperclip size={15} /><span>Add files or images</span></button>
          <button role="menuitem" onClick={() => { setPlusOpen(false); onVault() }}><Layers size={15} /><span>Use a capsule</span></button>
          <button role="menuitem" onClick={() => { setPlusOpen(false); setArtifactMode(!artifactMode) }}><Code2 size={15} /><span>{artifactMode ? 'Cancel artifact' : 'Create HTML artifact'}</span></button>
          <button role="menuitem" disabled={!input.trim()} onClick={() => { setPlusOpen(false); onCook(input) }}><Sparkles size={15} /><span>Cook This Prompt</span></button>
          <p>Text/code ≤ 12,000 characters per file.<br />Images ≤ 2 MB{vision?.bridgeModel && !models.capabilities.vision ? <> — described by <strong>{vision.bridgeModel}</strong>, then answered by {models.model}</> : ' with verified vision'}.<br />PDF/Word parsing is not available.</p>
        </div>}
      </div><div className="composer-right-controls">
        {addingFiles && <small>Reading files…</small>}
        {busyChatId && busyChatId === chat?.id ? <button className="send-button" onClick={onStop} aria-label="Stop response"><Square size={13} fill="currentColor" /></button> : hasContent ? <button className="send-button" onClick={send} disabled={Boolean(busyChatId) || addingFiles} title={busyChatId ? 'A response is running in another chat' : 'Send message'} aria-label="Send message"><ArrowUp size={18} /></button> : <><button className="icon-button voice-control" disabled aria-label="Microphone unavailable" title="Voice input is not connected"><Mic size={18} /></button><button className="icon-button voice-control" disabled aria-label="Voice mode unavailable" title="Voice mode is not connected"><AudioLines size={19} /><ChevronDown size={10} /></button></>}
      </div></div>
      <input ref={fileInput} type="file" multiple hidden accept="text/*,.txt,.md,.csv,.json,.js,.jsx,.ts,.tsx,.html,.css,.py,.xml,.yaml,.yml,.log,.sql,.bat,.c,.cpp,.h,.java,.rs,image/png,image/jpeg,image/webp" onChange={event => addFiles([...event.target.files])} />
    </div>
    <div className="composer-meta"><div className="project-selector" ref={projectRef}><button aria-label="Choose project" aria-expanded={projectOpen} onClick={() => setProjectOpen(!projectOpen)}>{activeProject?.name || 'Project'}<ChevronDown size={12} /></button>
      {projectOpen && <div className="popup project-menu" role="menu" aria-label="Choose project"><button role="menuitem" onClick={() => { setProjectId(null); setProjectOpen(false) }}>No project</button>{projects.map(project => <button role="menuitem" key={project.id} onClick={() => { setProjectId(project.id); setProjectOpen(false) }}>{project.name}</button>)}{!projects.length && <p>Create a project from Projects in the sidebar.</p>}</div>}
    </div><div className="model-controls"><ModelSelector models={models} disabled={Boolean(busyChatId)} /><button className="effort-control" disabled={!models.capabilities.thinking || Boolean(busyChatId)} aria-label="Toggle model thinking" aria-pressed={thinking} title={models.capabilities.thinking ? 'Enable or disable this model’s local thinking output' : 'This model has no verified thinking control'} onClick={() => setThinking(!thinking)}>{thinking ? 'Thinking' : 'Medium'}</button><button title="Vault context is manual and previewed before sending" aria-label="Manual vault context" onClick={onVault}>Manual</button></div></div>
  </div>
}
