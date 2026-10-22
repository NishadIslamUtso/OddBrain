import { createHash } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageRoot = resolve(appRoot, '..', '..', 'packages', 'Memmory_OB')
const outputRoot = join(appRoot, 'out', 'memmory-ob', 'core-package')
const files = ['package.json', 'README.md', 'LICENSE', 'src/index.ts', 'goose-skill/SKILL.md']
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

const metadata = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
if (metadata.name !== '@oddbrain/memmory-ob' || metadata.version !== '1.0.0') throw Error('The Memmory_OB core package identity changed without a reviewed build update.')

rmSync(outputRoot, { recursive: true, force: true })
const manifest = { format: 'oddbrain-memmory-ob-core-package', version: 1, package: `${metadata.name}@${metadata.version}`, files: [] }
for (const relative of files) {
  const source = join(packageRoot, relative), stat = lstatSync(source)
  if (!stat.isFile() || stat.isSymbolicLink()) throw Error(`Memmory_OB package source is not a regular file: ${relative}`)
  const bytes = readFileSync(source)
  mkdirSync(dirname(join(outputRoot, relative)), { recursive: true, mode: 0o700 })
  writeFileSync(join(outputRoot, relative), bytes, { mode: 0o600 })
  manifest.files.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) })
}
writeFileSync(join(outputRoot, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
