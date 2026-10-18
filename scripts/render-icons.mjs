/**
 * render-icons.mjs — the desktop icon comes from the owner's canonical SVG.
 *
 * There is exactly ONE mark in this project: `resources/icon.svg` (the
 * owner's own export, byte-for-byte). This script renders every raster the
 * installers and the taskbar need from that file and nothing else, so the
 * artwork can never drift between the app and the desktop.
 *
 * Run:  node scripts/render-icons.mjs
 * Writes:
 *   resources/icon.png       (512, the general-purpose one)
 *   resources/icon.ico       (16 32 48 64 128 256, what Windows asks for)
 *
 * It refuses to write anything if the source SVG is missing — an old icon
 * must never be silently reused (that mistake happened once; never again).
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'resources', 'icon.svg')

if (!existsSync(source)) {
  console.error('refusing to render: the canonical resources/icon.svg is missing')
  process.exit(1)
}

const svg = readFileSync(source, 'utf8')
const scratch = mkdtempSync(join(tmpdir(), 'ai-assistant-icons-'))
const sizes = [16, 32, 48, 64, 128, 256, 512]

const pngs = {}
for (const size of sizes) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size }, background: 'rgba(0,0,0,0)' })
    .render()
    .asPng()
  if (size === 512) writeFileSync(join(root, 'resources', 'icon.png'), png)
  else pngs[size] = png
  console.log(`rendered ${size}px`)
}

const ico = await pngToIco([256, 128, 64, 48, 32, 16].map((size) => Buffer.from(pngs[size])))
writeFileSync(join(root, 'resources', 'icon.ico'), ico)
console.log('wrote resources/icon.png (512) and resources/icon.ico (16–256)')

// The browser extension carries the same single mark: three sizes into its
// icons folder, from the same SVG, in the same run — so the extension can
// never drift back to an old logo (that drift happened once; never again).
const extensionIcons = join(root, 'extension', 'icons')
for (const size of [16, 48, 128]) {
  writeFileSync(join(extensionIcons, `icon${size}.png`), pngs[size])
}
console.log('wrote extension/icons/icon{16,48,128}.png — the same mark everywhere')
