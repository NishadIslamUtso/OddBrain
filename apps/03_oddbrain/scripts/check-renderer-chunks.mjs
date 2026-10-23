import { gzipSync } from 'node:zlib'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const assets = join(process.cwd(), 'out', 'renderer', 'assets')
const files = readdirSync(assets).filter(name => name.endsWith('.js'))
const routes = ['ArtifactsView', 'ProjectsView', 'BrainView', 'VaultView', 'SettingsView']
const rows = []
for (const route of routes) {
  const matches = files.filter(name => name.startsWith(`${route}-`))
  if (matches.length !== 1) throw Error(`${route} must be one separate production chunk; found ${matches.length}.`)
  const bytes = readFileSync(join(assets, matches[0]))
  rows.push({ route, raw: bytes.length, gzip: gzipSync(bytes).length })
}
const entryNames = files.filter(name => /^index-[^.]+\.js$/.test(name))
if (entryNames.length !== 1) throw Error(`Expected one renderer entry chunk; found ${entryNames.length}.`)
const entry = readFileSync(join(assets, entryNames[0]))
const format = value => `${(value / 1024).toFixed(1)} KiB`
console.log(`Renderer entry: ${format(entry.length)} raw / ${format(gzipSync(entry).length)} gzip`)
for (const row of rows) console.log(`${row.route}: ${format(row.raw)} raw / ${format(row.gzip)} gzip (lazy)`)
