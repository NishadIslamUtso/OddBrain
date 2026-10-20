import { join } from 'node:path'
import { readRegularFileSync } from './safeFile'

/** Fixed build asset only. No renderer-supplied path and no work data. */
export async function readUiPreview(appRoot: string, resourcesRoot: string, packaged: boolean): Promise<{ ok: boolean; html?: string; error?: string }> {
  const file = packaged ? join(resourcesRoot, 'oddbrain-preview.html') : join(appRoot, 'resources', 'oddbrain-preview.html')
  try {
    const { bytes } = readRegularFileSync(file, 8_000_000)
    return { ok: true, html: bytes.toString('utf8') }
  } catch { return { ok: false, error: 'The offline preview is missing. Rebuild the app to include it.' } }
}
