import BrainMark from './BrainMark.jsx'
import { useEffect, useRef, useState } from 'react'

/**
 * TitleBar — File / Edit / View / Go / Help (screenshot 191558.png).
 *
 * In the Electron build this is replaced by a native menu; in the browser build
 * we render our own so the window still looks like the desktop app.
 * Anything the local build genuinely cannot do is shown disabled rather than
 * wired to a dead button.
 */
const MENUS = [
  {
    label: 'File',
    items: [
      { id: 'new-chat', label: 'New chat', accel: 'Ctrl+N' },
      { id: 'new-project', label: 'New project…' },
      { sep: true },
      { id: 'save-artifact', label: 'Save artifact to vault' },
      { id: 'open-vault', label: 'Reveal vault folder' },
      { sep: true },
      { id: 'close', label: 'Close' },
    ],
  },
  {
    label: 'Edit',
    items: [
      { id: 'undo', label: 'Undo', disabled: true },
      { id: 'redo', label: 'Redo', disabled: true },
      { sep: true },
      { id: 'cut', label: 'Cut', disabled: true },
      { id: 'copy', label: 'Copy', disabled: true },
      { id: 'paste', label: 'Paste', disabled: true },
      { sep: true },
      { id: 'clear-chat', label: 'Clear this chat' },
    ],
  },
  {
    label: 'View',
    items: [
      { id: 'toggle-sidebar', label: 'Toggle sidebar', accel: 'Ctrl+B' },
      { id: 'toggle-vault', label: 'Toggle AI-Brain panel', accel: 'Ctrl+J' },
      { id: 'toggle-agents', label: 'Toggle sub agents panel', accel: 'Ctrl+Shift+G' },
      { id: 'toggle-artifacts', label: 'Toggle artifacts panel', accel: 'Ctrl+Shift+A' },
      { id: 'today', label: 'Today view', accel: 'Alt+T' },
      { sep: true },
      { id: 'reload', label: 'Reload', accel: 'Ctrl+R' },
    ],
  },
  {
    label: 'Go',
    items: [
      { id: 'back', label: 'Back', disabled: true },
      { id: 'forward', label: 'Forward', disabled: true },
      { sep: true },
      { id: 'search-chats', label: 'Search chats' },
      { id: 'latest', label: 'Go to latest message' },
    ],
  },
  {
    label: 'Help',
    items: [
      { id: 'today', label: 'Today view' },
      { id: 'ollama-status', label: 'Ollama status' },
      { id: 'vault-status', label: 'Vault status' },
      { sep: true },
      { id: 'docs', label: 'Open living docs (00_LIVING_DOCS)' },
      { id: 'about', label: 'About AI ASSistant' },
    ],
  },
]

export default function TitleBar({ onAction, ollamaOk, vaultOk, title = 'AI ASSistant' }) {
  const [open, setOpen] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(null)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(null)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div
      ref={ref}
      className="title-bar"
    >
      <BrainMark size={13} className="mr-2 pl-1" />

      {MENUS.map((m) => (
        <div key={m.label} className="relative">
          <button
            onClick={() => setOpen(open === m.label ? null : m.label)}
            onMouseEnter={() => open && setOpen(m.label)}
            className={`px-2 py-[3px] rounded ${
              open === m.label ? 'bg-[var(--bg-hover)] text-[var(--ink)]' : 'text-[var(--ink2)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink)]'
            }`}
          >
            {m.label}
          </button>
          {open === m.label ? (
            <div className="absolute left-0 top-[26px] z-[95] w-[230px] bg-[var(--bg-elev)] border border-[var(--border-strong)] rounded-lg py-1 shadow-pop">
              {m.items.map((it, i) =>
                it.sep ? (
                  <div key={`s${i}`} className="my-1 h-px bg-[var(--border)]" />
                ) : (
                  <button
                    key={it.id}
                    disabled={it.disabled}
                    onClick={() => {
                      setOpen(null)
                      onAction?.(it.id)
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-[5px] text-left text-[12.5px] ${
                      it.disabled
                        ? 'text-[var(--ink3)] opacity-60 cursor-default'
                        : 'text-[var(--ink)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.accel ? <span className="text-[11px] text-[var(--ink3)]">{it.accel}</span> : null}
                  </button>
                ),
              )}
            </div>
          ) : null}
        </div>
      ))}

      <div className="flex-1 text-center text-[12px] text-[var(--ink3)] truncate px-4">
        {title}
      </div>

      <div className="flex items-center gap-2 pr-1 text-[11px]">
        <span className="flex items-center gap-1 text-[var(--ink3)]" title="Ollama 127.0.0.1:11434">
          <span
            className={`w-1.5 h-1.5 rounded-full ${ollamaOk ? 'bg-green-500' : 'bg-[var(--danger)]'}`}
          />
          Ollama
        </span>
        <span className="flex items-center gap-1 text-[var(--ink3)]" title="Vault API 127.0.0.1:8765">
          <span
            className={`w-1.5 h-1.5 rounded-full ${vaultOk ? 'bg-green-500' : 'bg-[var(--ink3)]'}`}
          />
          Vault
        </span>
      </div>
    </div>
  )
}
