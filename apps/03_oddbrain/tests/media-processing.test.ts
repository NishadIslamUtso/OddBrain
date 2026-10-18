// @vitest-environment node
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DEFAULT_MEDIA, normalizeMedia, validateMediaInput, mediaMime, type MediaInput } from '../src/shared/lib/mediaProcessing'
import { createMediaProvider, mediaDestination } from '../src/main/media/provider'
import { createMediaService } from '../src/main/media/service'
const input=(patch:Partial<MediaInput>={}):MediaInput=>({id:'file-1',name:'clip.wav',mime:'audio/wav',data:new Uint8Array([1,2,3]),remote:true,model:'openai/transcription-model-from-settings',operation:'transcribe',...patch})
function setup(){
  let preferences={...DEFAULT_MEDIA,model:'openai/transcription-model-from-settings',allowNetwork:true}
  let local=true,cloud=true,key='fixture-key',cloudAccess:Record<string,boolean>={}
  const calls:{url:string;init?:RequestInit}[]=[]
  let answer:unknown={text:'Faithful transcript.'},status=200
  const provider=createMediaProvider({keys:{get:()=>key},preferences:()=>preferences,permissions:()=>({local,browserCapture:false,keepConversations:false,cloud:cloudAccess}),cloudAllowed:()=>cloud,custom:()=>({baseUrl:'http://127.0.0.1:8790/v1'}),env:{},fetchImpl:async(url,init)=>{calls.push({url:String(url),init});return new Response(JSON.stringify(answer),{status})}})
  return {provider,calls,set:(value:{model?:string;allowNetwork?:boolean;local?:boolean;cloud?:boolean;key?:string;access?:Record<string,boolean>;answer?:unknown;status?:number})=>{
    preferences={...preferences,...(value.model!==undefined?{model:value.model}:{}),...(value.allowNetwork!==undefined?{allowNetwork:value.allowNetwork}:{})};if(value.local!==undefined)local=value.local;if(value.cloud!==undefined)cloud=value.cloud;if(value.key!==undefined)key=value.key;if(value.access)cloudAccess=value.access;if(value.answer!==undefined)answer=value.answer;if(value.status)status=value.status
  }}
}
test('media defaults deny network/model substitution; file bounds and MIME normalization are real',()=>{
  assert.deepEqual(normalizeMedia(null),DEFAULT_MEDIA)
  assert.equal(normalizeMedia({allowNetwork:'yes',model:'\nsecret'}).allowNetwork,false)
  assert.equal(normalizeMedia({model:'\nsecret'}).model,'')
  assert.equal(mediaMime('recording.M4A',''), 'audio/mp4')
  assert.throws(()=>validateMediaInput(input({data:new Uint8Array(24*1024**2+1)})),/24 MB/)
  assert.throws(()=>validateMediaInput(input({model:''})),/confirmed exact/)
  assert.throws(()=>mediaDestination('http://external.example/v1'),/HTTPS/)
  assert.throws(()=>mediaDestination('https://key:secret@example.com'),/credentials/)
})
test('every privacy gate blocks bytes before a request; no alternative model/provider is called',async()=>{
  for(const blocked of [{allowNetwork:false},{cloud:false},{access:{openai:false}},{key:''}]){
    const s=setup();s.set(blocked);await assert.rejects(s.provider(input(),new AbortController().signal),/Nothing was sent/);assert.equal(s.calls.length,0)
  }
  const changed=setup();changed.set({model:'gemini/other-model'});await assert.rejects(changed.provider(input(),new AbortController().signal),/changed after confirmation/);assert.equal(changed.calls.length,0)
})
test('audio uses the exact selected model in multipart, with no key exposed in body or URL',async()=>{
  const s=setup(),result=await s.provider(input(),new AbortController().signal)
  assert.equal(result.text,'Faithful transcript.');assert.equal(s.calls.length,1)
  assert.equal(s.calls[0].url,'https://api.openai.com/v1/audio/transcriptions')
  assert.equal((s.calls[0].init!.body as FormData).get('model'),'transcription-model-from-settings')
  assert.equal(s.calls[0].init!.redirect,'error')
  assert.equal((s.calls[0].init!.headers as Record<string,string>).Authorization,'Bearer fixture-key')
})
test('native Gemini retains selected audio/video model; tools are never supplied',async()=>{
  const s=setup();s.set({model:'gemini/selected-gemini',answer:{candidates:[{finishReason:'STOP',content:{parts:[{text:'Decoded native video and speech.'}]}}]}})
  const result=await s.provider(input({name:'clip.mp4',mime:'video/mp4',operation:'extract',model:'gemini/selected-gemini'}),new AbortController().signal)
  assert.match(s.calls[0].url,/models\/selected-gemini:generateContent$/)
  const body=JSON.parse(String(s.calls[0].init!.body));assert.equal(body.contents[0].parts[1].inlineData.mimeType,'video/mp4');assert.equal(body.tools,undefined);assert.match(result.text,/speech/)
})
test('Anthropic document transport and OpenAI PDF responses are separate verified shapes',async()=>{
  const a=setup();a.set({model:'anthropic/exact-claude',answer:{content:[{type:'text',text:'Document text'}]}})
  await a.provider(input({name:'source.pdf',mime:'application/pdf',operation:'extract',model:'anthropic/exact-claude'}),new AbortController().signal)
  assert.equal(JSON.parse(String(a.calls[0].init!.body)).messages[0].content[0].type,'document')
  const b=setup();b.set({model:'openai/exact-vision',answer:{output:[{content:[{text:'PDF text'}]}]}})
  await b.provider(input({name:'source.pdf',mime:'application/pdf',operation:'extract',model:'openai/exact-vision'}),new AbortController().signal)
  assert.match(b.calls[0].url,/\/responses$/);assert.equal(JSON.parse(String(b.calls[0].init!.body)).model,'exact-vision')
})
test('custom loopback transcription needs local access and provider access, not an unrelated cloud key',async()=>{
  const s=setup();s.set({model:'custom/chosen-whisper',allowNetwork:false,cloud:false,key:''})
  await s.provider(input({model:'custom/chosen-whisper'}),new AbortController().signal)
  assert.equal(s.calls[0].url,'http://127.0.0.1:8790/v1/audio/transcriptions')
  const blocked=setup();blocked.set({model:'custom/chosen-whisper',local:false});await assert.rejects(blocked.provider(input({model:'custom/chosen-whisper'}),new AbortController().signal),/disabled/);assert.equal(blocked.calls.length,0)
})
test('unsupported transports, provider errors, partial output and empty output do not silently succeed',async()=>{
  const unsupported=setup();unsupported.set({model:'deepseek/text-only'});await assert.rejects(unsupported.provider(input({model:'deepseek/text-only'}),new AbortController().signal),/no verified transcription/);assert.equal(unsupported.calls.length,0)
  for(const value of [{status:403},{answer:{}},{answer:{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'partial'}]}}]}}]){const s=setup();s.set(value);await assert.rejects(s.provider(input(),new AbortController().signal))}
})
test('local decoder failures never automatically call a provider',async()=>{
  const root=await mkdtemp(join(tmpdir(),'media-service-'));let network=0
  try{
    const service=createMediaService({file:join(root,'media.json'),cache:root,models:async()=>({models:[],problems:[]}),local:async()=>{throw Error('corrupt PDF')},provider:async()=>{network++;return{text:'text',source:'provider',notes:[]}}})
    const result=await service.process(input({remote:false,model:undefined}),'window-a');assert.equal(result.ok,false);assert.equal(network,0)
    assert.equal(service.update({model:'openai/explicit',allowNetwork:true}).ok,true)
    const reopened=createMediaService({file:join(root,'media.json'),cache:root,models:async()=>({models:[],problems:[]}),provider:async()=>({text:'x',source:'explicit',notes:[]})});assert.equal(reopened.read().model,'openai/explicit')
  }finally{await rm(root,{recursive:true,force:true})}
})
test('cancellation is window-owned, duplicate IDs cannot erase running cancellation, preference changes abort work',async()=>{
  const root=await mkdtemp(join(tmpdir(),'media-cancel-'))
  try{
    const service=createMediaService({file:join(root,'prefs.json'),cache:root,models:async()=>({models:[],problems:[]}),local:async(_input,{signal})=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true})}),provider:async()=>({text:'x',source:'fixture',notes:[]})})
    const first=service.process(input({remote:false}),'a')
    assert.equal((await service.process(input({remote:false}),'a')).ok,false)
    service.cancel('b','file-1')
    service.cancel('a','file-1')
    assert.equal((await first).ok,false)
    const second=service.process(input({remote:false}),'a');service.update(DEFAULT_MEDIA);assert.equal((await second).ok,false)
  }finally{await rm(root,{recursive:true,force:true})}
})
test('settings revisions bind confirmation to the destination, including custom endpoint/access changes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'media-revision-'));let sent=0
  try{
    const service=createMediaService({file:join(root,'prefs.json'),cache:root,models:async()=>({models:[],problems:[]}),provider:async()=>{sent++;return{text:'transcript',source:'test transport',notes:[]}}})
    const old=service.read().revision
    service.invalidate()
    assert.equal((await service.process(input({revision:old}),'owner')).ok,false)
    assert.equal(sent,0)
    assert.equal((await service.process(input({revision:service.read().revision}),'owner')).ok,true)
    assert.equal(sent,1)
    const saved=service.read().revision;service.update({...DEFAULT_MEDIA,model:'custom/exact-model'})
    assert.equal((await service.process(input({revision:saved}),'owner')).ok,false)
    assert.equal(sent,1)
  }finally{await rm(root,{recursive:true,force:true})}
})
test('Anthropic, Gemini and chat safety/token stops are not returned as complete source text',async()=>{
  for(const answer of [{stop_reason:'max_tokens',content:[{text:'partial'}]},{candidates:[{finishReason:'SAFETY',content:{parts:[{text:'partial'}]}}]},{choices:[{finish_reason:'content_filter',message:{content:'partial'}}]}]){
    const s=setup();s.set({answer});await assert.rejects(s.provider(input(),new AbortController().signal),/partial output was not presented as complete/)
  }
})
test('video through a transcription endpoint is explicitly speech-only, not a claimed visual analysis',async()=>{
  const s=setup();const result=await s.provider(input({name:'clip.mp4',mime:'video/mp4',operation:'extract'}),new AbortController().signal)
  assert.match(result.notes.join(' '),/Video frames and non-speech sounds were not described/)
})
