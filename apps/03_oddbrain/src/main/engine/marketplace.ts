import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { displayCommandLine } from '../../shared/lib/commandLine'
import { marketplaceArguments, type MarketplaceAction, type MarketplaceCatalog, type MarketplaceItem, type MarketplacePlan, type MarketplaceBridge } from '../../shared/lib/engineMarketplace'
import { enginePathSync, resolveEngineCommand, shellSafeCommand } from './enginePath'

type Runner = (command:string,args:string[])=>Promise<{ok:boolean;output:string;stdout?:string}>
const nativeRun:Runner=(command,args)=>new Promise(resolve=>{
  execFile(shellSafeCommand(command),args,{shell:process.platform==='win32',cwd:homedir(),env:{...process.env,PATH:enginePathSync()},timeout:180_000,maxBuffer:1_000_000,windowsHide:true},(error,stdout,stderr)=>resolve({ok:!error,stdout:String(stdout||''),output:String(stdout||'')+String(stderr||'')+(error&&!stdout&&!stderr?error.message:'')}))
})
function parse(output:string):unknown { try{return JSON.parse(output)}catch{const last=output.trim().split('\n').at(-1);try{return JSON.parse(last||'null')}catch{throw Error('Claude Code returned an unreadable catalog. Update the installed CLI; no plugin files were modified by OddBrain.')}} }
const text=(v:unknown,max=1000):string=>typeof v==='string'?v.slice(0,max):''
export function catalogFrom(installedValue:unknown,sources:unknown,version:string):MarketplaceCatalog {
  const data=installedValue as {installed?:unknown[];available?:unknown[]}
  const installed=Array.isArray(data?.installed)?data.installed:Array.isArray(installedValue)?installedValue:[]
  const available=Array.isArray(data?.available)?data.available:[]
  const rows=new Map<string,MarketplaceItem>()
  for(const [list,isInstalled] of [[available,false],[installed,true]] as const)for(const entry of list){
    if(!entry||typeof entry!=='object')continue
    const v=entry as Record<string,unknown>, id=text(v.pluginId||v.id)
    if(!/^[\w.-]+@[\w.-]+$/.test(id))continue
    const previous=rows.get(id)
    rows.set(id,{id,name:text(v.name)||id.split('@')[0],description:text(v.description,3000)||previous?.description||'',marketplace:text(v.marketplaceName)||id.split('@')[1],author:typeof v.author==='string'?text(v.author):v.author&&typeof v.author==='object'?text((v.author as Record<string,unknown>).name):'',installed:isInstalled||previous?.installed===true,source:typeof v.source==='string'?text(v.source):v.source?JSON.stringify(v.source).slice(0,2000):previous?.source||''})
  }
  return {items:[...rows.values()],sources:Array.isArray(sources)?sources:[],version}
}
/** Read catalogs through the engine. Every mutation is a one-use, owner-bound
 * command plan. No background sync, shell textbox, --yes or hand-written plugins. */
export function createMarketplace(options:{command?:()=>string;run?:Runner}={}){
  const run=options.run||nativeRun,command=options.command||(()=>resolveEngineCommand('claude-code'))
  const plans=new Map<string,{owner:string;command:string;args:string[];expires:number}>()
  let running=false,runningOwner='',ownerDestroyed=false
  async function probe(binary:string):Promise<string>{
    const version=await run(binary,['--version']);if(!version.ok)throw Error('Claude Code was not found. Install it or choose its binary in Settings > Engine.')
    const help=await run(binary,['plugin','install','--help'])
    if(!help.ok||!help.output.includes('--json')||!help.output.includes('--scope'))throw Error('The installed Claude Code has no verified JSON plugin command surface. Update it before using marketplace operations.')
    return version.output.trim().slice(0,200)
  }
  return {
    async browse(){
      try{
        const binary=command(),version=await probe(binary),plugins=await run(binary,['plugin','list','--available','--json']),sources=await run(binary,['plugin','marketplace','list','--json'])
        if(!plugins.ok||!sources.ok)throw Error(plugins.output||sources.output)
        return {ok:true as const,catalog:catalogFrom(parse(plugins.stdout??plugins.output),parse(sources.stdout??sources.output),version)}
      }catch(error){return {ok:false as const,error:(error as Error).message}}
    },
    async plan(action:MarketplaceAction,target:string,owner:string){
      try{
        const args=marketplaceArguments(action,target),binary=command();await probe(binary)
        const now=Date.now();for(const [token,plan]of plans)if(plan.expires<now)plans.delete(token)
        if(plans.size>=20)throw Error('Too many pending marketplace approvals. Deny unused cards first.')
        const token=randomUUID();plans.set(token,{owner,command:binary,args,expires:now+600_000})
        const plan:MarketplacePlan={token,command:displayCommandLine([binary,...args]),warning:'Runs Claude Code’s own plugin command in user scope. Plugins may execute code or connect external services in future engine sessions. Trust the publisher before allowing. No automatic sync or update is enabled.'}
        return {ok:true as const,plan}
      }catch(error){return {ok:false as const,error:(error as Error).message}}
    },
    denyOwner(owner:string){if(runningOwner===owner)ownerDestroyed=true;for(const[token,plan]of plans)if(plan.owner===owner)plans.delete(token)},
    deny(token:string,owner:string){if(plans.get(token)?.owner===owner)plans.delete(token)},
    async approve(token:string,owner:string):ReturnType<MarketplaceBridge['approve']>{
      const plan=plans.get(token)
      if(!plan||plan.owner!==owner||plan.expires<Date.now())return {ok:false,output:'',error:'This command card expired or belongs to another window. Request a fresh card.'}
      if(running)return {ok:false,output:'',error:'Another marketplace operation is still running. Wait before approving this card.'}
      plans.delete(token);running=true;runningOwner=owner;ownerDestroyed=false
      try{
        const result=await run(plan.command,plan.args)
        if(!ownerDestroyed&&!result.ok&&['install','update'].includes(plan.args[1])&&!plan.args.includes('--accept-command')){
          try{
            const receipt=parse(result.stdout??result.output) as {shownCommand?:{sha256?:string}}
            const hash=receipt.shownCommand?.sha256
            if(hash&&/^[a-f0-9]{64}$/i.test(hash)){
              const nextToken=randomUUID(),args=[...plan.args,'--accept-command',hash]
              plans.set(nextToken,{owner,command:plan.command,args,expires:Date.now()+600_000})
              return {...result,error:'This plugin requires an additional publisher-supplied command. Review the command declaration and allow or deny the separate card.',followup:{token:nextToken,command:displayCommandLine([plan.command,...args]),warning:'Publisher-supplied executable command declaration:\n'+JSON.stringify(receipt.shownCommand,null,2)+'\nThe official CLI will accept only this exact command hash and unchanged plugin/catalog. Deny if you do not trust it.'}}
            }
          }catch{ /* Ordinary CLI error: show it without retrying. */ }
        }
        return {...result,...(!result.ok?{error:plan.args.includes('--accept-command')?'The official CLI refused or failed the hash-approved command. No retry or broad acceptance flag was used. Request a fresh install/update card if the command or catalog changed.':'The official CLI refused or failed the operation. Its output is shown below. No automatic retry, force flag or command acceptance was used.'}:{})}
      }catch(error){return {ok:false,output:'',error:(error as Error).message}}
      finally{running=false;runningOwner='';ownerDestroyed=false}
    },
  }
}
