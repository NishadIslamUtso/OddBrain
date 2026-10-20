import { bridge } from '../platform/bridge'
import type { NativeSessionLink } from '@shared/lib/nativeConversation'
import ChatOverridesEditor from './ChatOverridesEditor'
import type { ContextDefaults } from '@shared/lib/chatContext'
import { useState } from 'react'
import type { Chat } from '@shared/types'
import { chatNotesStore, emptyChatNotes, estimateChatContext, type ChatNotes, type NotesVersion } from '@shared/lib/chatContext'
import { workspaceKey } from '@shared/lib/sampleWorkspace'
import { newId } from '@shared/lib/storage'
import { downloadText } from '../lib/downloadText'

/** Mount keyed by chat.id. Pins/recaps are local notes, never implicit model context or confirmed memory. */
export default function ChatContextPanel({ chat, draft, branch, defaults }: { chat: Chat; draft: string; defaults?: ContextDefaults; branch?: (messageId: string) => void }) {
  const [sessions, setSessions] = useState<NativeSessionLink[]>([]), [sessionNotice, setSessionNotice] = useState('')
  const [version, setVersion] = useState<NotesVersion | null>(null), [loaded, setLoaded] = useState(false), [notice, setNotice] = useState('')
  const [recap, setRecap] = useState(''), [author, setAuthor] = useState<'user' | 'ai'>('user'), [selectedPoint, setPoint] = useState('')
  const point = selectedPoint || chat.messages.at(-1)?.id || ''
  const store = () => chatNotesStore(localStorage, workspaceKey('oddbrain.chat-notes.v1'), chat.id)
  const notes = version?.value || emptyChatNotes(), estimate = estimateChatContext(chat, draft)
  const read = () => { void bridge.engine.chatSessions(chat.id).then(setSessions).catch(() => setSessionNotice('Saved native links could not be read; none were changed.')); try { setVersion(store().read()); setLoaded(true); setNotice('') } catch (error) { setLoaded(false); setNotice((error as Error).message) } }
  const save = (next: ChatNotes) => { try { setVersion(store().save(next, version?.id ?? null, newId())); setNotice('Saved locally. Not sent to a model or confirmed memory.'); return true } catch (error) { setNotice((error as Error).message); return false } }
  return <details className="ob-control-scope" onToggle={event => { if (event.currentTarget.open && !loaded) read() }}>
    <summary>Conversation notes and context</summary>
    <p>{estimate.characters.toLocaleString()} stored text characters · rough {estimate.roughTokens.low.toLocaleString()}–{estimate.roughTokens.high.toLocaleString()} tokens. Window and cost unknown.</p>
    <p>{estimate.source} {estimate.exclusions}</p>
    <details><summary>Native sessions saved for this chat</summary><p>Sending with the matching engine and working folder requests that native session. Different chats never borrow these IDs. These links are observations from recorded native init events, not an import of earlier native history.</p>{sessions.map(link => <p key={`${link.engine}:${link.workspace}`}>{link.engine} · {link.workspace}<br /><code className="break-all">{link.sessionId}</code></p>)}{!sessions.length && <p>No native session link loaded for this chat.</p>}{sessionNotice && <p role="status">{sessionNotice}</p>}</details>
    {(() => { const record = [...chat.messages].reverse().find(m => m.nativeRecord?.chatId === chat.id)?.nativeRecord; return record?.context ? <details><summary>What the last recorded request included</summary><p>{record.engine} · {record.context.workspace}<br />{record.context.characters.toLocaleString()} characters in the exact text dispatch (images and original file bytes are separate) · {record.context.historyMessages} stored messages explicitly included.</p>{record.context.session ? <p><strong>Native session: {record.context.session.state}</strong> · {record.context.session.detail}</p> : <p>Older receipt: native session freshness was not recorded.</p>}{record.context.launch ? <details><summary>Native folder activation inventory</summary><p>{record.context.launch.files} configuration file(s): {record.context.launch.connectorFiles} connector, {record.context.launch.ruleFiles} rule/instruction, {record.context.launch.hookFiles} hook/config. Inventory {record.context.launch.complete ? 'completed within bounds' : 'was incomplete'}.</p><code className="break-all">{record.context.launch.digest}</code>{record.context.launch.warnings.map(item => <p key={item} role="note">{item}</p>)}</details> : null}<ul>{record.context.sources.map(source => <li key={source.id}><strong>{source.title}</strong>{source.role ? ` · ${source.role.replaceAll('-', ' ')}` : ' · legacy attribution'}: {source.chars.toLocaleString()} characters. {source.coverage}{source.hazards?.total ? <details><summary className="text-warn">Reveal {source.hazards.total} invisible-text warning(s)</summary><p>{source.hazards.notice}</p>{source.hazards.findings.map(finding => <div key={finding.kind}><p>{finding.label}: {finding.count}; {finding.codePoints.join(', ')} at UTF-16 positions {finding.positions.join(', ')}</p>{finding.excerpts.map((text, index) => <pre key={index} className="whitespace-pre-wrap break-words">{text}</pre>)}</div>)}</details> : null}<details><summary>Source fingerprint</summary><code className="break-all">{source.digest || 'Not recorded in this older receipt'}</code></details></li>)}</ul><p>This receipt separates owner requests and preferences, app-authored instructions, quoted references and carried conversation text. It describes this dispatch, not the whole native context window. Other project chats, pins and recaps were not automatically included. Removing a reference affects future sends, not text already in native history.</p></details> : null })()}
    <p>Pins and recaps stay in this chat’s local notes. They are not sent automatically. Originals are unchanged; every saved notes version is retained.</p>
    <button type="button" onClick={read}>Reload notes</button>
    <button type="button" onClick={() => { try { downloadText(JSON.stringify(store().versions(), null, 2), 'chat-note-revisions.json') } catch (error) { setNotice((error as Error).message) } }}>Export note revisions</button>
    <label>Branch point<select value={point} onChange={event => setPoint(event.target.value)}>{chat.messages.map((message, index) => <option key={message.id} value={message.id}>{index + 1} · {message.role} · {message.content.slice(0, 80)}</option>)}</select></label>
    <button type="button" disabled={!branch || !point || chat.messages.some(m => m.status === 'streaming')} onClick={() => branch?.(point)}>Ask a side question from here</button>
    {!branch && <p>Side-question navigation is unavailable here. It does not resume the original native session.</p>}
    <button type="button" disabled={!loaded || !point} onClick={() => save({ ...notes, pins: notes.pins.includes(point) ? notes.pins.filter(id => id !== point) : [...notes.pins, point] })}>{notes.pins.includes(point) ? 'Unpin message' : 'Pin message'}</button>
    {notes.pins.map(id => <details key={id}><summary>Pinned message</summary><pre className="whitespace-pre-wrap break-words">{chat.messages.find(message => message.id === id)?.content ?? 'Original message is not present in this chat.'}</pre></details>)}
    <label>Recap source<select value={author} onChange={event => setAuthor(event.target.value as 'user' | 'ai')}><option value="user">Written by me</option><option value="ai">AI-generated interpretation</option></select></label>
    <label>Recap text<textarea value={recap} onChange={event => setRecap(event.target.value)} /></label>
    <button type="button" disabled={!loaded || !recap.trim()} onClick={() => { if (save({ ...notes, recaps: [...notes.recaps, { id: newId(), text: recap, author, basedOn: chat.messages.map(message => message.id), at: new Date().toISOString() }] })) setRecap('') }}>Keep recap separately</button>
    {notes.recaps.map(item => <details key={item.id}><summary>{item.author === 'ai' ? 'AI interpretation — unverified' : 'Personal recap — not confirmed memory'} · {item.at}</summary><pre className="whitespace-pre-wrap break-words">{item.text}</pre></details>)}
    {loaded && defaults && <ChatOverridesEditor key={version?.id || "initial"} defaults={defaults} value={notes.overrides} save={overrides => save({ ...notes, overrides })} />}
    {notice && <p role="status">{notice}</p>}
  </details>
}
