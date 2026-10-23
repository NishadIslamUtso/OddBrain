import { useEffect, useState } from 'react'
import { DEFAULT_MEDIA, type MediaPreferences } from '@shared/lib/mediaBridge'
import { CLOUD_PROVIDERS } from '@shared/lib/providers'
import { bridge, isDemo } from '../platform/bridge'

export default function MediaSettings() {
  const [value, setValue] = useState<MediaPreferences>({ ...DEFAULT_MEDIA })
  const [note, setNote] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { void bridge.media.read().then(setValue).catch(() => setNote('Voice and file settings could not be read.')) }, [])
  const patch = (part: Partial<MediaPreferences>): void => setValue(old => ({ ...old, ...part }))
  const save = async (): Promise<void> => {
    setBusy(true)
    try { setValue(await bridge.media.update(value)); window.dispatchEvent(new Event('app:media-settings-changed')); setNote(isDemo ? 'Preview preferences only; no provider calls are available here.' : 'Saved. Existing decoding and recording operations were cancelled.') }
    catch (error) { setNote((error as Error).message) } finally { setBusy(false) }
  }
  const provider = (key: 'provider' | 'transcriptionProvider', ids: string[]) => <select aria-label={key === 'provider' ? 'File extraction provider' : 'Transcription provider'} value={value[key]} onChange={event => patch({ [key]: event.target.value })}><option value="">None selected</option>{CLOUD_PROVIDERS.filter(p => ids.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
  return <div className="ob-media-settings space-y-5">
    <section><h3>File extraction</h3><p className="ob-control-scope">Files are read locally first. Uploads require approval for the selected provider and model.</p>
      <label className="ob-form-line">Provider {provider('provider', ['anthropic', 'openai', 'gemini', 'custom'])}</label>
      <label className="ob-form-line">Exact model <input aria-label="File extraction model" value={value.model} onChange={event => patch({ model: event.target.value })} placeholder="Model ID from your provider" /></label>
      <details className="ob-setting-help"><summary>Supported formats</summary><p>Anthropic/OpenAI: PDF and supported images. Gemini: PDF, images, audio and video. Custom: Responses-compatible endpoint. Model limits apply; no model is substituted. Manage keys in Models & API keys and permissions in Agent access.</p></details>
    </section>
    <section><h3>Dictation & transcription</h3>
      <label className="ob-form-line">Dictation mode <select aria-label="Dictation mode" value={value.dictation} onChange={event => patch({ dictation: event.target.value as MediaPreferences['dictation'] })}><option value="local">Offline Windows recognition</option><option value="provider">Record, then use my transcription provider</option></select></label>
      <label className="ob-form-line">Recognition language <input aria-label="Recognition language" value={value.language} onChange={event => patch({ language: event.target.value })} /></label>
      <label className="ob-form-line">Provider {provider('transcriptionProvider', ['openai', 'groq', 'gemini', 'custom'])}</label>
      <label className="ob-form-line">Exact model <input aria-label="Transcription model" value={value.transcriptionModel} onChange={event => patch({ transcriptionModel: event.target.value })} placeholder="Your chosen transcription model" /></label>
      <p className="ob-control-scope">Dictate starts recording. Stop uploads to the selected provider; Cancel discards. Maximum 60 seconds. Offline mode requires an installed Windows recognition language.</p>
    </section>
    <section><h3>Local audio/video decoder</h3><p className="ob-control-scope">Uses an installed FFmpeg. Nothing is downloaded automatically.</p>
      <p className="break-all text-muted">{value.ffmpeg || 'Automatic: ffmpeg on PATH'}</p>
      <div className="ob-inline-actions"><button type="button" disabled={isDemo || busy} onClick={() => void bridge.media.chooseDecoder().then(setValue).catch(error => setNote(String(error)))}>Choose FFmpeg executable…</button><button type="button" onClick={() => patch({ ffmpeg: '' })}>Use automatic detection</button></div>
    </section>
    <section><h3>Optional DeepSeek-OCR-2</h3><p className="ob-control-scope">Owner-installed local adapter only. OddBrain does not download a model, assume GPU compatibility, or route this through the DeepSeek text API. Selecting an adapter runs its capability check and pins its executable hash.</p><p className="break-all text-muted">{value.ocrAdapterLabel || 'No reviewed OCR adapter selected.'}</p><div className="ob-inline-actions"><button type="button" disabled={isDemo || busy} onClick={() => void bridge.media.chooseOcrAdapter().then(setValue).catch(error => setNote(String(error)))}>Choose and review adapter…</button><button type="button" onClick={() => patch({ ocrAdapter: '', ocrAdapterSha256: '', ocrAdapterLabel: '' })}>Disable OCR adapter</button></div></section>
    <section><h3>Read aloud</h3><p className="ob-control-scope">Listen reads completed replies with an installed on-device voice. No network voice is used.</p></section>
    <button type="button" className="ob-small-button" disabled={busy} onClick={() => void save()}>Save voice & file settings</button>
    {note ? <p role="status" className="ob-control-scope">{note}</p> : null}
  </div>
}
