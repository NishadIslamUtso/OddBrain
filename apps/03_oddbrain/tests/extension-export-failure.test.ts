import { expect, test, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const failure = vi.hoisted(() => ({ output: '' }))
vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>()
  return { ...fs, writeFileSync: (...args: Parameters<typeof fs.writeFileSync>) => {
    if (failure.output && String(args[0]) === failure.output) throw Error('Simulated disk failure')
    return fs.writeFileSync(...args)
  } }
})
import { exportExtension } from '../src/main/extension/export'
test('a failed write removes only the fresh incomplete export, never the original or neighbours', () => {
  const root = mkdtempSync(join(tmpdir(),'ob-export-failure-'))
  try {
    const source = join(root,'source'), destination = join(root,'destination'); mkdirSync(source)
    for (const dir of ['content-scripts','lib','popup','icons','assets']) mkdirSync(join(source,dir))
    writeFileSync(join(source,'manifest.json'),JSON.stringify({manifest_version:3,name:'OddBrain',version:'0.5.0'}))
    writeFileSync(join(source,'background.js'),'worker'); writeFileSync(join(root,'keep'),'private')
    failure.output = join(destination,'background.js')
    expect(exportExtension(source,destination)).toEqual({ok:false,answer:'Simulated disk failure'})
    expect(existsSync(destination)).toBe(false); expect(existsSync(join(root,'keep'))).toBe(true); expect(existsSync(join(source,'background.js'))).toBe(true)
  } finally { failure.output = ''; rmSync(root,{recursive:true,force:true}) }
})
