const path=require('node:path');const QA=path.resolve(process.env.ODDBRAIN_QA_DIR||'qa-ui');require('node:fs').mkdirSync(QA,{recursive:true});const BASE=(process.env.ODDBRAIN_UI_URL||'http://127.0.0.1:5174/').replace(/\/?$/,'/');
const {chromium}=require('playwright-core');const assert=require('assert/strict');const fs=require('fs');
(async()=>{const b=await chromium.launch(process.env.ODDBRAIN_BROWSER_OPTIONS ? JSON.parse(require('node:fs').readFileSync(process.env.ODDBRAIN_BROWSER_OPTIONS, 'utf8')) : {});const p=await b.newPage({viewport:{width:1280,height:820}});const r={errors:[],checks:[]};p.on('pageerror',e=>r.errors.push(e.stack));try{
await p.goto(BASE);await p.evaluate(()=>{localStorage.setItem('ai-assistant.welcomed','true');localStorage.setItem('ai-assistant.appearance',JSON.stringify({theme:'dark',mascotWords:true}));});await p.reload();await p.waitForTimeout(3000);
await p.evaluate(async()=>{
 const engineModule=performance.getEntriesByType('resource').map(e=>e.name).filter(s=>s.includes('/src/state/engine.ts')).at(-1)||'/src/state/engine.ts';const m=await import(engineModule);m.resetEngineForTests();window.__engine=m.engineStore();window.__calls={sent:[],answered:[]};window.api={};
 // This browser fixture exercises the desktop send path after Working Notes
 // became a required safety boundary; provide an empty, successful native read.
 const bridgeModule=performance.getEntriesByType('resource').map(e=>e.name).filter(s=>s.includes('/src/platform/bridge.ts')).at(-1)||'/src/platform/bridge.ts';const native=await import(bridgeModule);native.bridge.workingNotes.read=async()=>({ok:true,current:null,revisions:[],answer:''});native.bridge.workingNotes.migrate=async()=>({ok:true,current:null,revisions:[],answer:''});
 window.engineApi={
  read:async()=>({engine:{id:'claude-code',model:'qwen2.5-coder:3b',baseUrl:'',workspace:'C:\\Projects\\OddBrain',approval:'ask'},running:false,history:[]}),
  onEvent:fn=>{window.__emit=fn;return()=>{}},onPullEvent:()=>()=>{},detect:async()=>[],models:async()=>({ok:true,models:[]}),
  send:async prompt=>{window.__calls.sent.push(prompt);return {ok:true,answer:'started'}},answer:async(requestId,allow)=>{window.__calls.answered.push({requestId,allow});return {ok:true}},stop:async()=>({ok:true})
 };await window.__engine.init();
});
// Wait for the injected engine state to reach React before filling its composer.
await p.getByText('qwen2.5-coder:3b',{exact:true}).waitFor();
await p.getByRole('textbox',{name:'Message',exact:true}).fill('Update welcome.html after checking it.');await p.getByRole('button',{name:'Send',exact:true}).click();await p.waitForFunction(()=>window.__calls.sent.length===1);assert.equal(await p.evaluate(()=>window.__calls.sent.length),1);assert.equal(await p.locator('.ob-brain-toy:visible').count(),0);assert(await p.locator('.ob-engine-activity').isVisible());
await p.evaluate(()=>window.__emit({kind:'tool',name:'Grep',summary:'Find the welcome heading'}));await p.waitForTimeout(80);assert((await p.locator('.ob-engine-activity').innerText()).includes('searching'));r.checks.push('The real composer calls the existing engine send path once; actual tool events drive the strip');
await p.evaluate(()=>window.__emit({kind:'thinking',text:'Checking the relevant file before editing.'}));await p.getByRole('button',{name:'More chat tools',exact:true}).click();await p.getByRole('button',{name:/Show thinking/}).click();await p.getByRole('button',{name:'More chat tools',exact:true}).click();assert.equal(await p.locator('.ob-engine-work .ob-thinking-block').getAttribute('open'),'');
await p.evaluate(()=>{window.__emit({kind:'permission',requestId:'permission-1',tool:'Write',summary:'C:\\Projects\\OddBrain\\welcome.html',detail:'- Old heading\n+ New heading'});window.__emit({kind:'permission',requestId:'permission-2',tool:'Bash',summary:'Run the project tests'});});await p.waitForTimeout(100);assert((await p.locator('.ob-engine-activity').innerText()).includes('waiting for you'));assert(await p.getByText('+1 more waiting',{exact:true}).count());await p.screenshot({path:path.join(QA,'real-app-permission.png')});
await p.getByRole('button',{name:'Allow',exact:true}).click();await p.getByRole('button',{name:'Deny',exact:true}).click();assert.deepEqual(await p.evaluate(()=>window.__calls.answered),[{requestId:'permission-1',allow:true},{requestId:'permission-2',allow:false}]);r.checks.push('Existing permission queue, native request IDs, Allow/Deny callbacks and reasoning disclosure remain intact');
await p.evaluate(()=>window.__emit({kind:'done',text:'The sample turn finished.'}));await p.waitForTimeout(1900);assert.equal(await p.locator('.ob-engine-activity').count(),0);assert.equal(await p.evaluate(()=>window.__engine.turn.state),'done');assert.equal(await p.getByRole('button',{name:'Hand off',exact:true}).count(),1);assert.equal(await p.getByRole('button',{name:'Compact',exact:true}).count(),1);r.checks.push('Completion reaction ends; existing handoff, compact, journal/review actions remain in the real panel');
// The real effort control uses only runtime metadata. This remains a UI fixture,
// separate from the native Claude initialize probe recorded in CONTEXT.md.
await p.evaluate(async()=>{
 window.__calls.effort=[];window.__calls.capabilities=0;
 window.engineApi.setModel=async()=>({ok:true,answer:'selected'});
 window.engineApi.capabilities=async()=>{window.__calls.capabilities++;const s=window.__engine.settings;return {ok:true,models:[],effort:{target:JSON.stringify([s.id,s.cloudProvider,s.model,s.baseUrl,s.workspace]),status:'reported',levels:['low','high'],note:'CLI-reported options. Applies to your next message.'}}};
 window.engineApi.setThinking=async(mode,target)=>{window.__calls.effort.push({mode,target});return {ok:true,answer:'Requested for your next message.'}};
 await window.__engine.setModel('metadata-fixture','native');
});
await p.locator('button[title="Which engine works here, and how much it may do before asking"]').click();
const effort=p.getByRole('combobox',{name:'Reasoning effort',exact:true});await effort.locator('option[value="high"]').waitFor({state:'attached'});
assert.deepEqual(await effort.locator('option').evaluateAll(es=>es.map(e=>e.value)),['default','low','high']);
await effort.selectOption('high');await p.getByRole('status').filter({hasText:'Requested for your next message.'}).waitFor();
assert.equal(await p.evaluate(()=>window.__calls.sent.length),1);assert.equal(await p.evaluate(()=>window.__calls.effort[0].mode),'high');
await p.screenshot({path:path.join(QA,'native-effort-controls.png')});
const menu=p.getByRole('menu',{name:'Engines and how much they may do'});const bounds=await menu.boundingBox();assert(bounds&&bounds.y>=0&&bounds.x>=0&&bounds.x+bounds.width<=1280);
await p.keyboard.press('Escape');const checksBefore=await p.evaluate(()=>window.__calls.capabilities);
await p.getByRole('button',{name:'More chat tools',exact:true}).click();await p.getByRole('button',{name:/Show thinking/}).click();
assert.equal(await p.evaluate(()=>window.__calls.effort.length),1);assert.equal(await p.evaluate(()=>window.__calls.sent.length),1);assert.equal(await p.evaluate(()=>window.__calls.capabilities),checksBefore);
r.checks.push('Reasoning effort shows only reported levels and sets a scoped request; Show thinking sends no message, effort change or metadata request');
// agy stays a separate native route. These are explicit UI fixtures, not a live account.
await p.keyboard.press('Escape');
await p.evaluate(async()=>{
 window.engineApi.pick=async()=>({ok:true,answer:'selected'});
 window.engineApi.models=async()=>({ok:true,models:[{name:'agy-fixture',displayName:'Native agy choice',provider:'native',cloud:true,sizeGB:null}]});
 await window.__engine.pick('agy');await window.__engine.setModel('agy-fixture','native');
});
await p.locator('button[title="Which engine works here, and how much it may do before asking"]').click();
await menu.getByRole('menuitemradio',{name:'Native rules',exact:true}).waitFor();
assert.equal(await menu.getByRole('menuitemradio',{name:'Ask me',exact:true}).count(),0);
assert((await menu.innerText()).includes('No approval cards on this connection'));
await effort.locator('option[value="high"]').waitFor({state:'attached'});
assert.deepEqual(await effort.locator('option').evaluateAll(es=>es.map(e=>e.value)),['default','low','high']);
await p.screenshot({path:path.join(QA,'agy-native-controls.png')});
const agyBounds=await menu.boundingBox();assert(agyBounds&&agyBounds.y>=0&&agyBounds.x>=0);
await p.keyboard.press('Escape');
await p.evaluate(async()=>{
 await window.__engine.send('Synthetic agy stream');
 window.__emit({kind:'delta',text:'Streamed final answer.'});
 window.__emit({kind:'status',text:'Native tool finished.'});
 window.__emit({kind:'done',text:'Streamed final answer.',alreadyDisplayed:true});
});
await p.locator('.ob-engine-work li').filter({hasText:'Streamed final answer.'}).waitFor();
assert.equal(await p.locator('.ob-engine-work li').filter({hasText:'Streamed final answer.'}).count(),1);
assert.equal(await p.evaluate(()=>window.__engine.turn.permissions.length),0);
r.checks.push('agy has native permission wording, separately scoped effort and no invented approval cards; streamed final text is not duplicated after tool notices');
assert.equal(r.errors.length,0);
}catch(e){r.failure=e.stack;console.error(e.stack);process.exitCode=1}finally{fs.writeFileSync(path.join(QA,'turn-wiring-results.json'),JSON.stringify(r,null,2));console.log(JSON.stringify(r,null,2));await b.close()}})();
