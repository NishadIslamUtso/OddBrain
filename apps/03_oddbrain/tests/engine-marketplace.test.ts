// @vitest-environment node
import test from 'node:test'
import assert from 'node:assert/strict'
import { marketplaceArguments } from '../src/shared/lib/engineMarketplace'
import { catalogFrom, createMarketplace } from '../src/main/engine/marketplace'
test('marketplace arguments are fixed official commands, user-scoped and injection-safe',()=>{
  assert.deepEqual(marketplaceArguments('add-source','publisher/catalog'),['plugin','marketplace','add','publisher/catalog','--scope','user','--json'])
  for(const target of ['--help','owner/repo && whoami','owner/repo;id','../catalog','https://github.com/owner/repo'])assert.throws(()=>marketplaceArguments('add-source',target))
  for(const target of ['plugin','plugin@market --yes','../p@m','p@m;id','p@m@other'])assert.throws(()=>marketplaceArguments('install',target))
  for(const action of ['install','update','uninstall'] as const){const args=marketplaceArguments(action,'plugin@source');assert(args.includes('user'));assert(!args.includes('--yes'));assert(!args.includes('-y'))}
  assert(marketplaceArguments('remove-source','market').includes('user'))
  assert.throws(()=>marketplaceArguments('refresh-source',''))
})
test('real CLI JSON shapes preserve source labels and installed state without trusting markup',()=>{
  const catalog=catalogFrom({installed:[{id:'one@source',scope:'user'}],available:[{pluginId:'one@source',name:'One',description:'<script>not rendered as HTML</script>',marketplaceName:'source',source:{source:'url',url:'https://example.com/repo.git'}},{pluginId:'two@another',name:'Two',marketplaceName:'another'}]},[{name:'source'}],'2.1.302')
  assert.equal(catalog.items.length,2);assert.equal(catalog.items[0].installed,true);assert.equal(catalog.items[1].marketplace,'another');assert.match(catalog.items[0].description,/<script>/)
})
test('no startup commands, read-only browse, owner-bound one-use exact approval and denial',async()=>{
  const calls:string[][]=[]
  const service=createMarketplace({command:()=>'/chosen/claude',run:async(command,args)=>{assert.equal(command,'/chosen/claude');calls.push(args);return {ok:true,output:args[0]==='--version'?'2.1.302':args.includes('--help')?'--json --scope':args.includes('--available')?'{"installed":[],"available":[]}':args.includes('list')?'[]':'{"outcome":"ok"}'}}})
  assert.equal(calls.length,0)
  assert.equal((await service.browse()).ok,true);assert(!calls.some(args=>args.includes('install')&&!args.includes('--help')))
  const result=await service.plan('install','one@source','owner');assert.equal(result.ok,true);if(!result.ok)throw Error(result.error)
  assert.match(result.plan.command,/plugin install one@source --scope user --json/)
  assert.equal((await service.approve(result.plan.token,'other-window')).ok,false)
  assert.equal((await service.approve(result.plan.token,'owner')).ok,true)
  assert.equal((await service.approve(result.plan.token,'owner')).ok,false)
  const denied=await service.plan('uninstall','one@source','owner');if(!denied.ok)throw Error(denied.error)
  const before=calls.length;service.deny(denied.plan.token,'owner');assert.equal((await service.approve(denied.plan.token,'owner')).ok,false);assert.equal(calls.length,before)
})
test('an unsupported installed CLI is rejected without running a mutation',async()=>{
  const calls:string[][]=[]
  const service=createMarketplace({run:async(_command,args)=>{calls.push(args);return{ok:true,output:args[0]==='--version'?'old CLI':'old help'}}})
  const result=await service.plan('install','one@source','owner');assert.equal(result.ok,false);assert.equal(calls.length,2)
})
test('official refusal is shown, never retried with a force/yes flag',async()=>{
  let installs=0
  const service=createMarketplace({run:async(_command,args)=>{
    if(args.includes('--help'))return{ok:true,output:'--json --scope'}
    if(args[0]==='--version')return{ok:true,output:'2.1.302'}
    installs++;return{ok:false,output:'{"shownCommand":{"sha256":"fixture"},"outcome":"requires-confirmation"}'}
  }})
  const plan=await service.plan('install','one@source','a');if(!plan.ok)throw Error(plan.error)
  const result=await service.approve(plan.plan.token,'a');assert.equal(result.ok,false);assert.equal(installs,1);assert.match(result.output,/requires-confirmation/)
})
test('publisher commands require a separate owner-bound hash card; there is no automatic acceptance',async()=>{
  const calls:string[][]=[],hash='a'.repeat(64)
  const service=createMarketplace({command:()=>'/chosen/claude',run:async(_command,args)=>{
    calls.push(args)
    if(args.includes('--help'))return{ok:true,output:'--scope --json --accept-command'}
    if(args[0]==='--version')return{ok:true,output:'2.1.302'}
    return args.includes('--accept-command')?{ok:true,output:'{"outcome":"ok"}'}:{ok:false,output:JSON.stringify({shownCommand:{sha256:hash,command:'publisher executable --argument'},outcome:'requires-confirmation'})}
  }})
  const first=await service.plan('install','plugin@source','a');if(!first.ok)throw Error(first.error)
  const refused=await service.approve(first.plan.token,'a');assert.equal(refused.ok,false)
  assert.equal(calls.filter(args=>args.includes('--accept-command')).length,0)
  assert(refused.followup);assert.match(refused.followup.warning,/publisher executable --argument/)
  assert.equal((await service.approve(refused.followup.token,'b')).ok,false)
  assert.equal((await service.approve(refused.followup.token,'a')).ok,true)
  assert.deepEqual(calls.at(-1),['plugin','install','plugin@source','--scope','user','--json','--accept-command',hash])
  assert.equal((await service.approve(refused.followup.token,'a')).ok,false)
  const destroyed=await service.plan('install','plugin@source','a');if(!destroyed.ok)throw Error(destroyed.error)
  service.denyOwner('a');assert.equal((await service.approve(destroyed.plan.token,'a')).ok,false)
})
