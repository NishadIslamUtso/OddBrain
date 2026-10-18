export type MarketplaceAction = 'add-source' | 'remove-source' | 'refresh-source' | 'install' | 'uninstall' | 'update'
export type MarketplaceItem = { id:string; name:string; description:string; marketplace:string; author:string; installed:boolean; source:string }
export type MarketplaceCatalog = { items:MarketplaceItem[]; sources:unknown[]; version:string }
export type MarketplacePlan = { token:string; command:string; warning:string }
export type MarketplaceBridge = {
  browse():Promise<{ok:true;catalog:MarketplaceCatalog}|{ok:false;error:string}>
  plan(action:MarketplaceAction,target:string):Promise<{ok:true;plan:MarketplacePlan}|{ok:false;error:string}>
  approve(token:string):Promise<{ok:boolean;output:string;error?:string;followup?:MarketplacePlan}>
  deny(token:string):Promise<void>
}
export function marketplaceArguments(action:MarketplaceAction,target:string):string[] {
  const name=/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/
  if(action==='add-source'){
    if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}\/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,99}$/.test(target)||target.split('/').some(part=>part==='..'||part==='.'))throw Error('Enter a GitHub owner/repository, without command flags or a shell expression.')
    return ['plugin','marketplace','add',target,'--scope','user','--json']
  }
  if(action==='remove-source'||action==='refresh-source'){
    if(!name.test(target))throw Error('Choose one exact marketplace name. Refresh-all is not automatic.')
    return ['plugin','marketplace',action==='remove-source'?'remove':'update',target,...(action==='remove-source'?['--scope','user','--json']:[])]
  }
  const parts=target.split('@')
  if(parts.length!==2||!parts.every(part=>name.test(part)))throw Error('Choose an exact plugin@marketplace ID from the catalog.')
  if(!['install','uninstall','update'].includes(action))throw Error('Unknown marketplace operation.')
  return ['plugin',action,target,'--scope','user', '--json']
}
