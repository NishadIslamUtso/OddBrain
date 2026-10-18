import { useState } from 'react'
import { FileText, FolderOpen, RefreshCw } from 'lucide-react'
import type { VaultReply } from '../../../shared/desktop'

type Props = {
  vault: VaultReply
  desktop: boolean
  choose: () => Promise<void>
  refresh: () => Promise<void>
}
export function VaultScreen({ vault, desktop, choose, refresh }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const files = vault.ok ? vault.files : []
  const file = files.find((item) => item.path === selected) || files[0]
  return (
    <section className="vault-screen" aria-label="Vault">
      <div className="vault-left">
        <div className="screen-heading">
          <div>
            <h1>Vault</h1>
            <p>Markdown notes from a folder you choose.</p>
          </div>
        </div>
        <div className="vault-actions">
          <button
            className="outline-button"
            type="button"
            onClick={() => void choose()}
            disabled={!desktop}
          >
            <FolderOpen size={15} /> Choose folder
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Refresh vault"
            disabled={!desktop || !vault.ok}
            onClick={() => void refresh()}
          >
            <RefreshCw size={15} />
          </button>
        </div>
        {vault.ok ? (
          <>
            <p className="vault-location" title={vault.folder}>
              {vault.folder}
            </p>
            <p className="quiet">
              {files.length} readable note{files.length === 1 ? '' : 's'}
              {vault.truncated ? ' · list capped' : ''}. Linked files and files over 128 KB are not opened.
            </p>
            <ul className="vault-list" data-find-scroll>
              {files.map((note) => (
                <li key={note.path}>
                  <button
                    type="button"
                    className={file?.path === note.path ? 'selected' : ''}
                    onClick={() => setSelected(note.path)}
                  >
                    <FileText size={15} />
                    <span>{note.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="empty-card">
            <FolderOpen size={23} />
            <h2>{desktop ? 'Choose your notes folder.' : 'Folder access needs the desktop app.'}</h2>
            <p>{vault.error}</p>
          </div>
        )}
      </div>
      <div className="vault-right">
        {file ? (
          <>
            <header>
              <FileText size={16} />
              <span>{file.path}</span>
            </header>
            <pre>{file.content}</pre>
          </>
        ) : (
          <div className="inspector-empty">
            No note selected<p>Notes are read from the chosen folder, never generated for this screen.</p>
          </div>
        )}
      </div>
    </section>
  )
}
