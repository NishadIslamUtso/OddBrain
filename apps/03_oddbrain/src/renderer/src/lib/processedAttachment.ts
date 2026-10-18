import { MAX_MEDIA_BYTES, mediaMime } from '@shared/lib/mediaProcessing'
import type { Attachment } from '@shared/types'
import { MAX_TEXT_LENGTH, readAttachment } from '@shared/lib/attachments'
import type { SelectAttachmentText } from '../ui/AttachmentExcerpt'
import { bridge } from '../platform/bridge'
export async function extractedTextAttachment(text:string,file:Pick<File,'name'|'size'>,options:{signal:AbortSignal;selectText?:SelectAttachmentText}):Promise<Attachment>{
  options.signal.throwIfAborted()
  if(text.length>MAX_TEXT_LENGTH){
    const prefix=`[Owner-selected excerpt from ${file.name}. The rest of the file is not attached.]\n`
    if(!options.selectText)throw Error(`${file.name}: extracted ${text.length.toLocaleString()} characters, above the 12,000-character chat attachment budget. Split or select an excerpt explicitly; nothing was truncated or attached.`)
    text=prefix+await options.selectText(text,file.name,MAX_TEXT_LENGTH-prefix.length,options.signal)
    options.signal.throwIfAborted()
  }
  const decoded=await readAttachment(new File([text],`${file.name}.txt`,{type:'text/plain'}),{verified:true,vision:false,thinking:false})
  return {...decoded,name:file.name,size:file.size}
}
/** Local failure never means network consent. Each endpoint use is confirmed. */
export async function processedAttachment(file: File, options: { signal:AbortSignal; progress(id:string,name:string):void; remoteOnly?:boolean; localFailure?:string; selectText?:SelectAttachmentText }): Promise<Attachment> {
  if(file.size>MAX_MEDIA_BYTES)throw Error(`${file.name}: processed-media limit is 24 MB. Split or compress the file first.`)
  const mime=mediaMime(file.name,file.type), data=new Uint8Array(await file.arrayBuffer())
  options.signal.throwIfAborted()
  const id=crypto.randomUUID();options.progress(id,file.name)
  const cancel=():void=>{void bridge.media.cancel(id)}
  options.signal.addEventListener('abort',cancel,{once:true})
  try {
    let result=options.localFailure?{ok:false as const,error:options.localFailure}:options.remoteOnly?null:await bridge.media.process({id,name:file.name,mime,data,remote:false,operation:'extract'})
    options.signal.throwIfAborted()
    if(!result?.ok){
      const preferences=await bridge.media.read()
      options.signal.throwIfAborted()
      if(!preferences.model)throw Error(`${result && !result.ok?result.error+' ':''}Choose your media provider/model in Settings > Models & API keys > Attachments & dictation. No file was sent to a provider.`)
      if(!window.confirm(`${file.name}\n${result && !result.ok?result.error+'\n':''}Process this file using exactly ${preferences.model}? It may leave this machine. This does not send a chat message. Cancel keeps it unsent.`))throw Error('Media processing cancelled. No file was sent to a provider.')
      options.signal.throwIfAborted()
      result=await bridge.media.process({id,name:file.name,mime,data,remote:true,model:preferences.model,revision:preferences.revision,operation:mime.startsWith('audio/')?'transcribe':'extract'})
    }
    options.signal.throwIfAborted()
    if(!result.ok)throw Error(result.error)
    // Retain decoder/provider attribution and limitations in the source itself.
    const text=`Processed by ${result.source}\n${result.notes.join('\n')}\n\n${result.text}`
    return extractedTextAttachment(text,file,options)
  } finally {options.signal.removeEventListener('abort',cancel)}
}
