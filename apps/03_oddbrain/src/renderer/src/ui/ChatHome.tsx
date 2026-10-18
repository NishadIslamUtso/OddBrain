import { Link, Sparkles, SquareTerminal } from 'lucide-react'
import InteractiveBrain from './InteractiveBrain'
export const HOME_STARTERS = [
  { label: 'Work on an idea', text: 'Help me develop this idea: ', Icon: Sparkles },
  { label: 'Find a connection', text: 'Help me connect these ideas: ', Icon: Link },
  { label: 'Untangle some code', text: 'Help me understand this code: ', Icon: SquareTerminal },
] as const
/** Actual home screen, also rendered directly in the read-only preview. */
export function ChatHome({ name = '', words = false, readOnly = false }: { name?: string; words?: boolean; readOnly?: boolean }) {
  return <div className="ob-home-heading"><InteractiveBrain words={words} readOnly={readOnly} /><h1>{name.trim() ? `What’s the plan, ${name.trim()}?` : 'What’s the plan?'}</h1></div>
}
export function HomeStarters({ onPick }: { onPick: (text: string) => void }) {
  return <div className="ob-home-starters">{HOME_STARTERS.map(({ label, text, Icon }) => <button key={label} type="button" onClick={() => onPick(text)}><Icon size={14} />{label}</button>)}</div>
}
