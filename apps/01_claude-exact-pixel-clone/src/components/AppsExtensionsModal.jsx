import { Smartphone, Check, X, Eye, Bot, Blocks } from 'lucide-react'
import { DesktopIcon, JetBrainsIcon, SlackIcon, TerminalIcon, VSCodeIcon } from './IntegrationIcons.jsx'
import Dialog from './Dialog.jsx'
const integrations = [[TerminalIcon, 'Terminal'], [VSCodeIcon, 'VS Code'], [DesktopIcon, 'Desktop app'], [JetBrainsIcon, 'JetBrains'], [SlackIcon, 'Slack'], [Smartphone, 'Mobile']]

/** What is actually connected right now, checked live rather than described. */
function Status({ ok, okLabel, offLabel }) {
  return <span className={`local-status ${ok ? 'on' : 'off'}`}>{ok ? <Check size={11} /> : <X size={11} />}{ok ? okLabel : offLabel}</span>
}

export default function AppsExtensionsModal({ onClose, notify, models, vision, vaultOk, vaultPath, subAgents, onAgents }) {
  const running = subAgents?.agents?.filter(agent => agent.status === 'done').length || 0
  return <Dialog title="Apps and extensions" onClose={onClose} className="apps-dialog" labelledBy="apps-title">
    <div className="apps-content">
      <h3>Do more with AI ASSistant, everywhere you work</h3>

      {/* The screenshot-matched card stays as it was; the two integrations that
          genuinely exist in this build are listed underneath with live status. */}
      <div className="local-status-grid">
        <div className="local-status-card">
          <header><Blocks size={14} />This computer</header>
          <p><span>Ollama</span><Status ok={models?.status === 'online'} okLabel={`${models?.models?.length || 0} local model${models?.models?.length === 1 ? '' : 's'}`} offLabel="offline on :11434" /></p>
          <p><span>AI-Brain vault</span><Status ok={vaultOk} okLabel="writing to Markdown" offLabel="API offline on :8765" /></p>
          <p><span>Vision bridge</span><Status ok={vision?.imageSupport !== 'none'} okLabel={vision?.imageSupport === 'direct' ? `${models?.model} sees images` : `via ${vision?.bridgeModel}`} offLabel="no verified vision model" /></p>
          <p><span>Sub agents</span><Status ok={Boolean(subAgents?.agents?.length)} okLabel={`${subAgents?.agents?.length || 0} defined${running ? ` · ${running} finished` : ''}`} offLabel="none defined yet" /></p>
          <footer>{vaultPath ? `Vault: ${vaultPath}` : 'Vault path appears once the local API answers.'}</footer>
          <div className="local-status-actions">
            <button className="secondary-button" onClick={() => models?.refresh()}>Re-check services</button>
            {onAgents && <button className="secondary-button" onClick={() => { onClose(); onAgents() }}><Bot size={13} />Open sub agents</button>}
          </div>
        </div>
        <div className="local-status-card">
          <header><Eye size={14} />Nothing leaves this computer</header>
          <p className="local-status-note">Browser calls go to this app’s own origin and are proxied to <code>127.0.0.1</code>. The proxy refuses model pull/delete and arbitrary vault paths, so no button here can start a download or write a file you did not ask for.</p>
          <p className="local-status-note">Cloud model entries returned by Ollama are filtered out and are never selectable.</p>
        </div>
      </div>

      <div className="app-feature-card">
        <div className="app-feature-copy"><h4>AI ASSistant Code</h4><p>Build, debug, and ship from your terminal<br />or IDE.</p><button className="white-button" onClick={() => notify('AI ASSistant Code is not bundled or connected. This local app uses Ollama, not a hosted subscription.')}>Upgrade</button><small>Or try it in</small><div className="integration-chips">{integrations.map(([Icon, label]) => <button key={label} onClick={() => notify(`${label} integration is not connected in this local build.`)}><Icon size={18} />{label}</button>)}</div></div>
        <div className="terminal-illustration" aria-label="AI ASSistant Code illustration, not a running terminal"><div className="terminal-title"><i /><i /><i /></div><div className="terminal-lines"><p><b>›</b> Fix the auth bug in signup flow</p><p><b>✓</b> Reading src/auth/signup.ts</p><p><b>✓</b> Found the issue in validateToken()</p><p><b>✓</b> Editing src/auth/validateToken.ts</p><div className="terminal-file"><header>src/auth/validateToken.ts</header><div className="diff-remove">- if (token == null) return false;</div><div className="diff-add">+ if (!token || token.length &lt; 32) return false;</div></div><p className="cooking">* Cooking…</p></div><svg className="pixel-mascot" width="48" height="38" viewBox="0 0 48 38" aria-hidden="true"><path fill="currentColor" d="M8 2h28v7h8v9h-6v16h-5V23H14v11H9V18H2V9h6z" /><path fill="#242424" d="M13 6h4v4h-4zm15 0h4v4h-4z" /></svg></div>
      </div>
      <div className="apps-bottom-grid"><div className="app-small-card"><h4>Microsoft 365</h4><p>Analyze data, build presentations, draft documents, and triage your inbox with AI ASSistant alongside you.</p><small>Not connected. No documents or account data are accessed.</small></div><div className="app-small-card"><h4>Chrome</h4><p>Keep context close while you browse, with the local AI ASSistant extension.</p><button className="secondary-button" onClick={() => notify('On Windows: open chrome://extensions, turn on Developer mode, choose Load unpacked, then select the repository’s extension folder. The vault API must be running. No external account is required.')}>Set up local extension</button><small>Capture, blacklist and inline suggestions need Chrome verification.</small></div></div>
      <p className="apps-disclaimer">Screenshot-matched interface. External integrations are not part of this local app; nothing is installed or sent by clicking these controls.</p>
    </div>
  </Dialog>
}
