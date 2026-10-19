// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
const fake=vi.hoisted(()=>({get:vi.fn()}))
vi.mock('../src/shared/lib/vault',()=>({vaultGet:fake.get}))
vi.mock('../src/renderer/src/platform/bridge',()=>({isDemo:false,bridge:{vault:{}}}))
import VaultView from '../src/renderer/src/components/VaultView'
let host:HTMLDivElement,root:Root,answer:(value:any)=>void
beforeEach(async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
 fake.get.mockImplementation((url:string)=>url==='/files'?Promise.resolve({ok:true,available:true,files:['Notes/plan.md'],root:'/vault'}):url.startsWith('/recall?')?new Promise(resolve=>{answer=resolve}):Promise.resolve({ok:true,content:'Original source text'}))
 host=document.createElement('div');document.body.append(host);root=createRoot(host)
 await act(async()=>root.render(<VaultView onAddToComposer={()=>{}}/>))
})
afterEach(async()=>{await act(()=>root.unmount());host.remove();fake.get.mockReset()})
async function type(value:string){await act(()=>{const input=host.querySelector('input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))})}
async function search(){await act(()=>host.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})))}
test('Vault uses ranked guarded recall, announces waiting/limits and opens the original path',async()=>{
 await type('"tin roof"');await search()
 expect(fake.get).toHaveBeenCalledWith('/recall?q=%22tin%20roof%22')
 expect(host.textContent).toContain('Searching saved');expect(host.textContent).not.toContain('No matches in')
 await act(()=>answer({ok:true,hits:[{id:'original',path:'02 Sources/revision.json',title:'Workshop',kind:'conversation',speaker:'Sam',text:'tin roof'}],notices:['Reading budget reached.'],incomplete:true}))
 expect(host.textContent).toContain('1 ranked match');expect(host.textContent).toContain('Reading budget reached.')
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('Workshop'))!.click())
 expect(fake.get).toHaveBeenCalledWith('/file?path=02%20Sources%2Frevision.json')
 expect(host.textContent).toContain('Original source text')
})
test('a late result from an old query never appears under the new query',async()=>{
 await type('old');await search();await type('new')
 await act(()=>answer({ok:true,hits:[{id:'old',path:'old.md',title:'STALE_RESULT',text:'old'}],notices:[]}))
 expect(host.textContent).not.toContain('STALE_RESULT');expect(host.textContent).not.toContain('Searching saved')
})
