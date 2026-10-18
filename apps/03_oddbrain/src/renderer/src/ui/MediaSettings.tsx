import { useEffect, useState } from 'react'
import { DEFAULT_MEDIA, normalizeMedia, type MediaPreferences } from '@shared/lib/mediaProcessing'
import { bridge } from '../platform/bridge'
export default function MediaSettings() {
  const [value,setValue] = useState<MediaPreferences>({...DEFAULT_MEDIA}), [loaded,setLoaded] = useState(false), [busy,setBusy] = useState(false), [note,setNote] = useState('')
  const [models,setModels] = useState<{name:string;label:string}[]>([])
  useEffect(()=>{let live=true;void bridge.media.read().then(result=>{if(live){setValue(result);setLoaded(true)}}).catch(()=>{if(live)setNote('Media settings could not be loaded.')});return()=>{live=false}},[])
  const save = async (): Promise<void> => { setBusy(true);try {const result=await bridge.media.update(normalizeMedia(value));if(!result.ok)throw Error(result.error);setValue(result.preferences!);setNote('Saved. Files use only this model after explicit confirmation.')}catch(e){setNote((e as Error).message)}finally{setBusy(false)} }
  const refresh = async (): Promise<void> => {setBusy(true);try{const result=await bridge.media.models();setModels(result.models);setNote(result.problems.join('\n')||'Models refreshed. Choose one that supports the requested media operation.')}catch(e){setNote((e as Error).message)}finally{setBusy(false)}}
  return <div className="space-y-3 text-[12.5px]">
    <p>PDF text and English OCR run on-device. Office text is decoded without running macros. For audio, dictation, unsupported files or native multimodal interpretation, explicitly choose an enabled provider/model. No automatic substitution.</p>
    <label className="flex items-center gap-2"><input type="checkbox" checked={value.ocr} disabled={!loaded||busy} onChange={e=>setValue({...value,ocr:e.target.checked})}/>Enable bundled on-device English OCR</label>
    <label className="block">Media model (exact provider/model ID)<input aria-label="Media model" list="oddbrain-media-models" className="mt-1 block w-full rounded-lg border border-line bg-bg px-2 py-1.5" placeholder="Choose from your enabled providers" value={value.model} disabled={!loaded||busy} onChange={e=>setValue({...value,model:e.target.value})}/></label>
    <datalist id="oddbrain-media-models">{models.map(model=><option key={model.name} value={model.name}>{model.label}</option>)}</datalist>
    <p className="text-muted">OpenAI/Groq transcription models use their audio endpoint. Gemini uses native audio/video/PDF input; Anthropic supports images/PDF; OpenAI supports images/PDF. A custom OpenAI-compatible local server uses your configured Custom base URL and exact model ID. Its /audio/transcriptions endpoint needs a transcription model, not a chat model.</p>
    <label className="flex items-start gap-2"><input type="checkbox" checked={value.allowNetwork} disabled={!loaded||busy} onChange={e=>setValue({...value,allowNetwork:e.target.checked})}/>Allow confirmed media requests to leave this machine. Provider access and Cloud inference must also be enabled.</label>
    <div className="flex flex-wrap gap-2"><button type="button" className="ob-small-button" disabled={!loaded||busy} onClick={()=>void save()}>Save media settings</button><button type="button" className="ob-small-button" disabled={busy} onClick={()=>void refresh()}>Refresh media models</button></div>
    <p>Limits: 24 MB per processed file, 80 PDF text pages or 20 scanned/OCR pages, and 180,000 extracted characters. Chat allows 12,000 characters per text attachment and 20,000 per combined prompt. Longer extractions open an explicit excerpt selector with a full-text download; nothing is silently cut. Encrypted, DRM-protected or corrupt files cannot be guaranteed readable.</p>
    {note?<p role="status" className="whitespace-pre-wrap text-muted">{note}</p>:null}
  </div>
}
