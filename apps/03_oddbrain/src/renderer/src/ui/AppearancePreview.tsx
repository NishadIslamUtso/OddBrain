import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowUp, ChevronDown, Mic, MoreHorizontal, Paperclip } from 'lucide-react'
import type { Chat, Message } from '@shared/types'
import type { Appearance } from '../state/appearance'
import { appearanceVariables } from '../state/appearance'
import { lookTokens, type LookPreferences, type SidebarPreferences } from '../state/look'
import DesktopShell, { screenCommands } from './DesktopShell'
import Sidebar from '../components/Sidebar'
import MessageRow from '../components/MessageRow'
import ComposerSurface from './ComposerSurface'
import { ChatHome, HomeStarters } from './ChatHome'
import { LookContext } from './LookContext'
import { MotionOverride } from './MotionContext'

const nothing = (): void => undefined
const SAMPLE: Chat[] = [
  { id: 'preview-chat-1', title: 'Making OddBrain feel like home', date: 'Today', messages: [] },
  { id: 'preview-chat-2', title: 'A home for the interesting bits', date: 'Today', messages: [] },
  { id: 'preview-chat-3', title: 'A tiny timer for a big afternoon', date: 'Yesterday', messages: [] },
]
const MESSAGES: Message[] = [
  { id: 'preview-message-1', role: 'user', content: 'Keep it compact. Give the brain a little mischief.' },
  { id: 'preview-message-2', role: 'assistant', content: 'The controls stay quiet. The brain has other plans.', status: 'complete' },
]
function PreviewComposer({ engine, model }: { engine: string; model: string }) {
  return <div className="ob-composer-host"><ComposerSurface><textarea aria-label="Preview message" placeholder="Ask anything" readOnly rows={1} /><div className="ob-preview-composer-controls"><Paperclip size={13} /><Mic size={13} /><span>{engine}<ChevronDown size={11} /></span><span>{model}<ChevronDown size={11} /></span><MoreHorizontal size={14} /><span className="ob-grow" /><button type="button" aria-label="Preview send"><ArrowUp size={15} /></button></div></ComposerSurface></div>
}
/** Shared native React components, no iframe, new engine, vault or chat store. */
export default function AppearancePreview({ appearance, look, sidebar, screen = 'home', name = 'Friend', engine = 'claude-code', model = 'Choose a model', quick = false }: {
  appearance: Appearance; look: LookPreferences; sidebar: SidebarPreferences
  screen?: 'home' | 'chat'; name?: string; engine?: string; model?: string; quick?: boolean
}) {
  const holder = useRef<HTMLDivElement | null>(null), [width, setWidth] = useState(340)
  const [osDark, setOsDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => { const query = window.matchMedia('(prefers-color-scheme: dark)'); const changed = (): void => setOsDark(query.matches); query.addEventListener('change', changed); return () => query.removeEventListener('change', changed) }, [])
  useEffect(() => {
    const el = holder.current; if (!el) return
    setWidth(el.clientWidth)
    const observer = new ResizeObserver(() => setWidth(el.clientWidth)); observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const tokens = { ...appearanceVariables(appearance), ...lookTokens(appearance, look, osDark) }
  const style = { ...tokens, width: 1280, height: 820, transform: `scale(${width / 1280})`, transformOrigin: 'top left', colorScheme: tokens['--ob-scheme'], color: 'var(--color-ink)', background: 'var(--color-bg)', fontFamily: 'var(--font-sans)' } as CSSProperties
  const navigation = { view: 'chat' as const, onView: nothing, onNew: nothing, onSettings: nothing, name }
  const side = <Sidebar chats={SAMPLE} currentChat="" onOpen={nothing} onNew={nothing} onDelete={nothing} onOpenSettings={nothing} profileName={name} onSetChatProject={nothing} onPin={nothing} onRenameChat={nothing} view="chat" onView={nothing} artifactQuery="" onArtifactQuery={nothing} artifactCount={0} prefs={sidebar} onPrefsChange={nothing} preview />
  const composer = <PreviewComposer engine={engine} model={model} />
  return <div ref={holder} className="ob-preview-frame" style={{ aspectRatio: '1280 / 820' }} aria-label={`${screen === 'home' ? 'Home' : 'Chat'} appearance preview`}>
    <div className="ob-preview-canvas" data-ob-style={look.style} data-ob-density={look.density} style={style} inert>
      <LookContext value={look}><MotionOverride value={appearance.motion}>
        <DesktopShell layout={look.layout} navigation={navigation} sidebar={side} items={SAMPLE.map(c => ({ id: c.id, title: c.title, open: nothing }))} commands={screenCommands(nothing)} preview>
          {screen === 'home' ? <main className="ob-chat-view ob-chat-home"><div className="ob-chat-scroller"><div className="ob-home-stack"><ChatHome name={name} words={appearance.mascotWords} readOnly />{composer}<HomeStarters onPick={nothing} /></div></div></main> : <main className="ob-chat-view"><div className="ob-chat-scroller"><div className="ob-transcript mx-auto w-full max-w-[var(--chat-width)] px-6 py-6"><div className="flex flex-col gap-7">{MESSAGES.map(message => <MessageRow key={message.id} message={message} onRewrite={async () => false} onRestore={nothing} />)}</div></div></div>{composer}</main>}
        </DesktopShell>
        {quick ? <div className="ob-mini-quick"><header>Quick ask</header><ComposerSurface><textarea aria-label="Quick preview message" placeholder="Ask anything" readOnly /></ComposerSurface></div> : null}
      </MotionOverride></LookContext>
    </div>
  </div>
}
