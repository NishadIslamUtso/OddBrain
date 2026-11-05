import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Clipboard, Link2, MessageCircleQuestion, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { vaultGet, vaultPost } from '@shared/lib/vault'
import type { ReviewCenterState, ReviewItem } from '@shared/lib/reviewCenter'
import { bridge } from '../platform/bridge'

const EMPTY: ReviewCenterState = { version: 1, revision: 0, items: [], runs: [] }
type Filter = 'open' | 'question' | 'conflict' | 'connection' | 'cleanup' | 'all'
const labels: Record<ReviewItem['kind'], string> = { question: 'Question', conflict: 'Conflict', connection: 'Connection', correction: 'Needs correction', 'keep-or-forget': 'Keep or forget', cleanup: 'Cleanup candidate', 'external-response': 'External suggestion' }
const tones: Record<ReviewItem['kind'], string> = { question: 'text-amber-300 bg-amber-500/10', conflict: 'text-rose-300 bg-rose-500/10', connection: 'text-sky-300 bg-sky-500/10', correction: 'text-orange-300 bg-orange-500/10', 'keep-or-forget': 'text-violet-300 bg-violet-500/10', cleanup: 'text-slate-300 bg-white/5', 'external-response': 'text-cyan-300 bg-cyan-500/10' }

export default function ReviewCenter() {
  const [state, setState] = useState(EMPTY), [loading, setLoading] = useState(true), [busy, setBusy] = useState('')
  const [filter, setFilter] = useState<Filter>('open'), [notice, setNotice] = useState(''), [days, setDays] = useState<number | null>(60), [customDays, setCustomDays] = useState('90')
  const [answering, setAnswering] = useState(''), [answer, setAnswer] = useState('')
  const [handoff, setHandoff] = useState(false), [packet, setPacket] = useState<{ text: string; sha256: string; items: number } | null>(null)
  const [provider, setProvider] = useState('Consumer AI (manual)'), [response, setResponse] = useState('')
  const load = async () => {
    try { const value = await vaultGet('/review-center'); setState(value as unknown as ReviewCenterState) }
    catch (error) { setNotice((error as Error).message) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])
  const run = async () => {
    setBusy('scan'); setNotice('')
    try { const value = await vaultPost('/review-scan', { days }); setState(value as unknown as ReviewCenterState); setNotice('Review finished. Confirmed memory was not changed.') }
    catch (error) { setNotice((error as Error).message) }
    finally { setBusy('') }
  }
  const processSources = async () => {
    setBusy('sources'); setNotice('')
    try { const result = await bridge.memoryWorkspace.run(); setNotice(result.ok ? 'New saved sources were queued for the selected organizer. Review does not approve them automatically.' : result.error || 'The organizer could not start. Nothing was approved or changed.') }
    catch (error) { setNotice((error as Error).message) }
    finally { setBusy('') }
  }
  const act = async (item: ReviewItem, action: 'answer' | 'keep' | 'forget-candidate' | 'dismiss' | 'reopen') => {
    setBusy(item.id); setNotice('')
    try { const value = await vaultPost('/review-action', { id: item.id, action, answer }); setState(value as unknown as ReviewCenterState); setAnswering(''); setAnswer('') }
    catch (error) { setNotice((error as Error).message) }
    finally { setBusy('') }
  }
  const preparePacket = async () => {
    setBusy('packet')
    try { const value = await vaultGet('/review-packet'); setPacket(value as unknown as { text: string; sha256: string; items: number }) }
    catch (error) { setNotice((error as Error).message) }
    finally { setBusy('') }
  }
  const copyPacket = async () => { if (packet) try { await navigator.clipboard.writeText(packet.text); setNotice('Exact packet copied. Paste it yourself and press Send yourself.') } catch { setNotice('Copy was blocked here. Select the packet text and copy it manually.') } }
  const importReply = async () => {
    if (!packet) return
    setBusy('import')
    try { const value = await vaultPost('/review-import', { provider, response, packetSha256: packet.sha256 }); setState(value as unknown as ReviewCenterState); setResponse(''); setNotice('Imported as a provider-labelled, unconfirmed suggestion. It did not change memory.') }
    catch (error) { setNotice((error as Error).message) }
    finally { setBusy('') }
  }
  const shown = useMemo(() => state.items.filter(item => filter === 'all' ? true : filter === 'open' ? item.status === 'open' || item.status === 'unconfirmed' : filter === 'cleanup' ? ['cleanup','keep-or-forget'].includes(item.kind) : item.kind === filter), [state.items, filter])
  const latest = state.runs[0], open = state.items.filter(item => item.status === 'open').length
  const presetDays = days === null || [60, 180, 365].includes(days), rangeValue = days === null ? 'all' : presetDays ? String(days) : 'custom'
  const validScope = days === null || Number.isInteger(days) && days >= 1 && days <= 3650
  if (loading) return <div className="p-6 text-sm text-[color:var(--color-text-faint)]">Reading your review list…</div>
  return <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
    <section className="rounded-2xl border border-white/10 bg-[color:var(--color-surface)] p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2"><ShieldCheck size={19} className="text-[color:var(--color-accent)]"/><h2 className="text-base font-semibold text-[color:var(--color-text)]">Interpretation review</h2></div>
          <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">OddBrain checks what it may have misunderstood, what conflicts, and what needs your answer. It asks; it does not rewrite confirmed memory, archive, or delete.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Review range" value={rangeValue} onChange={event => { const value = event.target.value; setDays(value === 'all' ? null : value === 'custom' ? Number(customDays) : Number(value)) }} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-[color:var(--color-text)]">
            <option value={60}>Last 60 days + linked older evidence</option><option value={180}>Last 6 months + linked older evidence</option><option value={365}>Last year + linked older evidence</option><option value="custom">Custom number of days</option><option value="all">All history</option>
          </select>
          {rangeValue === 'custom' && <label className="text-xs text-[color:var(--color-text-muted)]">Days<input aria-label="Custom review days" type="number" min="1" max="3650" value={customDays} onChange={event => { setCustomDays(event.target.value); setDays(Number(event.target.value)) }} className="ml-1 w-24 rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-xs text-[color:var(--color-text)]"/></label>}
          <button onClick={() => void run()} disabled={!!busy || !validScope} className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--color-accent)] px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"><RefreshCw size={14} className={busy === 'scan' ? 'animate-spin' : ''}/>Run review</button>
        </div>
      </div>
      {latest ? <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 rounded-xl bg-black/15 px-4 py-3 text-xs text-[color:var(--color-text-muted)]"><span><strong className="text-[color:var(--color-text)]">{open}</strong> open</span><span>{latest.checked} in range</span><span>{latest.linkedOlder} directly linked older</span><span>Last run {latest.createdAt.slice(0, 10)}</span></div> : <p className="mt-4 rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-200">No interpretation review has run yet.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs"><button onClick={() => void processSources()} disabled={!!busy} className="inline-flex items-center gap-1.5 text-[color:var(--color-accent)] hover:underline"><Sparkles size={13}/>Process new saved conversations first</button><span className="text-[color:var(--color-text-faint)]">Uses your selected organizer and saved daily limits; results still wait for approval.</span></div>
    </section>

    {notice && <div role="status" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[color:var(--color-text-muted)]">{notice}</div>}

    <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/15 p-1" role="tablist" aria-label="Review item filters">
      {(['open','question','conflict','connection','cleanup','all'] as Filter[]).map(value => <button key={value} role="tab" aria-selected={filter === value} onClick={() => setFilter(value)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs capitalize ${filter === value ? 'bg-white/10 text-[color:var(--color-text)]' : 'text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]'}`}>{value === 'cleanup' ? 'Keep / clean up' : value}</button>)}
    </div>

    <div className="space-y-3">
      {!shown.length && <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-[color:var(--color-text-faint)]">Nothing in this view.</div>}
      {shown.map(item => <article key={item.id} className="rounded-2xl border border-white/10 bg-[color:var(--color-surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><span className={`rounded-md px-2 py-1 text-[11px] font-medium ${tones[item.kind]}`}>{labels[item.kind]}</span><h3 className="mt-2 text-sm font-semibold text-[color:var(--color-text)]">{item.title}</h3></div><span className="text-[11px] capitalize text-[color:var(--color-text-faint)]">{item.status.replace('-', ' ')}</span></div>
        <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">{item.detail}</p>
        {item.scope === 'directly-linked-older' && <p className="mt-2 text-xs text-amber-300">Includes older evidence only because it is directly linked to an in-range interpretation.</p>}
        {!!item.evidence.length && <details className="mt-3"><summary className="cursor-pointer text-xs text-[color:var(--color-text-faint)]">Evidence and coverage ({item.evidence.length})</summary><div className="mt-2 space-y-2">{item.evidence.map(value => <div key={`${value.sourceId}-${value.path}`} className="rounded-lg bg-black/15 p-3 text-xs text-[color:var(--color-text-muted)]"><p>{value.provider} · {value.role}{value.speaker ? ` · ${value.speaker}` : ''} · {value.observed.slice(0, 10)}</p><p className="mt-1 break-all text-[color:var(--color-text-faint)]">{value.path}</p><p className="mt-1">{value.coverage}</p>{value.quote && <blockquote className="mt-2 border-l border-white/15 pl-3 italic">“{value.quote.slice(0, 800)}”</blockquote>}</div>)}</div></details>}
        {item.answer && <p className="mt-3 rounded-lg bg-emerald-500/10 p-3 text-xs text-emerald-200">{item.answer}</p>}
        {answering === item.id && <div className="mt-3"><label className="text-xs text-[color:var(--color-text-muted)]">Your answer<textarea value={answer} onChange={event => setAnswer(event.target.value)} autoFocus className="mt-1 min-h-24 w-full rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-[color:var(--color-text)]"/></label></div>}
        <div className="mt-3 flex flex-wrap gap-2">
          {item.kind === 'question' && item.status === 'open' && (answering === item.id ? <button onClick={() => void act(item, 'answer')} disabled={busy === item.id || !answer.trim()} className="rounded-lg bg-[color:var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-black">Save answer</button> : <button onClick={() => { setAnswering(item.id); setAnswer('') }} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[color:var(--color-text)]"><MessageCircleQuestion size={13}/>Answer</button>)}
          {item.kind === 'keep-or-forget' && item.status === 'open' && <><button onClick={() => void act(item, 'keep')} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[color:var(--color-text)]">Keep</button><button onClick={() => void act(item, 'forget-candidate')} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-amber-200">Mark as forget candidate</button></>}
          {item.status === 'open' && item.kind !== 'keep-or-forget' && <button onClick={() => void act(item, 'dismiss')} className="rounded-lg px-3 py-1.5 text-xs text-[color:var(--color-text-faint)] hover:text-[color:var(--color-text)]">Set aside</button>}
          {['answered','kept','forget-candidate','dismissed'].includes(item.status) && <button onClick={() => void act(item, 'reopen')} className="rounded-lg px-3 py-1.5 text-xs text-[color:var(--color-text-faint)]">Reopen</button>}
        </div>
      </article>)}
    </div>

    <section className="rounded-2xl border border-white/10 bg-[color:var(--color-surface)]">
      <button onClick={() => setHandoff(value => !value)} aria-expanded={handoff} className="flex w-full items-center justify-between gap-4 p-4 text-left"><span><span className="flex items-center gap-2 text-sm font-semibold text-[color:var(--color-text)]"><Link2 size={15}/>Optional external AI handoff</span><span className="mt-1 block text-xs text-[color:var(--color-text-faint)]">Preview, copy, and send it yourself. OddBrain never presses Send.</span></span><ChevronDown size={16} className={`transition ${handoff ? 'rotate-180' : ''}`}/></button>
      {handoff && <div className="border-t border-white/10 p-4">
        {!packet ? <button onClick={() => void preparePacket()} disabled={busy === 'packet'} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-[color:var(--color-text)]">Prepare exact outgoing preview</button> : <>
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-[color:var(--color-text-muted)]">{packet.items} open items · SHA-256 <code>{packet.sha256.slice(0, 16)}…</code></p><button onClick={() => void copyPacket()} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-xs"><Clipboard size={13}/>Copy exact packet</button></div>
          <textarea readOnly value={packet.text} aria-label="Exact outgoing AI handoff" className="mt-3 h-44 w-full rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-[11px] text-[color:var(--color-text-muted)]"/>
          <div className="mt-3 rounded-lg bg-amber-500/10 p-3 text-xs leading-5 text-amber-100"><AlertTriangle size={13} className="mr-1 inline"/>Open the consumer AI yourself, check its privacy settings, paste this packet, and press Send yourself. Provider limits and answers are outside OddBrain.</div>
          <div className="mt-4 grid gap-3"><label className="text-xs text-[color:var(--color-text-muted)]">Provider label<input value={provider} onChange={event => setProvider(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-[color:var(--color-text)]"/></label><label className="text-xs text-[color:var(--color-text-muted)]">Paste the response<textarea value={response} onChange={event => setResponse(event.target.value)} className="mt-1 min-h-28 w-full rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-[color:var(--color-text)]"/></label><button onClick={() => void importReply()} disabled={!response.trim() || busy === 'import'} className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-[color:var(--color-accent)] px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"><Check size={13}/>Import as unconfirmed suggestion</button></div>
        </>}
      </div>}
    </section>
  </div>
}
