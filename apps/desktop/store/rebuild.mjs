#!/usr/bin/env node
/**
 * rebuild.mjs — the store's own maintainer: walk every pack folder, compute
 * each pack's digest (per-file sha-256 over the sorted relative paths — the
 * same rule storeIndex.ts applies), and write index.json with every file
 * named. Run it after editing any pack: `node store/rebuild.mjs`.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const filesOf = (dir, base = '') => {
  const out = []
  for (const name of readdirSync(join(dir, base)).sort()) {
    const rel = base ? `${base}/${name}` : name
    if (statSync(join(dir, rel)).isDirectory()) out.push(...filesOf(dir, rel))
    else out.push(rel)
  }
  return out
}
const digest = (dir, files) => {
  const hash = createHash('sha256')
  for (const rel of files) {
    hash.update(rel); hash.update('\n')
    hash.update(createHash('sha256').update(readFileSync(join(dir, rel))).digest('hex')); hash.update('\n')
  }
  return hash.digest('hex')
}

const packs = []
for (const name of readdirSync(join(root, 'packs')).sort()) {
  const folder = join(root, 'packs', name)
  if (!statSync(folder).isDirectory()) continue
  const manifest = JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8'))
  const files = filesOf(folder)
  if (!files.includes('manifest.json')) throw new Error(`${name}: no manifest`)
  const description = typeof manifest.description === 'string' ? manifest.description.slice(0, 300) : ''
  packs.push({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    author: manifest.author,
    description,
    permissions: manifest.permissions ?? {},
    checksum: digest(folder, files),
    source: `packs/${name}`,
    files,
  })
  console.log('pack', manifest.id, manifest.version, files.length, 'files')
}
const index = { name: 'AI ASSistant community store', packs }
writeFileSync(join(root, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8')
console.log('index written:', packs.length, 'packs')
