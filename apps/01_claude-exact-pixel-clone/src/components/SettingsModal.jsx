import { useState } from 'react'
import { Settings, CircleUserRound, Shield, CreditCard, Briefcase, History, Bell, MoonStar, Code2, Monitor, Plug, Wrench, ScrollText, Blocks, Search, X, Sun, Moon, Eye, Gauge } from 'lucide-react'
import Dialog from './Dialog.jsx'
import BlacklistManager from './BlacklistManager.jsx'
import Connectors from './Connectors.jsx'
import { DEFAULT_PROFILE } from '../lib/profile.js'
import AvatarPicker from './AvatarPicker.jsx'
import { INFERENCE_PROFILES, resolveInference, vramWarning } from '../lib/inference.js'
const navigation = [
  ['Settings', [['General', Settings], ['Account', CircleUserRound], ['Privacy', Shield], ['Billing', CreditCard], ['Capabilities', Briefcase], ['Memory', History], ['Reflect', Bell], ['Time and focus', MoonStar], ['AI ASSistant Code', Code2]]],
  ['This computer', [['System', Monitor], ['Performance', Gauge], ['Vision', Eye], ['Extensions', Plug], ['Developer', Wrench]]],
  ['Customize', [['Skills', ScrollText], ['Connectors', Blocks]]],
]
function Segments({ label, options, value, onChange, icons }) {
  return <div className="segmented" role="group" aria-label={label}>{options.map((option, index) => <button key={option} aria-label={option} aria-pressed={value === option} className={value === option ? 'selected' : ''} onClick={() => onChange(option)}>{icons ? icons[index] : option}</button>)}</div>
}
function Row({ label, description, children }) {
  return <div className={`settings-row ${description ? 'with-description' : ''}`}><div><div>{label}</div>{description && <p>{description}</p>}</div>{children}</div>
}
function Select({ label, value, options, onChange }) {
  return <select aria-label={label} value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select>
}
export default function SettingsModal({ settings, setSettings, onClose, onApps, onVault, models, vision, visionModel, setVisionModel, vaultOk, vaultPath, onRecheck, profile, setProfile, inference, setInference, notify }) {
  const [active, setActive] = useState('General')
  const [search, setSearch] = useState('')
  const update = (key, value) => setSettings(previous => ({ ...previous, [key]: value }))
  return <Dialog onClose={onClose} className="settings-dialog" labelledBy="settings-title">
    <aside className="settings-nav">
      <label className="settings-search"><Search size={17} /><input aria-label="Search settings" placeholder="Search" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <nav aria-label="Settings sections">{navigation.map(([heading, items]) => <div key={heading}><p>{heading}</p>{items.filter(([name]) => name.toLowerCase().includes(search.toLowerCase())).map(([name, Icon]) => <button key={name} onClick={() => setActive(name)} className={active === name ? 'selected' : ''} aria-current={active === name ? 'page' : undefined}><Icon size={18} />{name}</button>)}</div>)}</nav>
    </aside>
    <div className="settings-main">
      <button className="icon-button settings-close" aria-label="Close settings" onClick={onClose}><X size={19} /></button>
      {active === 'General' ? <>
        <h2 id="settings-title">Appearance</h2>
        <Row label="Theme"><Segments label="Theme" options={['system', 'light', 'dark']} icons={[<Monitor key="system" size={19} />, <Sun key="light" size={19} />, <Moon key="dark" size={19} />]} value={settings.theme} onChange={value => update('theme', value)} /></Row>
        <Row label="Chat font"><Select label="Chat font" options={['Anthropic Serif', 'System', 'Monospace']} value={settings.chatFont} onChange={value => update('chatFont', value)} /></Row>
        <Row label="Transcript text size" description="Size of the conversation transcript text."><Segments label="Transcript text size" options={['Small', 'Medium', 'Large']} value={settings.transcriptSize} onChange={value => update('transcriptSize', value)} /></Row>
        <Row label="Transcript width" description="Maximum width of the transcript and composer columns."><Segments label="Transcript width" options={['Narrow', 'Medium', 'Wide']} value={settings.transcriptWidth} onChange={value => update('transcriptWidth', value)} /></Row>
        <Row label="Motion" description="Reduce animation in streaming responses and other interface elements."><Segments label="Motion" options={['System', 'Reduced']} value={settings.motion} onChange={value => update('motion', value)} /></Row>
        <h2 className="voice-heading">Voice</h2>
        <Row label="Language"><Select label="Voice language" options={['English', 'Bengali']} value={settings.voiceLanguage} onChange={value => update('voiceLanguage', value)} /></Row>
        <Row label="Style"><Select label="Voice style" options={['Buttery', 'Calm']} value={settings.voiceStyle} onChange={value => update('voiceStyle', value)} /></Row>
        <Row label="Speed"><Select label="Voice speed" options={['Slow', 'Normal', 'Fast']} value={settings.voiceSpeed} onChange={value => update('voiceSpeed', value)} /></Row>
        <p className="settings-footnote">Voice preferences are saved locally. A speech engine is not connected in this build.</p>
      </> : <>
        <h2 id="settings-title">{active}</h2>
        {active === 'Account' && <div className="settings-copy"><h3>{profile.name}</h3><p>{profile.email || 'No email set — nothing is sent anywhere.'}</p><p>This is your local profile. It is how AI ASSistant greets you. No external sign-in is used.</p>
          <div className="settings-form">
            <AvatarPicker profile={profile} onChange={patch => setProfile({ ...profile, ...patch })} notify={notify} />
            <label><span>Your name</span><input aria-label="Your name" value={profile.name} maxLength={40} placeholder="Friend" onChange={event => setProfile({ ...profile, name: event.target.value })} /></label>
            <label><span>Email <small>optional</small></span><input aria-label="Email" type="email" value={profile.email} maxLength={120} placeholder="you@example.com" onChange={event => setProfile({ ...profile, email: event.target.value })} /></label>
            <label><span>Tagline <small>optional, shown under the greeting</small></span><input aria-label="Tagline" value={profile.tagline} maxLength={80} placeholder="What are you working on?" onChange={event => setProfile({ ...profile, tagline: event.target.value })} /></label>
            <footer><button className="secondary-button" onClick={() => { setProfile(DEFAULT_PROFILE); notify('Profile reset to defaults.') }}>Reset</button></footer>
          </div></div>}
        {active === 'Privacy' && <><p className="settings-copy">Local-first. Excluded sources are denied at the vault API. Passwords, cookies, tokens, payment fields and unsent drafts must never be captured. Browser-side scope sync still needs end-to-end verification.</p><BlacklistManager /></>}
        {active === 'Billing' && <p className="settings-copy">Local mode is free. There is no subscription, billing connection or upgrade in this app.</p>}
        {active === 'Capabilities' && <div className="settings-copy"><p>Selected model: <strong>{models.model}</strong></p><p>Text chat and text/code attachments run locally.</p><p>Vision: {models.capabilities.vision ? 'verified by Ollama /api/show' : 'unavailable or not verified'}</p><p>Thinking: {models.capabilities.thinking ? 'verified by Ollama /api/show' : 'unavailable or not verified'}</p><p>Model capabilities are not inferred from names. This UI does not make a small local model as capable as a large hosted one.</p></div>}
        {active === 'Vision' && <><p className="settings-copy">A text-only model cannot see a picture. With the bridge, an installed <em>vision</em> model describes the image first and the description is what {models.model} reads. The picture never leaves this computer and the transcript always names the model that looked at it.</p>
          <Row label="Bridge model" description="Only models that reported vision through Ollama /api/show are listed."><Select label="Vision bridge model" value={visionModel} options={['auto', ...vision.visionModels.map(entry => entry.name)]} onChange={value => setVisionModel(value === 'auto' ? '' : value)} /></Row>
          <div className="settings-copy"><p>{vision.probing ? 'Checking installed models…' : vision.visionModels.length ? `Verified vision models: ${vision.visionModels.map(entry => entry.name).join(', ')}` : 'No installed model has reported vision support yet.'}</p>
          <p>Images are usable right now: <strong>{vision.imageSupport === 'direct' ? `yes, ${models.model} sees them directly` : vision.imageSupport === 'bridge' ? `yes, via ${vision.bridgeModel}` : 'no — attach an image and the app will say so rather than dropping it'}</strong></p>
          <button className="secondary-button" onClick={() => { vision.visionModels.forEach(entry => vision.forget(entry.name)); models.refresh() }}>Re-check model capabilities</button></div></>}
        {active === 'Memory' && <div className="settings-copy"><p>Canonical memory: the Markdown files in vault/AI-Brain. The app does not create a second authoritative database.</p><button className="secondary-button" onClick={() => { onClose(); onVault() }}>Open AI-Brain vault</button></div>}
        {active === 'System' && <div className="settings-copy"><p>AI ASSistant 0.2.0 · Vite web build</p><p>Ollama: 127.0.0.1:11434</p><p>Vault driver: 127.0.0.1:8765</p><p>Browser requests are proxied through this app. A native Windows title bar and menu will require the pending Electron wrapper.</p></div>}
        {active === 'Extensions' && <div className="settings-copy"><p>The local MV3 collector lives in the repository’s extension folder. Chrome installation and capture still require Windows/Chrome testing.</p><button className="secondary-button" onClick={onApps}>Apps and extensions</button></div>}
        {active === 'Developer' && <div className="settings-copy"><p>npm test · npm run build · npm run test:e2e</p><p>No native build tools or model downloads are needed. If Ollama is offline, run your existing Ollama installation and refresh the model list.</p></div>}
        {active === 'Performance' && <div className="settings-copy">
          <h3>Memory profile</h3>
          <p>How much of your graphics card the local model is allowed to use. The right context size matters more than anything else: too large and the model spills out of VRAM and every token crawls.</p>
          <div className="settings-form">
            <label><span>Profile</span><select aria-label="Memory profile" value={inference.profile} onChange={event => {
              const next = INFERENCE_PROFILES.find(entry => entry.id === event.target.value)
              setInference(next.id === 'custom' ? { profile: 'custom', customOptions: {}, keepAlive: next.keepAlive } : { profile: next.id })
            }}>{INFERENCE_PROFILES.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
            {INFERENCE_PROFILES.find(entry => entry.id === inference.profile)?.hint && <p className="settings-hint">{INFERENCE_PROFILES.find(entry => entry.id === inference.profile).hint}</p>}
            {inference.profile === 'custom' && <div className="settings-form">
              {[['num_ctx', 'Context size (tokens)'], ['num_batch', 'Batch size'], ['num_predict', 'Max reply tokens'], ['num_gpu', 'GPU layers (0 = CPU only)']].map(([key, text]) => <label key={key}><span>{text}</span><input aria-label={text} type="number" inputMode="numeric" value={resolveInference(inference).options[key] ?? ''} onChange={event => setInference({ ...inference, profile: 'custom', customOptions: { ...(inference.customOptions || {}), [key]: event.target.value } })} /></label>)}
            </div>}
            <p className="settings-hint">In use: {Object.entries(resolveInference(inference).options).map(([key, value]) => `${key}=${value}`).join(', ') || 'Ollama defaults'}</p>
            {vramWarning(inference) && <p className="settings-warning">{vramWarning(inference)}</p>}
          </div>
        </div>}
        {active === 'Connectors' && <Connectors models={models} vaultOk={vaultOk} vaultPath={vaultPath} onRecheck={onRecheck} onVault={onVault} />}
        {!['Account', 'Privacy', 'Billing', 'Capabilities', 'Memory', 'System', 'Performance', 'Extensions', 'Developer', 'Connectors'].includes(active) && <p className="settings-copy">{active} is a screenshot-matched navigation entry. Its runtime integration is not implemented yet; no background action is enabled.</p>}
      </>}
    </div>
  </Dialog>
}
