import { ArrowLeft, ArrowRight, Menu, Settings2 } from 'lucide-react'
import type { Page } from '../app/types'
import { Mascot } from './Mascot'

export function Header({
  page,
  settingsOpen,
  canBack,
  canForward,
  vaultFolder,
  browser,
  onBack,
  onForward,
  onSettings,
  onMenu,
}: {
  page: Page
  settingsOpen: boolean
  canBack: boolean
  canForward: boolean
  vaultFolder: string
  browser: boolean
  onBack: () => void
  onForward: () => void
  onSettings: () => void
  onMenu: () => void
}) {
  return (
    <header className="titlebar">
      <button
        type="button"
        className="icon-button mobile-menu"
        aria-label="Open navigation"
        onClick={onMenu}
      >
        <Menu size={18} />
      </button>
      <span className="brand-mark" aria-hidden="true">
        <Mascot size={22} still />
      </span>
      <span className="brand-title">OddBrain</span>
      {browser ? (
        <span
          className="browser-chip"
          title="Records in this preview stay in this browser, separate from the installed app"
        >
          Browser preview
        </span>
      ) : null}
      <div className="history-buttons">
        <button
          type="button"
          className="icon-button"
          aria-label="Go back"
          disabled={!canBack}
          onClick={onBack}
        >
          <ArrowLeft size={15} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Go forward"
          disabled={!canForward}
          onClick={onForward}
        >
          <ArrowRight size={15} />
        </button>
      </div>
      <div className="titlebar-space" />
      <span className="header-context">
        {settingsOpen ? 'Settings' : page === 'chat' ? '' : page.charAt(0).toUpperCase() + page.slice(1)}
      </span>
      <span className="top-chip">
        <span className="chip-muted" />
        Engine not connected
      </span>
      <span className="top-chip" title={vaultFolder || 'No folder selected'}>
        <span className={vaultFolder ? 'chip-ready' : 'chip-muted'} />
        {vaultFolder ? 'Vault selected' : 'No vault'}
      </span>
      <button
        type="button"
        className="icon-button header-settings"
        aria-label="Open settings"
        onClick={onSettings}
      >
        <Settings2 size={16} />
      </button>
    </header>
  )
}
