import { parentPort, workerData } from 'node:worker_threads'
import { extractLocal } from './local'
// Decoders must never fetch fonts, language packs, scripts or models remotely.
globalThis.fetch = async () => { throw Error('Network access is disabled in the on-device decoder.') }
void extractLocal(workerData.input, {ocr:workerData.ocr,cache:workerData.cache,signal:new AbortController().signal})
  .then(result=>parentPort?.postMessage({ok:true,...result}))
  .catch(error=>parentPort?.postMessage({ok:false,error:error instanceof Error?error.message:'On-device decoder failed.'}))
