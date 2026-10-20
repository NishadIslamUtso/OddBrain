import { Mascot } from '../motion/Mascot'
export default function ProfileButton({ name, onOpen, compact = false }: { name: string; onOpen: () => void; compact?: boolean }) {
  return <button type="button" className={`ob-profile ${compact ? 'is-compact' : ''}`} onClick={onOpen} aria-label={`${name || 'You'}, open settings`} title={`${name || 'You'} · Settings`}>
    <Mascot motion="idle" size={24} static />
    {!compact ? <span>{name || 'You'}</span> : null}
  </button>
}
