import { useState } from 'react'
import { bridge, isDemo } from '../platform/bridge'
export default function ExtensionInstall({ onPermissions }: { onPermissions: () => void }) {
  const [busy, setBusy] = useState(false), [note, setNote] = useState('')
  const save = async (destination: 'downloads' | 'choose') => {
    setBusy(true); setNote('')
    try { const result = await bridge.extension.export(destination); setNote(result.answer) }
    catch { setNote('The extension could not be exported. Nothing is reported as installed.') }
    finally { setBusy(false) }
  }
  return <section className="ob-extension-install" aria-label="Install browser companion">
    <h3>Get the browser companion</h3><p className="ob-control-scope">Included with OddBrain. Save the folder once, then let Chrome or Edge load it.</p>
    <div className="ob-inline-actions"><button type="button" className="ob-small-button" disabled={busy} onClick={() => void save('downloads')}>Save extension to Downloads</button><button type="button" className="ob-small-button" disabled={busy} onClick={() => void save('choose')}>Choose extension folder…</button><button type="button" onClick={onPermissions}>Browser capture permissions</button></div>
    {isDemo && <p className="ob-control-scope">File export needs the desktop app; this browser preview cannot install an extension.</p>}
    {note && <p className="ob-control-scope break-words" role="status">{note}</p>}
    <details><summary>How to connect it</summary><ol className="ob-extension-steps">
      <li>Save the extension folder above. Keep it somewhere permanent.</li>
      <li>Open <code>chrome://extensions</code> or <code>edge://extensions</code>. Turn on <strong>Developer mode</strong>.</li>
      <li>Choose <strong>Load unpacked</strong>, then the exported folder containing <code>manifest.json</code>.</li>
      <li>Keep OddBrain open with a vault selected. Enable browser capture under <strong>Privacy &amp; access → Agent access</strong> (or use the button above). Then return here and copy the pairing token from <strong>Agent access</strong> below.</li>
      <li>Open the extension → <strong>Settings → Connected app</strong>. Paste the token and choose <strong>Save &amp; test connection</strong>. Match the port shown by the app if you changed it.</li>
      <li>Allow the sites you want and open a conversation. Check progress before closing a page, especially while attachments are still downloading.</li>
    </ol><p className="ob-control-scope">The browser requires this one-time confirmation. Copying the folder does not grant permissions or capture anything. It saves accessible conversation content, not an entire account or browser history. To update with waiting captures, leave the extension installed: copy the exported files into its existing loaded folder, then click Reload. Do not remove it or rotate pairing before updating.</p></details>
  </section>
}
