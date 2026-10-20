import { afterEach, expect, test } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { exportExtension, EXTENSION_INSTALL_GUIDE } from '../src/main/extension/export'
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'ob-extension-export-')); roots.push(root)
  const source = join(root, 'bundle'), destination = join(root, 'copy'); mkdirSync(source)
  for (const dir of ['content-scripts','lib','popup','icons','assets']) mkdirSync(join(source, dir))
  writeFileSync(join(source, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'OddBrain', version: '0.5.0', background: { service_worker: 'background.js' }, action: { default_popup: 'popup/index.html' } }))
  writeFileSync(join(source,'background.js'), '/* bundled worker */'); writeFileSync(join(source,'popup/index.html'), '<title>OddBrain</title>')
  writeFileSync(join(source,'private-token.txt'), 'NEVER_EXPORT'); mkdirSync(join(source, 'scripts')); writeFileSync(join(source, 'scripts/developer.js'), 'NEVER_EXPORT')
  return { root, source, destination }
}
test('exports only payload with real instructions and byte-identical files', () => {
  const h = setup(), result = exportExtension(h.source,h.destination)
  expect(result.ok).toBe(true); expect(result.version).toBe('0.5.0')
  expect(readFileSync(join(h.destination,'background.js'))).toEqual(readFileSync(join(h.source,'background.js')))
  expect(existsSync(join(h.destination,'private-token.txt'))).toBe(false); expect(existsSync(join(h.destination,'scripts'))).toBe(false)
  expect(readFileSync(join(h.destination,'INSTALL.txt'),'utf8')).toBe(EXTENSION_INSTALL_GUIDE)
  expect(EXTENSION_INSTALL_GUIDE.split('\n').length).toBeGreaterThan(10); expect(EXTENSION_INSTALL_GUIDE).toContain('Load unpacked'); expect(EXTENSION_INSTALL_GUIDE).toContain('Save & test connection')
})
test('the actual shipped manifest and every declared entry point export successfully', () => {
  const h = setup(), result = exportExtension(resolve('../../extension'), h.destination)
  expect(result.ok, result.answer).toBe(true); expect(result.count).toBeGreaterThan(80)
  expect(existsSync(join(h.destination, 'assets/motion/sketch.svg'))).toBe(true)
  expect(existsSync(join(h.destination, 'preview'))).toBe(false)
})
test('never overwrites an existing destination or writes inside the bundle', () => {
  const h = setup(); mkdirSync(h.destination); writeFileSync(join(h.destination,'mine'),'keep')
  expect(exportExtension(h.source,h.destination).ok).toBe(false)
  expect(readFileSync(join(h.destination,'mine'),'utf8')).toBe('keep')
  expect(exportExtension(h.source,join(h.source,'nested')).ok).toBe(false)
  expect(existsSync(join(h.source,'nested'))).toBe(false)
})
test('missing required files fail before making a destination', () => {
  const h = setup(); rmSync(join(h.source,'popup/index.html'))
  expect(exportExtension(h.source,h.destination).ok).toBe(false); expect(existsSync(h.destination)).toBe(false)
})
test('linked payload directories cannot bring in unrelated files', () => {
  const h = setup(), outside = join(h.root,'outside'); mkdirSync(outside)
  rmSync(join(h.source,'assets'), { recursive: true }); symlinkSync(outside,join(h.source,'assets'),process.platform === 'win32' ? 'junction' : 'dir')
  expect(exportExtension(h.source,h.destination).ok).toBe(false); expect(existsSync(h.destination)).toBe(false)
})
test('invalid manifest and escaped resource paths fail closed without output', () => {
  const h = setup()
  for (const content of ['{broken', JSON.stringify({ manifest_version: 2, name: 'OddBrain', version: '0.5.0' }), JSON.stringify({ manifest_version: 3, name: 'OddBrain', version: '0.5.0', background: { service_worker: '../private.js' } })]) {
    writeFileSync(join(h.source,'manifest.json'),content)
    expect(exportExtension(h.source,h.destination).ok).toBe(false); expect(existsSync(h.destination)).toBe(false)
  }
})
test('an outside symlink destination parent is refused without touching its files', () => {
  const h = setup(), linked = join(h.root,'linked'), outside = join(h.root,'outside'); mkdirSync(outside)
  symlinkSync(outside,linked,process.platform === 'win32' ? 'junction' : 'dir')
  expect(exportExtension(h.source,join(linked,'copy')).ok).toBe(false); expect(existsSync(join(outside,'copy'))).toBe(false)
})
