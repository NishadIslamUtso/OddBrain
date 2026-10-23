import { bridge } from '../platform/bridge'
import type { NativeSessionLink } from '@shared/lib/nativeConversation'
import ChatOverridesEditor from './ChatOverridesEditor'
import type { ContextDefaults } from '@shared/lib/chatContext'
import { useEffect, useState } from 'react'
import type { Chat } from '@shared/types'
import { chatNotesStore, emptyChatNotes, emptyWorkingNotes, estimateChatContext, type ChatNotes, type NotesVersion, type WorkingNotes } from '@shared/lib/chatContext'
import type { WorkingNotesRevision } from '@shared/lib/workingNotesStore'
import { workspaceKey } from '@shared/lib/sampleWorkspace'
import { newId } from '@shared/lib/storage'
import { downloadText } from '../lib/downloadText'
import { mergeWorkingNotesProposal, parseWorkingNotesProposal, type WorkingNotesProposal } from '@shared/lib/workingNotesProposal'
import { parseVaultSearchProposal, vaultFollowupDraft } from '@shared/lib/retrievalProposal'

/** Mount keyed by chat.id. Pins/recaps are local notes, never implicit model context or confirmed memory. */
export default function ChatContextPanel({ chat, draft, branch, defaults }: { chat: Chat; draft: string; defaults?: ContextDefaults; branch?: (messageId: string) => void }) {
  const [sessions, setSessions] = useState<NativeSessionLink[]>([]), [sessionNotice, setSessionNotice] = useState('')
  const [version, setVersion] = useState<NotesVersion | null>(null), [loaded, setLoaded] = useState(false), [notice, setNotice] = useState('')
  const [workingDraft, setWorkingDraft] = useState<WorkingNotes>(emptyWorkingNotes())
  const [workingRevision, setWorkingRevision] = useState<string | null>(null), [workingHistory, setWorkingHistory] = useState<WorkingNotesRevision[]>([])
  const [workingAuthor, setWorkingAuthor] = useState<'user' | 'ai'>('user'), [pendingProposal, setPendingProposal] = useState<WorkingNotes | null>(null)
  const [recap, setRecap] = useState(''), [author, setAuthor] = useState<'user' | 'ai'>('user'), [selectedPoint, setPoint] = useState('')
  const point = selectedPoint || chat.messages.at(-1)?.id || ''
  const store = () => chatNotesStore(localStorage, workspaceKey('oddbrain.chat-notes.v1'), chat.id)
  const notes = version?.value || emptyChatNotes(), estimate = estimateChatContext(chat, draft)
  const applyWorkingRead = (answer: Awaited<ReturnType<typeof bridge.workingNotes.read>>): void => {
    if (!answer.ok) { setNotice(answer.answer); return }
    setWorkingRevision(answer.current?.id || null); setWorkingHistory(answer.revisions)
    const current = answer.current?.notes || emptyWorkingNotes()
    setWorkingDraft(current); setWorkingAuthor(current.author); setPendingProposal(null)
    setNotice(answer.recovered ? 'Working Notes recovered from complete main-process revisions.' : answer.answer)
  }
  const read = async (): Promise<void> => {
    void bridge.engine.chatSessions(chat.id).then(setSessions).catch(() => setSessionNotice('Saved native links could not be read; none were changed.'))
    try {
      const saved = store().read(); setVersion(saved)
      let main = await bridge.workingNotes.read(chat.id)
      if (main.ok && !main.current && saved) {
        const legacy = store().versions().map(item => item.value.working).filter(item => item.updatedAt || item.objective || item.plan.length || item.decisions.length || item.constraints.length || item.openQuestions.length || item.uncertainties.length || item.findings.length || item.nextActions.length)
        if (legacy.length) main = await bridge.workingNotes.migrate({ chatId: chat.id, notes: legacy })
      }
      applyWorkingRead(main)
      if (!main.ok) { const fallback = saved?.value.working || emptyWorkingNotes(); setWorkingDraft(fallback); setWorkingAuthor(fallback.author) }
      setLoaded(true)
    } catch (error) { setLoaded(false); setNotice((error as Error).message) }
  }
  const save = (next: ChatNotes) => { try { const local = { ...next, working: workingDraft }; setVersion(store().save(local, version?.id ?? null, newId())); setNotice('Conversation preferences saved locally. Pins and recaps stay separate from model context.'); return true } catch (error) { setNotice((error as Error).message); return false } }
  const keepWorking = async (next: WorkingNotes): Promise<void> => {
    const approved = { ...next, author: workingAuthor, updatedAt: new Date().toISOString() }
    const answer = await bridge.workingNotes.save({ chatId: chat.id, expected: workingRevision, notes: approved, ...(pendingProposal ? { proposal: pendingProposal } : {}) })
    applyWorkingRead(answer)
    if (answer.ok) setNotice('Working Notes saved in recoverable main-process history. They will be included in this chat’s next model request; they are not confirmed memory or permission.')
  }
  const rejectWorkingProposal = async (): Promise<void> => {
    if (!pendingProposal) return
    const answer = await bridge.workingNotes.rejectProposal({ chatId: chat.id, expected: workingRevision, notes: workingHistory.at(-1)?.notes || emptyWorkingNotes(), proposal: pendingProposal })
    applyWorkingRead(answer)
    if (answer.ok) setNotice('Proposal rejected. Its exact text and what you did not approve remain in Working Notes review history.')
  }
  const editWorking = (next: WorkingNotes): void => { setWorkingDraft({ ...next, author: 'user' }); setWorkingAuthor('user') }
  const lines = (value: string) => value.split(/\r?\n/).map(item => item.trim()).filter(Boolean)
  const stageProposal = (proposal: WorkingNotesProposal, suppliedSourceIds: string[] = []): void => {
    try {
      const sourceIds = new Set([...chat.messages.flatMap(message => message.nativeRecord?.context?.sources.map(source => source.id) || []), ...suppliedSourceIds])
      const bounded = { ...proposal, findings: proposal.findings?.map(finding => ({ ...finding, sourceIds: finding.sourceIds.filter(id => sourceIds.has(id)) })) }
      const saved = store().read()
      setVersion(saved); const proposed = { ...mergeWorkingNotesProposal(workingDraft, bounded), author: 'ai' as const, updatedAt: '' }; setWorkingDraft(proposed); setPendingProposal(proposed); setWorkingAuthor('ai'); setLoaded(true)
      setNotice('Model proposal loaded but not saved. Review every field, then choose Save Working Notes. It is draft context, not confirmed memory or permission. Only citation IDs present in recorded receipts were retained.'); document.getElementById(`chat-context-${chat.id}`)?.setAttribute('open', '')
    } catch (error) { setNotice((error as Error).message) }
  }
  const assistantTexts = [...chat.messages].reverse().filter(message => message.role === 'assistant').map(message => message.content)
  const latestProposal = assistantTexts.map(parseWorkingNotesProposal).find(Boolean) || null
  const latestVaultProposal = assistantTexts.map(parseVaultSearchProposal).find(Boolean) || null
  useEffect(() => {
    const loadProposal = (event: Event): void => {
      const detail = (event as CustomEvent<{ chatId?: string; proposal?: WorkingNotesProposal; sourceIds?: string[] }>).detail
      if (detail?.proposal && (!detail.chatId || detail.chatId === chat.id)) stageProposal(detail.proposal, detail.sourceIds)
    }
    window.addEventListener('oddbrain:working-notes-proposal', loadProposal)
    return () => window.removeEventListener('oddbrain:working-notes-proposal', loadProposal)
  }, [chat.id])
  return <details id={`chat-context-${chat.id}`} className="ob-control-scope" onToggle={event => { if (event.currentTarget.open && !loaded) void read() }}>
    <summary>Conversation notes and context</summary>
    <p>{estimate.characters.toLocaleString()} stored text characters · rough {estimate.roughTokens.low.toLocaleString()}–{estimate.roughTokens.high.toLocaleString()} tokens. Window and cost unknown.</p>
    <p>{estimate.source} {estimate.exclusions}</p>
    {(() => { const receipt = [...chat.messages].reverse().find(message => message.contextReceipt)?.contextReceipt; return receipt ? <details><summary>Newest saved chat-model request receipt</summary><p><strong>{receipt.model}</strong> · {receipt.capacity.source === 'unknown' ? 'unknown capacity, Auto applied no guessed cap' : `${receipt.capacity.source} ${receipt.capacity.tokens?.toLocaleString()}-token capacity`} · {receipt.estimate.inputTokens.toLocaleString()} estimated input tokens.</p><p>{receipt.includedMessages} envelope/message entries included · {receipt.omitted.length} lower-priority item(s) omitted · {receipt.attempts} attempt(s).</p>{receipt.workingNotes ? <p>Working Notes: {receipt.workingNotes.replaceAll('-', ' ')}.</p> : null}{receipt.overflowRetry ? <p className="text-warn">The provider rejected a larger context before generation. OddBrain reported it and retried with lower-priority history removed.</p> : null}{receipt.omitted.length ? <details><summary>Omitted stored messages</summary><ul>{receipt.omitted.map(item => <li key={item.id}><code>{item.id}</code> · {item.reason.replaceAll('-', ' ')}</li>)}</ul></details> : null}<p>{receipt.note}</p><p>{receipt.estimate.method}</p></details> : null })()}
    <details><summary>Native sessions saved for this chat</summary><p>Sending with the matching engine and working folder requests that native session. Different chats never borrow these IDs. These links are observations from recorded native init events, not an import of earlier native history.</p>{sessions.map(link => <p key={`${link.engine}:${link.workspace}`}>{link.engine} · {link.workspace}<br /><code className="break-all">{link.sessionId}</code></p>)}{!sessions.length && <p>No native session link loaded for this chat.</p>}{sessionNotice && <p role="status">{sessionNotice}</p>}</details>
    {(() => { const record = [...chat.messages].reverse().find(m => m.nativeRecord?.chatId === chat.id)?.nativeRecord; return record?.context ? <details><summary>Newest saved native request receipt</summary><p>{record.engine} · {record.context.workspace}<br />{record.context.characters.toLocaleString()} characters in the exact text dispatch (images and original file bytes are separate) · {record.context.historyMessages} stored messages explicitly included.</p>{record.context.modelContext ? <p><strong>Model context:</strong> {record.context.modelContext.source === 'unknown' ? 'unknown capacity · Auto applied no guessed cap' : `${record.context.modelContext.source} ${record.context.modelContext.capacityTokens?.toLocaleString()} tokens`} · {record.context.modelContext.estimatedInputTokens.toLocaleString()} estimated input tokens.</p> : null}{record.context.overflowRecovery ? <p><strong>Overflow recovery:</strong> provider rejected attempt 1 before generation; attempt 2 sent about {record.context.overflowRecovery.retryInputTokens.toLocaleString()} estimated input tokens{record.context.overflowRecovery.retryLimitTokens ? ` under the provider-reported ${record.context.overflowRecovery.retryLimitTokens.toLocaleString()}-token limit` : ' after one complete lower-priority group was removed without guessing a capacity'}. No further retry was allowed.</p> : null}{record.context.retrieval ? <details><summary>{record.context.retrieval.mode === 'app-first' ? 'App-first vault retrieval' : 'Owner-sent model-directed follow-up'} · {record.context.retrieval.excerptsIncluded}/{record.context.retrieval.excerptsFound} excerpt(s) included</summary><ul>{record.context.retrieval.queries.map((query, index) => <li key={`${index}:${query}`}><code>{query}</code></li>)}</ul>{record.context.retrieval.catalogue.length ? <details><summary>Matching catalogue groups ({record.context.retrieval.catalogue.length})</summary><ul>{record.context.retrieval.catalogue.map(group => <li key={group.path}><code>{group.path}</code> · {group.matchingEntries} matching entr{group.matchingEntries === 1 ? 'y' : 'ies'}</li>)}</ul></details> : null}{record.context.retrieval.notices.map((item, index) => <p key={`${index}:${item}`}>{item}</p>)}{record.context.retrieval.stage ? <p><strong>Visible stage {record.context.retrieval.stage.number} of {record.context.retrieval.stage.total} completed:</strong> {record.context.retrieval.stage.goal}. Another stage will run only if you review and send its visible draft.</p> : null}<p>Read-only metadata and full-text lexical search stayed inside the chat’s approved non-excluded vault scope. {record.context.retrieval.localSemantic === 'local-distributional-v1' ? `Optional local distributional expansion was on and contributed ${record.context.retrieval.semanticMatches || 0} selected excerpt(s); it used only this bounded corpus, with no cloud or hidden permanent index.` : 'Local semantic expansion was off.'} Returned text remained untrusted evidence.</p></details> : null}{record.context.omitted?.length ? <details><summary>{record.context.omitted.length} lower-priority context item(s) omitted</summary><ul>{record.context.omitted.map(item => <li key={item.id}><strong>{item.title}</strong> · {item.reason.replaceAll('-', ' ')}</li>)}</ul><p>Stored originals and Working Note revisions were not changed.</p></details> : null}{record.context.session ? <p><strong>Native session: {record.context.session.state}</strong> · {record.context.session.detail}</p> : <p>Older receipt: native session freshness was not recorded.</p>}{record.context.launch ? <details><summary>Native folder activation inventory</summary><p>{record.context.launch.files} configuration file(s): {record.context.launch.connectorFiles} connector, {record.context.launch.ruleFiles} rule/instruction, {record.context.launch.hookFiles} hook/config. Inventory {record.context.launch.complete ? 'completed within bounds' : 'was incomplete'}.</p><code className="break-all">{record.context.launch.digest}</code>{record.context.launch.warnings.map(item => <p key={item} role="note">{item}</p>)}</details> : null}<ul>{record.context.sources.map(source => <li key={source.id}><strong>{source.title}</strong>{source.sourcePath ? <button type="button" className="ob-text-button ml-2" onClick={() => window.dispatchEvent(new CustomEvent('app:open-source', { detail: { path: source.sourcePath, title: source.title } }))}>Open vault source</button> : null}{source.role ? ` · ${source.role.replaceAll('-', ' ')}` : ' · legacy attribution'}: {source.chars.toLocaleString()} characters. {source.coverage}{source.hazards?.total ? <details><summary className="text-warn">Reveal {source.hazards.total} invisible-text warning(s)</summary><p>{source.hazards.notice}</p>{source.hazards.findings.map(finding => <div key={finding.kind}><p>{finding.label}: {finding.count}; {finding.codePoints.join(', ')} at UTF-16 positions {finding.positions.join(', ')}</p>{finding.excerpts.map((text, index) => <pre key={index} className="whitespace-pre-wrap break-words">{text}</pre>)}</div>)}</details> : null}<details><summary>Source fingerprint</summary><code className="break-all">{source.digest || 'Not recorded in this older receipt'}</code></details></li>)}</ul><p>This receipt separates owner requests and preferences, app-authored instructions, quoted references and carried conversation text. It describes this dispatch, not the whole native context window. Other project chats, pins and recaps were not automatically included. Removing a reference affects future sends, not text already in native history.</p></details> : null })()}
    <details open><summary>Working Notes · {workingDraft.author === 'ai' ? 'AI draft — not approved memory' : 'your working draft'}</summary><p>This compact working set follows this chat across models. It is sent as draft context, never as confirmed memory, instructions, or permission. Previous revisions remain available in the export.</p>
      <label>Objective<textarea value={workingDraft.objective} onChange={event => editWorking({ ...workingDraft, objective: event.target.value })} /></label>
      {([['Plan', 'plan'], ['Decisions', 'decisions'], ['Constraints', 'constraints'], ['Open questions', 'openQuestions'], ['Uncertainties', 'uncertainties'], ['Next actions', 'nextActions']] as const).map(([label, field]) => <label key={field}>{label}<textarea aria-label={`Working Notes ${label}`} value={workingDraft[field].join('\n')} onChange={event => editWorking({ ...workingDraft, [field]: lines(event.target.value) })} placeholder="One item per line" /></label>)}
      {latestProposal ? <button type="button" onClick={() => stageProposal(latestProposal)}>Load latest model proposal for review</button> : null}
      {workingDraft.findings.length ? <details><summary>{workingDraft.findings.length} source-linked finding(s)</summary>{workingDraft.findings.map((finding, index) => <p key={index}>{finding.text}<br /><code>{finding.sourceIds.join(', ')}</code></p>)}</details> : null}
      <button type="button" disabled={!loaded} onClick={() => void keepWorking(workingDraft)}>Save Working Notes</button>
      {pendingProposal ? <button type="button" disabled={!loaded} onClick={() => void rejectWorkingProposal()}>Reject this proposal</button> : null}
      <p>{workingDraft.updatedAt ? `Changed ${workingDraft.updatedAt}.` : 'No Working Notes saved yet.'}</p>
      <details><summary>Working Notes recovery and review history · {workingHistory.length} revision(s)</summary>
        <p>Every accepted revision is retained. Model proposals remain separate from owner-approved notes, including proposal items you removed or rejected.</p>
        {workingHistory.map(item => <details key={item.id}><summary>{item.at} · {item.source.replaceAll('-', ' ')}</summary>{item.notApproved?.length ? <><p><strong>What I didn’t approve</strong></p><ul>{item.notApproved.map((text, index) => <li key={`${index}:${text}`}>{text}</li>)}</ul></> : <p>No proposal difference was recorded for this revision.</p>}</details>)}
        <button type="button" onClick={() => void bridge.workingNotes.exportRecovery(chat.id).then(answer => setNotice(answer.answer))}>Export Working Notes recovery</button>
        <button type="button" onClick={() => void bridge.workingNotes.importRecovery(chat.id).then(applyWorkingRead)}>Import into empty Working Notes history</button>
      </details>
    </details>
    {latestVaultProposal ? <div><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('app:draft', { detail: vaultFollowupDraft(latestVaultProposal) }))}>Prepare latest model-proposed vault follow-up</button><p>Loads a visible draft only. You must review and send it; this does not grant vault access or run a search.</p></div> : null}
    <div><button type="button" className="ob-choice" aria-pressed={notes.vaultSearch} disabled={!loaded} onClick={() => save({ ...notes, vaultSearch: !notes.vaultSearch, ...(!notes.vaultSearch ? {} : { localSemantic: false }) })}>{notes.vaultSearch ? 'Approved vault search: on' : 'Let this chat search approved vault sources'}</button><p>Read-only metadata and full-text search uses up to four cited excerpts from the non-excluded vault scope. Turn it off here at any time. Mentioning a folder never enables it.</p></div>
    <div><button type="button" className="ob-choice" aria-pressed={notes.localSemantic} disabled={!loaded || !notes.vaultSearch} onClick={() => save({ ...notes, localSemantic: !notes.localSemantic })}>{notes.localSemantic ? 'Local semantic expansion: on' : 'Also use local semantic expansion'}</button><p>Optional and on-device: OddBrain derives bounded word relationships only from the approved corpus in this search. It uses no cloud, downloaded embedding model, hidden permanent index, or new file access. Receipts identify semantic matches and any corpus cap.</p></div>
    <p>Pins and recaps stay separate and are not sent automatically. Originals are unchanged; every saved notes version is retained.</p>
    <button type="button" onClick={() => void read()}>Reload notes</button>
    <button type="button" onClick={() => { try { downloadText(JSON.stringify(store().versions(), null, 2), 'conversation-preference-revisions.json') } catch (error) { setNotice((error as Error).message) } }}>Export pins, recaps, and conversation preferences</button>
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
