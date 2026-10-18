import { useRef, useState } from 'react'
import { Settings, Globe, HelpCircle, ArrowUpCircle, Blocks, Info, KeyRound, LogOut, ChevronRight, ExternalLink, Check } from 'lucide-react'
import useDismiss from '../hooks/useDismiss.js'
export default function UserMenu({ onClose, onSettings, onApps, notify, profile }) {
  const ref = useRef(null)
  const [language, setLanguage] = useState(false)
  useDismiss(ref, onClose)
  function action(callback) { onClose(); callback() }
  return <div ref={ref} className="user-menu popup" role="menu" aria-label="Account menu">
    <div className="menu-email">{profile?.email || `${profile?.name || 'Friend'} · this browser only`}</div>
    <button role="menuitem" autoFocus onClick={() => action(onSettings)}><Settings size={15} /><span>Settings</span><kbd>Ctrl+,</kbd></button>
    <button role="menuitem" onClick={() => setLanguage(!language)}><Globe size={15} /><span>Language</span><small>English</small></button>
    {language && <div className="language-option"><Check size={13} /> English <small>Local interface</small></div>}
    <button role="menuitem" onClick={() => action(() => notify('Run start-app.bat on your Windows laptop. Ollama uses the existing qwen2.5:3b model; the vault is vault/AI-Brain. See the app README for troubleshooting.'))}><HelpCircle size={15} /><span>Get help</span></button>
    <div className="menu-separator" />
    <button role="menuitem" onClick={() => action(() => notify('Local mode is free. This app is not connected to any billing and does not use any subscription.'))}><ArrowUpCircle size={15} /><span>Upgrade plan</span></button>
    <button role="menuitem" onClick={() => action(onApps)}><Blocks size={15} /><span>Get apps and extensions</span></button>
    <button role="menuitem" onClick={() => action(() => notify('AI ASSistant is a local Ollama chat app with a carefully matched interface. The Markdown Obsidian vault is canonical memory; UI similarity does not mean hosted-model intelligence.'))}><Info size={15} /><span>Learn more</span><ChevronRight size={14} /></button>
    <div className="menu-separator" />
    <button role="menuitem" onClick={() => action(() => notify('No API key is needed for local Ollama. Cloud providers and hosted API keys are not connected in this build.'))}><KeyRound size={15} /><span>Get API keys</span><ExternalLink size={14} /></button>
    <div className="menu-separator" />
    <button role="menuitem" onClick={() => action(() => notify('There is no external account to log out of. Your local chats and original vault sources have been kept.'))}><LogOut size={15} /><span>Log out</span></button>
  </div>
}
