const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
const files = ['package.json', 'package-lock.json']

/**
 * Hash only what decides whether node_modules is still correct.
 *
 * This used to hash the whole of package.json, so editing the version or a
 * script — changes that cannot alter a single installed file — made start-app
 * run a full `npm install` again. On the target machine that is minutes of a
 * slow connection for nothing.
 */
function relevant(file) {
  const full = path.join(root, file)
  if (!fs.existsSync(full)) return ''
  const text = fs.readFileSync(full, 'utf8')
  if (file !== 'package.json') return text
  try {
    const pkg = JSON.parse(text)
    const keys = ['name', 'dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'overrides', 'engines']
    return JSON.stringify(Object.fromEntries(keys.map(key => [key, pkg[key] ?? null])))
  } catch { return text } // an unreadable package.json must still force a re-check
}

const hash = crypto.createHash('sha256').update(files.map(relevant).join('\n')).digest('hex')
const marker = path.join(root, 'node_modules', '.ai-assistant-deps')
try {
  for (const name of ['vite', 'react', 'react-markdown', 'remark-gfm', 'express', 'yaml']) if (!fs.existsSync(path.join(root, 'node_modules', name, 'package.json'))) throw new Error(`Missing ${name}`)
  if (process.platform === 'win32' && process.arch === 'x64' && !fs.existsSync(path.join(root, 'node_modules/@rollup/rollup-win32-x64-msvc'))) throw new Error('Missing Windows Rollup optional dependency')
  if (process.argv.includes('--record')) fs.writeFileSync(marker, hash)
  else if (!fs.existsSync(marker) || fs.readFileSync(marker, 'utf8') !== hash) throw new Error('Dependencies changed')
} catch (error) { console.error(error.message); process.exitCode = 1 }
