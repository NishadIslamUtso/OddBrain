import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { configBytes, commitConfigs } from '../engine/configTransaction'
export type ApprovalSigner = { available(): void; sign(value: string): string; verify(value: string, signature: string): boolean }
/** Authenticity for persisted scheduling state. OS-key-store protection is
 * required; never silently fall back to a plaintext unattended approval key. */
export function createApprovalSigner(file: string, crypto: { available(): boolean; encrypt(value: string): Buffer; decrypt(value: Buffer): string }): ApprovalSigner {
  let cached: { sealed: Buffer; key: Buffer } | undefined
  const available = () => { if (!crypto.available()) throw Error('OS-protected approval storage is unavailable. Unattended command schedules cannot be enabled here; manual reviewed workflows remain available.') }
  const key = (create: boolean): Buffer => {
    available(); const bytes = configBytes(file)
    if (bytes) {
      if (cached?.sealed.equals(bytes)) return cached.key
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      if (value?.version !== 1 || typeof value.sealed !== 'string') throw Error('Schedule approval key is damaged. It was not replaced.')
      const plain = crypto.decrypt(Buffer.from(value.sealed, 'base64'))
      if (!/^[a-f0-9]{64}$/.test(plain)) throw Error('Schedule approval key could not be verified.')
      const valueKey = Buffer.from(plain, 'hex'); cached = { sealed: Buffer.from(bytes), key: valueKey }; return valueKey
    }
    if (!create) throw Error('The original schedule approval key is missing. No schedule was resumed.')
    const plain = randomBytes(32).toString('hex'), text = JSON.stringify({ version: 1, sealed: crypto.encrypt(plain).toString('base64') })
    commitConfigs([{ path: file, text, expected: null }]); return Buffer.from(plain, 'hex')
  }
  return { available, sign: value => createHmac('sha256', key(true)).update(value).digest('hex'), verify(value, signature) {
    if (!/^[a-f0-9]{64}$/.test(signature)) return false
    const expected = createHmac('sha256', key(false)).update(value).digest()
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'))
  } }
}
