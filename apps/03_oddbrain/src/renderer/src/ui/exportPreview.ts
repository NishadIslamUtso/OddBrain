import { bridge, isDemo } from '../platform/bridge'
import { importLook, type LookSnapshot } from '../state/look'

/** Export the real renderer, not the earlier handwritten concept. Only a
 * normalized appearance snapshot is embedded; keys, chats, vault files,
 * commands, permissions and machine flags never enter the document. */
export async function previewHtml(snapshot: LookSnapshot): Promise<string> {
  const safe = importLook(snapshot)
  if (!safe) throw new Error('The appearance could not be exported.')
  let doc: Document
  if (document.getElementById('oddbrain-preview-bundle')) {
    doc = document.implementation.createHTMLDocument('OddBrain')
    doc.replaceChild(document.documentElement.cloneNode(true), doc.documentElement)
    doc.querySelector('#root')?.replaceChildren()
    doc.querySelector('#oddbrain-preview-runtime')?.remove()
    doc.querySelector('#oddbrain-preview-error')?.remove()
  } else {
    let html = ''
    if (!isDemo) {
      const result = await bridge.app.previewHtml?.()
      if (!result?.ok || !result.html) throw new Error(result?.error || 'The offline preview was not included in this build.')
      html = result.html
    } else {
      const reply = await fetch('./oddbrain-preview.html')
      if (!reply.ok) throw new Error('Build the offline preview first with npm run build:ui-preview.')
      html = await reply.text()
    }
    doc = new DOMParser().parseFromString(html, 'text/html')
  }
  const field = doc.getElementById('oddbrain-look-snapshot')
  if (!field || !doc.getElementById('oddbrain-preview-bundle')) throw new Error('That build has no portable renderer.')
  field.textContent = JSON.stringify(safe).replace(/</g, '\\u003c')
  return '<!doctype html>\n' + doc.documentElement.outerHTML
}
