import { expect, test, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTurnArchive } from '../src/main/turnArchive'
import { dispatchRecordedTurn } from '../src/main/recordedDispatch'
const input = { prompt: 'Keep my request', engine: 'agy' as const, model: '', workspace: '/project', pictures: 0 }
test('real storage creation failure refuses before any engine send', () => {
 const root = mkdtempSync(join(tmpdir(),'oddbrain-record-dispatch-'))
 try { const path=join(root,'not-a-directory');writeFileSync(path,'original');const send=vi.fn(),stop=vi.fn()
  expect(dispatchRecordedTurn(createTurnArchive(path),input,send,stop,vi.fn())).toMatchObject({ok:false,answer:expect.stringContaining('nothing was sent')});expect(send).not.toHaveBeenCalled();expect(stop).not.toHaveBeenCalled()
 } finally { rmSync(root,{recursive:true,force:true}) }
})
test('a mid-stream recording failure requests stop and never forwards subsequent false success', () => {
 const archive={begin:vi.fn(()=> 'id'),append:vi.fn(()=>{throw Error('Disk full; engine stop requested')})},stop=vi.fn(),receive=vi.fn()
 const answer=dispatchRecordedTurn(archive,input,forward=>{forward({kind:'delta',text:'cannot persist'});forward({kind:'done',text:'false success'});return{ok:true,answer:'started'}},stop,receive)
 expect(answer.ok).toBe(false);expect(stop).toHaveBeenCalled();expect(receive.mock.calls).toEqual([[{kind:'error',text:'Disk full; engine stop requested'}]])
})
test('native refusal and synchronous dispatch exceptions retain error records without inventing completion', () => {
 for(const throws of [false,true]) {const archive={begin:vi.fn(()=> 'id'),append:vi.fn()},stop=vi.fn()
  const answer=dispatchRecordedTurn(archive,input,()=>{if(throws)throw Error('spawn');return{ok:false,answer:'Refused'}},stop,vi.fn())
  expect(answer.ok).toBe(false);expect(archive.append).toHaveBeenCalledWith('id',expect.objectContaining({kind:'error'}));if(throws)expect(stop).toHaveBeenCalled()
 }
})
