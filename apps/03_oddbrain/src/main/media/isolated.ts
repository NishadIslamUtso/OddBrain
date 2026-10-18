import { Worker } from 'node:worker_threads'
import { join } from 'node:path'
import type { MediaInput } from '../../shared/lib/mediaProcessing'
/** Killable, memory-bounded worker. It receives file bytes, never provider keys. */
export function extractIsolated(input: MediaInput, options: { ocr:boolean;cache:string;signal:AbortSignal }): Promise<{text:string;notes:string[]}> {
  options.signal.throwIfAborted()
  return new Promise((resolve,reject)=>{
    const workerPath=join(__dirname,'mediaWorker.js').replace(/app\.asar([/\\])/, 'app.asar.unpacked$1')
    // Decoder workers receive no API keys, access tokens or inherited Node flags.
    const env:Record<string,string>={}
    for(const key of ['SystemRoot','WINDIR','TEMP','TMP','TMPDIR'])if(process.env[key])env[key]=process.env[key]!
    const worker = new Worker(workerPath, { env,execArgv:[],workerData:{input,ocr:options.ocr,cache:options.cache}, resourceLimits:{maxOldGenerationSizeMb:256,maxYoungGenerationSizeMb:32} })
    let settled=false
    const finish = (error?:Error,result?:{text:string;notes:string[]}):void=>{
      if(settled)return;settled=true;options.signal.removeEventListener('abort',cancel);void worker.terminate()
      if(error)reject(error);else resolve(result!)
    }
    const cancel=():void=>finish(Error('Media decoding was cancelled.'))
    options.signal.addEventListener('abort',cancel,{once:true})
    if(options.signal.aborted){cancel();return}
    worker.once('message',(message:{ok:boolean;text:string;notes:string[];error?:string})=>message.ok?finish(undefined,message):finish(Error(message.error||'On-device decoder failed.')))
    worker.once('error',error=>finish(error))
    worker.once('exit',code=>{if(!settled)finish(Error(`The on-device decoder stopped (code ${code}). The file may be corrupt or exceed its memory budget.`))})
  })
}
