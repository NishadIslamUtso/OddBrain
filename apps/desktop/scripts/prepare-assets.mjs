import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, isAbsolute } from 'node:path'

const store = fileURLToPath(new URL('../store/', import.meta.url))
const entries = JSON.parse(await readFile(resolve(store, 'bundled-markdown.json'), 'utf8'))
for (const [name, content] of Object.entries(entries)) {
  const target = resolve(store, name)
  const local = relative(store, target)
  if (!local.replaceAll('\\', '/').startsWith('packs/') || local.split(/[\\/]/).includes('..') || isAbsolute(local) || !name.endsWith('.md') || typeof content !== 'string') {
    throw new Error(`Invalid bundled asset path: ${name}`)
  }
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content, 'utf8')
}
console.log(`Prepared ${Object.keys(entries).length} bundled prompt and skill assets.`)
