import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
/** Fixed build asset only. No renderer-supplied path and no work data. */
export async function readUiPreview(appRoot: string, resourcesRoot: string, packaged: boolean): Promise<{ ok: boolean; html?: string; error?: string }> {
  const file = packaged ? join(resourcesRoot, 'oddbrain-preview.html') : join(appRoot, 'resources', 'oddbrain-preview.html')
  try {
    if ((await stat(file)).size > 8_000_000) return { ok: false, error: 'The offline preview asset is too large.' }
    return { ok: true, html: await readFile(file, 'utf8') }
  } catch { return { ok: false, error: 'The offline preview is missing. Rebuild the app to include it.' } }
}
