import { createHash } from 'node:crypto'
import { closeSync, constants, fstatSync, mkdirSync, openSync, readSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageRoot = resolve(appRoot, '..', '..', 'packages', 'Memory_OB')
const outputRoot = join(appRoot, 'out', 'memory-ob', 'core-package')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

// Race-safe read: one handle, no-follow open, identity rechecked on the same
// descriptor before the bytes are used.
const readRegularFile = (path, limit) => {
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
  try {
    const before = fstatSync(descriptor)
    if (!before.isFile() || before.size < 1 || before.size > limit) throw Error(`Memory_OB package source is not a regular file within its size limit: ${path}`)
    const bytes = Buffer.alloc(before.size); let total = 0
    while (total < bytes.length) { const count = readSync(descriptor, bytes, total, bytes.length - total, null); if (!count) break; total += count }
    const after = fstatSync(descriptor)
    if (total !== before.size || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw Error(`Memory_OB package source changed while being read: ${path}`)
    return bytes
  } finally { closeSync(descriptor) }
}

const metadata = JSON.parse(readRegularFile(join(packageRoot, 'package.json'), 1_000_000).toString('utf8'))
if (metadata.name !== '@oddbrain/memory-ob' || metadata.version !== '1.0.0') throw Error('The Memory_OB core package identity changed without a reviewed build update.')

// The release copy of the LEGO core ships compiled plain JavaScript only:
// release output never contains TypeScript source or source maps.
rmSync(outputRoot, { recursive: true, force: true })
mkdirSync(join(outputRoot, 'dist'), { recursive: true, mode: 0o700 })
await build({
  entryPoints: [join(packageRoot, 'src', 'index.ts')],
  outfile: join(outputRoot, 'dist', 'index.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  sourcemap: false,
  minify: false,
  legalComments: 'none',
})
const releasePackage = {
  ...metadata,
  exports: { '.': './dist/index.mjs' },
  files: ['dist', 'README.md', 'LICENSE', 'goose-skill'],
}
const files = [
  { relative: 'package.json', bytes: Buffer.from(`${JSON.stringify(releasePackage, null, 2)}\n`) },
  { relative: 'README.md', bytes: readRegularFile(join(packageRoot, 'README.md'), 2_000_000) },
  { relative: 'LICENSE', bytes: readRegularFile(join(packageRoot, 'LICENSE'), 1_000_000) },
  { relative: 'goose-skill/SKILL.md', bytes: readRegularFile(join(packageRoot, 'goose-skill', 'SKILL.md'), 2_000_000) },
  { relative: 'dist/index.mjs', bytes: readRegularFile(join(outputRoot, 'dist', 'index.mjs'), 20_000_000) },
]
const manifest = { format: 'oddbrain-memory-ob-core-package', version: 1, package: `${metadata.name}@${metadata.version}`, files: [] }
for (const { relative, bytes } of files) {
  const destination = join(outputRoot, relative)
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 })
  writeFileSync(destination, bytes, { mode: 0o600 })
  manifest.files.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) })
}
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
const manifestPath = join(outputRoot, 'MANIFEST.json')
const temporary = `${manifestPath}.tmp`
writeFileSync(temporary, manifestBytes, { mode: 0o600 })
renameSync(temporary, manifestPath)
