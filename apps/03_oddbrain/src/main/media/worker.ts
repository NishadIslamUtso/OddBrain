import { parentPort, workerData } from 'node:worker_threads'
import { decodeDocument } from './documents'
void decodeDocument(workerData.name, Buffer.from(workerData.bytes)).then(result => parentPort?.postMessage(result)).catch(error => parentPort?.postMessage({ ok: false, name: workerData.name, error: String(error.message || error) }))
