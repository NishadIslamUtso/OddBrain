/** Export only the bundled extension payload; no user profile, token or network. */
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
const PAYLOAD = ['manifest.json', 'background.js', 'content-scripts', 'lib', 'popup', 'icons', 'assets']
export const EXTENSION_INSTALL_GUIDE = `OddBrain browser companion\n\n1. Keep this folder somewhere permanent. Do not delete it after loading.\n2. In Chrome open chrome://extensions (Edge: edge://extensions).\n3. Turn on Developer mode. Choose Load unpacked, then this folder (the one with manifest.json).\n4. Keep OddBrain open and select a vault. Enable browser capture in Settings > Privacy & access > Agent access. Then copy the pairing token from Settings > AI & connections > Connectors > Agent access.\n5. Open the extension > Settings > Connected app. Paste the pairing token, then Save & test connection. Use the port shown in OddBrain if it differs from 8765.\n6. Grant access to the messaging sites you want, then open a conversation. Watch capture progress: incomplete media still needs the page; fully queued work can retry after restart.\n\nOnly accessible content from visited conversations is captured, not your entire account or browser history. Account restrictions and unloaded history still apply. Nothing is captured simply by copying these files.\n\nUpdates: export the newer bundled version, then load the new folder in your browser. Do not remove an old extension with queued captures until they have been saved. Installing/replacing an extension can change its identity and pairing.\n\nThe browser requires this one-time Load unpacked confirmation. OddBrain cannot silently approve browser permissions for you.\n`
function noLinks(path: string): string {
  for (let p = resolve(path);; p = dirname(p)) {
    if (lstatSync(p).isSymbolicLink()) throw Error('Choose a folder without linked paths.')
    if (dirname(p) === p) break
  }
  return realpathSync(path)
}
export function exportExtension(source: string, destination: string): { ok: boolean; answer: string; path?: string; version?: string; count?: number } {
  let owned = false
  try {
    const root = noLinks(source), parent = noLinks(dirname(destination)), target = join(parent, basename(resolve(destination)))
    if (target === root || target.startsWith(root + sep)) throw Error('Choose a destination outside the bundled extension.')
    const files: Array<{ path: string; bytes: Buffer }> = []; let total = 0
    const collect = (path: string, depth = 0) => {
      if (depth > 12 || files.length >= 4096) throw Error('Extension payload exceeds the safety limit.')
      const full = join(root, path), stat = lstatSync(full)
      if (stat.isSymbolicLink()) throw Error('The bundled extension contains an unexpected linked file.')
      if (stat.isDirectory()) { for (const name of readdirSync(full).sort()) collect(path + '/' + name, depth + 1); return }
      if (!stat.isFile() || stat.size > 16_000_000 || total + stat.size > 32_000_000) throw Error('Extension payload is invalid or too large.')
      const bytes = readFileSync(full); total += bytes.length
      if (bytes.length !== stat.size || total > 32_000_000) throw Error('The extension changed while it was being copied. Try again.')
      files.push({ path, bytes })
    }
    for (const path of PAYLOAD) collect(path)
    const manifest = JSON.parse(files.find(f => f.path === 'manifest.json')!.bytes.toString('utf8'))
    if (manifest.manifest_version !== 3 || manifest.name !== 'OddBrain' || typeof manifest.version !== 'string' || !/^\d+(?:\.\d+){1,3}$/.test(manifest.version)) throw Error('The bundled extension manifest is not valid.')
    const referenced = [manifest.background?.service_worker, manifest.action?.default_popup, manifest.side_panel?.default_path, manifest.options_ui?.page, ...Object.values(manifest.action?.default_icon || {}), ...Object.values(manifest.icons || {}), ...(manifest.content_scripts || []).flatMap((s: any) => [...(s.js || []), ...(s.css || [])])].filter(Boolean)
    if (referenced.some(path => typeof path !== 'string' || !files.some(f => f.path === path.split(/[?#]/)[0]))) throw Error('A required extension file is missing. Reinstall the app before exporting.')
    mkdirSync(target) // Never reuse, remove or overwrite an existing folder.
    owned = true
    for (const file of files) {
      const output = join(target, file.path); mkdirSync(dirname(output), { recursive: true })
      writeFileSync(output, file.bytes, { flag: 'wx' })
      if (!readFileSync(output).equals(file.bytes)) throw Error('The exported extension failed verification.')
    }
    writeFileSync(join(target, 'INSTALL.txt'), EXTENSION_INSTALL_GUIDE, { flag: 'wx' })
    return { ok: true, path: target, version: manifest.version, count: files.length, answer: `Extension ${manifest.version} saved to ${target}. Follow the steps below or open INSTALL.txt in that folder.` }
  } catch (error) {
    if (owned && existsSync(destination)) try { rmSync(destination, { recursive: true, force: true }) } catch { return { ok: false, answer: 'Export failed and its incomplete folder could not be removed. Do not load that incomplete copy.' } }
    return { ok: false, answer: error instanceof Error ? error.message : 'The extension could not be exported.' }
  }
}
