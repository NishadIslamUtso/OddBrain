import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, Database, Monitor, Palette, Settings2, X } from 'lucide-react'
import type { Appearance, Workspace } from '../../../shared/workspace'
import type { VaultReply } from '../../../shared/desktop'
import { client, isDesktop } from '../data/client'
import type { SettingsPage } from '../app/types'

type Props = {
  data: Workspace
  location: string
  vault: VaultReply
  update: (change: (data: Workspace) => Workspace) => Promise<boolean>
  close: () => void
  notice: (text: string) => void
}
const sections = [
  { id: 'system', label: 'System', Icon: Monitor },
  { id: 'appearance', label: 'Appearance', Icon: Palette },
  { id: 'engine', label: 'Engine', Icon: Settings2 },
  { id: 'data', label: 'Data', Icon: Database },
] as const
const accents = [
  { id: 'violet', label: 'Violet', color: '#7350ff' },
  { id: 'amber', label: 'Amber', color: '#e0a44a' },
  { id: 'teal', label: 'Teal', color: '#2fb3a2' },
] as const
export function SettingsScreen({ data, location, vault, update, close, notice }: Props) {
  const [page, setPage] = useState<SettingsPage>('system')
  const [about, setAbout] = useState<{ version: string; platform: string } | null>(null)
  const file = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    void client()
      .about()
      .then(setAbout)
      .catch(() => setAbout(null))
  }, [])
  const choose = (patch: Partial<Appearance>): void => {
    void update((before) => ({ ...before, appearance: { ...before.appearance, ...patch } }))
  }
  const exportData = (): void => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    if (file.current) {
      file.current.href = url
      file.current.click()
    }
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    notice('Workspace JSON download requested. Import is not available yet.')
  }
  return (
    <section className="settings-screen" aria-label="Settings">
      <nav className="settings-nav" aria-label="Settings sections">
        <label className="eyebrow">THIS APP</label>
        {sections.map(({ id, label, Icon }) => (
          <button
            type="button"
            key={id}
            aria-current={page === id ? 'page' : undefined}
            onClick={() => setPage(id)}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
        <button type="button" className="settings-exit" onClick={close}>
          <X size={14} /> Back to workspace
        </button>
      </nav>
      <div className="settings-panel">
        <div className="settings-heading">
          <h1>{sections.find((section) => section.id === page)?.label}</h1>
          <button className="icon-button" type="button" aria-label="Close settings" onClick={close}>
            <X size={17} />
          </button>
        </div>
        <div className="settings-body">
          {page === 'system' ? (
            <div className="settings-rows">
              <div>
                <span>App</span>
                <p>OddBrain {about?.version || 'reading version…'}</p>
              </div>
              <div>
                <span>Platform</span>
                <p>
                  {isDesktop()
                    ? about?.platform || 'reading…'
                    : 'Browser preview — records stay in this browser'}
                </p>
              </div>
              <div>
                <span>Engine</span>
                <p>
                  Not connected in this UI-first rebuild.
                  <small>No prompts have been sent; there is no model status to report.</small>
                </p>
              </div>
              <div>
                <span>Workspace</span>
                <p className="break-path">
                  {location}
                  <small>Your previous OddBrain data is not overwritten by this rebuild.</small>
                </p>
              </div>
              <div>
                <span>Vault</span>
                <p className="break-path">
                  {vault.ok ? vault.folder : 'No folder selected'}
                  <small>{vault.ok ? `${vault.files.length} readable notes` : vault.error}</small>
                </p>
              </div>
            </div>
          ) : null}
          {page === 'appearance' ? (
            <div className="appearance-settings">
              <h2>Make it yours</h2>
              <p className="quiet">
                These controls change the actual workspace and are saved with your records.
              </p>
              <div className="settings-group">
                <h3>Color mode</h3>
                <div className="choice-row">
                  {(['light', 'dark', 'system'] as const).map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={data.appearance.theme === item ? 'selected' : ''}
                      aria-pressed={data.appearance.theme === item}
                      onClick={() => choose({ theme: item })}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-group">
                <h3>Accent</h3>
                <div className="choice-row">
                  {accents.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={data.appearance.accent === item.id ? 'selected' : ''}
                      aria-pressed={data.appearance.accent === item.id}
                      onClick={() => choose({ accent: item.id })}
                    >
                      <span className="color-swatch" style={{ background: item.color }} />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-group">
                <h3>Conversation width</h3>
                <div className="choice-row">
                  {(['focused', 'comfortable', 'wide'] as const).map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={data.appearance.width === item ? 'selected' : ''}
                      aria-pressed={data.appearance.width === item}
                      onClick={() => choose({ width: item })}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="settings-group">
                <h3>Mascot motion</h3>
                <div className="choice-row">
                  {(['balanced', 'still'] as const).map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={data.appearance.motion === item ? 'selected' : ''}
                      aria-pressed={data.appearance.motion === item}
                      onClick={() => choose({ motion: item })}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <p className="quiet">The operating system’s reduced-motion setting is also honored.</p>
              </div>
            </div>
          ) : null}
          {page === 'engine' ? (
            <div className="empty-card">
              <h2>Engine work is not connected yet.</h2>
              <p>
                This UI-first rebuild does not launch Claude Code, agy, Ollama or any provider. Chats can
                hold your own notes; no Send action claims to reach a model.
              </p>
              <p className="quiet">
                The tested engine implementation remains in Git history, to be reintroduced behind
                permission cards in a later stage.
              </p>
            </div>
          ) : null}
          {page === 'data' ? (
            <div className="data-settings">
              <h2>Your records</h2>
              <p>
                Chats, projects, artifact versions, Trash and appearance are kept in one validated workspace
                file. Your previous app’s data is untouched.
              </p>
              <div className="data-card">
                <Database size={20} />
                <div>
                  <strong>Workspace location</strong>
                  <p className="break-path">{location}</p>
                </div>
              </div>
              <button className="outline-button" type="button" onClick={exportData}>
                <ArrowDownToLine size={15} /> Export workspace JSON
              </button>
              <a ref={file} download="oddbrain-workspace.json" hidden aria-hidden="true">
                Download
              </a>
              <p className="quiet">
                Import and destructive reset are not available in this stage; no existing records will be
                silently replaced.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
