export type NativeArtifactLink = { id: string; title: string; version: number; type: 'html' | 'svg'; source: string; digest: string }
export function validNativeArtifacts(value: unknown): value is NativeArtifactLink[] {
  return Array.isArray(value) && value.length <= 200 && value.every(item => item && typeof item.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(item.id) && typeof item.title === 'string' && ['html', 'svg'].includes(item.type) && typeof item.source === 'string' && typeof item.digest === 'string' && /^[a-f0-9]{64}$/i.test(item.digest) && Number.isSafeInteger(item.version) && item.version > 0)
}
