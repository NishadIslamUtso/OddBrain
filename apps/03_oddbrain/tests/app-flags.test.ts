// @vitest-environment node
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_FLAGS, loadAppFlags, readAppFlagsStrict, saveAppFlags } from '../src/main/appFlags'

/**
 * The two keep-it-running switches, as pure file behaviour: a missing or
 * damaged file means OFF (a broken flag must never start a process), a patch
 * writes through, and unknown fields never leak in.
 */
test('app flags: missing file reads as everything off', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'ob-flags-')), 'flags.json')
  assert.deepEqual(loadAppFlags(file), { loginItem: false, warmRuntime: false, keepLoadedAlways: false })
  assert.deepEqual(DEFAULT_FLAGS, { loginItem: false, warmRuntime: false, keepLoadedAlways: false })
})

test('app flags: a damaged file degrades to off, never to a surprise process', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ob-flags-'))
  const file = join(dir, 'flags.json')
  writeFileSync(file, '{ loginItem: tru')
  assert.deepEqual(loadAppFlags(file), { loginItem: false, warmRuntime: false, keepLoadedAlways: false })
  rmSync(dir, { recursive: true, force: true })
})

test('app flags: a patch writes through and partial patches keep the rest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ob-flags-'))
  const file = join(dir, 'flags.json')
  saveAppFlags(file, { loginItem: true })
  assert.deepEqual(loadAppFlags(file), { loginItem: true, warmRuntime: false, keepLoadedAlways: false })
  saveAppFlags(file, { warmRuntime: true })
  assert.deepEqual(loadAppFlags(file), { loginItem: true, warmRuntime: true, keepLoadedAlways: false })
  saveAppFlags(file, { loginItem: false })
  assert.deepEqual(loadAppFlags(file), { loginItem: false, warmRuntime: true, keepLoadedAlways: false })
  // the file on disk is the honest record, readable by a person
  assert.match(readFileSync(file, 'utf8'), /"warmRuntime": true/)
  rmSync(dir, { recursive: true, force: true })
})

test('app flags: non-boolean junk never becomes a flag', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ob-flags-'))
  const file = join(dir, 'flags.json')
  writeFileSync(file, JSON.stringify({ loginItem: 'yes', warmRuntime: 1, extra: 'x' }))
  assert.deepEqual(loadAppFlags(file), { loginItem: false, warmRuntime: false, keepLoadedAlways: false })
  rmSync(dir, { recursive: true, force: true })
})

test('settings reads do not disguise damaged data as OFF, and saving never overwrites it', () => {
 const dir=mkdtempSync(join(tmpdir(),'ob-flags-strict-')),file=join(dir,'flags.json')
 try {
  assert.deepEqual(readAppFlagsStrict(file),DEFAULT_FLAGS)
  for(const raw of ['{broken','null','[]','{"loginItem":"true"}']) {
   writeFileSync(file,raw);assert.throws(()=>readAppFlagsStrict(file));assert.throws(()=>saveAppFlags(file,{warmRuntime:true}));assert.equal(readFileSync(file,'utf8'),raw)
  }
  writeFileSync(file,'{"loginItem":true}')
  assert.equal(saveAppFlags(file,{warmRuntime:true}).loginItem,true)
  assert.deepEqual(readAppFlagsStrict(file),{loginItem:true,warmRuntime:true,keepLoadedAlways:false})
 } finally {rmSync(dir,{recursive:true,force:true})}
})
