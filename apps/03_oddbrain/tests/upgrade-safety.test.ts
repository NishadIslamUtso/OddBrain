import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createVaultFiles } from '../src/main/vault/files'
import { exportVaultCopy } from '../src/main/vault/exportCopy'
import { deployMcp } from '../src/main/engine/deploy'
import { commitConfigs } from '../src/main/engine/configTransaction'
import { deploySkillBundle, type SkillBundle } from '../src/main/engine/skillBundle'
import { catalogEntry } from '../src/shared/lib/skillCatalog'
import { normalizeMcpServers } from '../src/shared/lib/mcp'
import { cmdQuote } from '../src/main/engine/authStatus'
const fault = vi.hoisted(() => ({ backup: false, rename: '', copy: '', write: '' }))
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return { ...actual,
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      if(fault.write && String(args[1]) === fault.write) throw Error('Injected staging failure')
      return actual.writeFileSync(...args)
    },
    copyFileSync: (...args: Parameters<typeof actual.copyFileSync>) => {
      if ((fault.backup && String(args[1]).includes('.oddbrain-original')) || (fault.copy && String(args[1]).includes(fault.copy))) throw Error('Injected copy failure')
      return actual.copyFileSync(...args)
    },
    renameSync: (...args: Parameters<typeof actual.renameSync>) => {
      if (String(args[1]) === fault.rename) { fault.rename = ''; throw Error('Injected rename failure') }
      return actual.renameSync(...args)
    },
  }
})
let root: string
beforeEach(() => { root = fs.mkdtempSync(join(tmpdir(),'ob-upgrade-')); fault.backup = false; fault.rename = ''; fault.copy = ''; fault.write = '' })
afterEach(() => { fault.backup = false; fault.rename = ''; fault.copy = ''; fault.write = ''; fs.rmSync(root,{recursive:true,force:true}) })
function vault() { const path = join(root,'vault'); fs.mkdirSync(path); return createVaultFiles(path, () => new Date()) }
function link(target: string, path: string, t: { skip: (note?: string) => never | void }) {
  try { fs.symlinkSync(target,path,'file') } catch(e) { if (process.platform === 'win32' && ['EPERM','EACCES'].includes((e as NodeJS.ErrnoException).code || '')) { t.skip('Windows symlink privilege unavailable'); return false } throw e } return true
}
describe('reproduced clean-build vault defects', () => {
  it('writes at the vault root with ordinary, immutable, atomic and append operations', () => {
    const files = vault(); files.write('index.md','first'); files.append('index.md',' second'); expect(files.read('index.md')).toBe('first second')
    files.writeAtomic('index.md','atomic'); expect(files.read('index.md')).toBe('atomic')
    expect(files.writeOnce('once.md','one')).toBe(false); expect(files.writeOnce('once.md','two')).toBe(true); expect(files.read('once.md')).toBe('one')
  })
  it('rejects dangling symlinks before any write, including atomic checkpoints', t => {
    const files=vault(), outside=join(root,'outside.md'), target=join(files.root,'dangling.md')
    if (!link(outside,target,t)) return
    for (const operation of [() => files.write('dangling.md','x'), () => files.append('dangling.md','x'), () => files.writeAtomic('dangling.md','x'), () => files.writeOnce('dangling.md','x')]) expect(operation).toThrow(/Symlink/)
    expect(fs.existsSync(outside)).toBe(false); expect(fs.lstatSync(target).isSymbolicLink()).toBe(true)
  })
  it('does not list or export external linked notes and reports an incomplete walk', t => {
    const files=vault(), outside=join(root,'private.md'); fs.writeFileSync(outside,'PRIVATE'); files.write('safe.md','safe')
    if (!link(outside,join(files.root,'linked.md'),t)) return
    expect(files.listMarkdown('')).toEqual(['safe.md']); expect(files.walkFiles('','.md').incomplete).toBe(true)
    const destination=join(root,'copy'); expect(exportVaultCopy(files.root,destination).ok).toBe(false); expect(fs.existsSync(destination)).toBe(false)
    expect(() => files.read('linked.md')).toThrow(/Symlink/)
  })
  it('refuses an existing destination, even if empty, without changing user notes', () => {
    const files=vault(); files.write('note.md','vault content'); const destination=join(root,'copy'); fs.mkdirSync(destination); fs.writeFileSync(join(destination,'note.md'),'MY NOTE')
    expect(exportVaultCopy(files.root,destination).ok).toBe(false); expect(fs.readFileSync(join(destination,'note.md'),'utf8')).toBe('MY NOTE')
    fs.unlinkSync(join(destination,'note.md')); expect(exportVaultCopy(files.root,destination).ok).toBe(false)
  })
  it('refuses capped exports and destinations inside the source vault', () => {
    const files=vault(); files.write('note.md','vault content')
    expect(exportVaultCopy(files.root,join(root,'copy'),{ ...files, walkFiles: () => ({ files:['note.md'], capped:true }) }).ok).toBe(false)
    expect(fs.existsSync(join(root,'copy'))).toBe(false); expect(exportVaultCopy(files.root,join(files.root,'copy')).ok).toBe(false)
  })
  it('removes its own incomplete copy after a later file fails', () => {
    const files=vault(); files.write('a.md','a'); files.write('b.md','b'); const destination=join(root,'copy')
    const result=exportVaultCopy(files.root,destination,{ ...files, filePath: path => { if(path==='b.md') throw Error('source disappeared'); return files.filePath(path) } })
    expect(result.ok).toBe(false); expect(fs.existsSync(destination)).toBe(false); expect(files.read('a.md')).toBe('a')
  })
  it('new source files cannot be swallowed by private vault/model ignore rules', () => {
    const repo=resolve('../..'), paths=['apps/03_oddbrain/src/main/vault/new-module.ts','apps/03_oddbrain/src/main/models/new-module.ts']
    const answer=spawnSync('git',['check-ignore','--no-index','--stdin'],{cwd:repo,input:paths.join('\n')+'\n',encoding:'utf8'})
    expect(answer.status).toBe(1); expect(answer.stdout).toBe('')
    expect(spawnSync('git',['check-ignore','--no-index','apps/03_oddbrain/vault/private.md'],{cwd:repo}).status).toBe(0)
  })
})
describe('configuration preservation beyond the imported scanner implementation', () => {
  it('keeps original configurations, avoids repeated copies, and preserves later manual edits', () => {
    fs.writeFileSync(join(root,'.mcp.json'),'ORIGINAL')
    const first=deployMcp([{name:'one',command:'npx'}],root)
    expect(first.kept).toHaveLength(1); expect(fs.readFileSync(first.kept[0],'utf8')).toBe('ORIGINAL')
    expect(deployMcp([],root).kept).toHaveLength(0)
    fs.writeFileSync(join(root,'.mcp.json'),'MY LATER EDIT')
    const next=deployMcp([],root); expect(next.kept).toHaveLength(1); expect(fs.readFileSync(next.kept[0],'utf8')).toBe('MY LATER EDIT')
    expect(fs.readFileSync(first.kept[0],'utf8')).toBe('ORIGINAL')
  })
  it('a backup failure stops the entire save before changing engine or central files', () => {
    fs.writeFileSync(join(root,'.mcp.json'),'ORIGINAL'); const central=join(root,'central.json'); fs.writeFileSync(central,'BROKEN JSON')
    fault.backup=true
    expect(() => deployMcp([],root,central)).toThrow('Injected copy failure')
    expect(fs.readFileSync(join(root,'.mcp.json'),'utf8')).toBe('ORIGINAL'); expect(fs.readFileSync(central,'utf8')).toBe('BROKEN JSON')
    expect(fs.existsSync(join(root,'.agents','mcp_config.json'))).toBe(false)
  })
  it('a backup name collision cannot erase either the old backup or the current config', () => {
    fs.writeFileSync(join(root,'.mcp.json'),'ORIGINAL'); fs.mkdirSync(join(root,'.mcp.json.oddbrain-original'))
    const result=deployMcp([],root); expect(result.kept).toHaveLength(1); expect(fs.readFileSync(result.kept[0],'utf8')).toBe('ORIGINAL')
    expect(fs.lstatSync(join(root,'.mcp.json.oddbrain-original')).isDirectory()).toBe(true)
  })
  it('an unreadable central list is backed up before replacement', () => {
    const central=join(root,'central.json'); fs.writeFileSync(central,'BROKEN JSON')
    const result=deployMcp([],root,central)
    expect(result.kept.some(p => fs.readFileSync(p,'utf8')==='BROKEN JSON')).toBe(true); expect(JSON.parse(fs.readFileSync(central,'utf8'))).toEqual({servers:[]})
  })
  it('staging and replacement failures preserve the previous configuration', () => {
    const a=join(root,'a.json'), b=join(root,'b.json'); fs.writeFileSync(a,'A'); fs.writeFileSync(b,'B'); fault.rename=b
    expect(() => commitConfigs([{path:a,text:'NEW A'},{path:b,text:'NEW B'}])).toThrow('Injected rename failure')
    expect(fs.readFileSync(a,'utf8')).toBe('A'); expect(fs.readFileSync(b,'utf8')).toBe('B'); expect(fs.readdirSync(root).sort()).toEqual(['a.json','b.json'])
  })
  it('cleans owned staging files if writing them fails', () => {
    const a=join(root,'a.json'); fs.writeFileSync(a,'ORIGINAL'); fault.write='FAIL-STAGE'
    expect(() => commitConfigs([{path:a,text:'FAIL-STAGE'}])).toThrow('Injected staging failure')
    expect(fs.readFileSync(a,'utf8')).toBe('ORIGINAL'); expect(fs.readdirSync(root)).toEqual(['a.json'])
  })
  it('null or malformed ownership markers never suppress preservation', () => {
    fs.mkdirSync(join(root,'.agents')); fs.writeFileSync(join(root,'.agents','.oddbrain-mcp-managed'),'null'); fs.writeFileSync(join(root,'.mcp.json'),'ORIGINAL')
    const result=deployMcp([],root); expect(result.kept).toHaveLength(1); expect(fs.readFileSync(result.kept[0],'utf8')).toBe('ORIGINAL')
  })
  it('oversized/invalid server lists and arguments are refused instead of silently truncated', () => {
    expect(normalizeMcpServers(Array.from({length:101},(_,i)=>({name:'s'+i,command:'npx'}))).problems.length).toBeGreaterThan(0)
    for(const args of [[1],Array(33).fill('x')]) expect(normalizeMcpServers([{name:'test',command:'npx',args}]).problems.length).toBeGreaterThan(0)
    for(const command of ['C:\\%COMSPEC%\\claude.exe','C:\\!X!\\claude.exe']) expect(cmdQuote(command)).toBeNull()
  })
})
describe('complete skill installation remains non-overwriting and rollback-safe', () => {
  const entry=catalogEntry('docx')!, bundle:SkillBundle={ revision:'a'.repeat(40),files:new Map([['SKILL.md',Buffer.from('---\nname: docx\ndescription: Test\n---\n\nRulebook')],['scripts/helper.py',Buffer.from('print("fixture")')]]) }
  const targets=()=>({claudeSkillsDir:join(root,'claude'),agySkillsDir:join(root,'agy')})
  it('retains support files, refuses existing skill directories and keeps all original bytes', () => {
    const t=targets(); deploySkillBundle(entry,bundle,t); fs.writeFileSync(join(t.claudeSkillsDir,'docx','my-note.md'),'KEEP')
    expect(()=>deploySkillBundle(entry,bundle,t)).toThrow('already exists'); expect(fs.readFileSync(join(t.claudeSkillsDir,'docx','my-note.md'),'utf8')).toBe('KEEP')
  })
  it('rolls back the first engine when the second engine fails to copy', () => {
    const t=targets(); fault.copy=join('agy','docx','scripts','helper.py')
    expect(()=>deploySkillBundle(entry,bundle,t)).toThrow('Injected copy failure')
    expect(fs.existsSync(join(t.claudeSkillsDir,'docx'))).toBe(false); expect(fs.existsSync(join(t.agySkillsDir,'docx'))).toBe(false); expect(fs.existsSync(join(t.agySkillsDir,'docx.md'))).toBe(false)
  })
  it('refuses unsafe archive paths without creating either engine directory', () => {
    for (const path of ['../outside', 'file.txt:stream', 'CON.txt']) expect(()=>deploySkillBundle(entry,{...bundle,files:new Map([...bundle.files,[path,Buffer.from('bad')]])},targets())).toThrow('unsafe')
    expect(fs.readdirSync(root)).toEqual([])
  })
})
