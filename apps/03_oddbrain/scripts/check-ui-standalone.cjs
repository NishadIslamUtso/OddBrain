const path=require('node:path');const QA=path.resolve(process.env.ODDBRAIN_QA_DIR||'qa-ui');require('node:fs').mkdirSync(QA,{recursive:true});const BASE=(process.env.ODDBRAIN_UI_URL||'http://127.0.0.1:5174/').replace(/\/?$/,'/');
const {chromium}=require('playwright-core');const fs=require('fs');const assert=require('assert/strict');
(async()=>{const b=await chromium.launch(process.env.ODDBRAIN_BROWSER_OPTIONS ? JSON.parse(require('node:fs').readFileSync(process.env.ODDBRAIN_BROWSER_OPTIONS, 'utf8')) : {});const report={errors:[],checks:[],requests:[]};const file=path.resolve(__dirname,'../resources/oddbrain-preview.html');const html=fs.readFileSync(file,'utf8');try{
assert.equal((html.match(/<\/body>/g)||[]).length,1);assert(html.length<700000);assert(!html.includes('${esc(text.replace'));
for(const mode of ['file','viewer-wrapper','opaque-sandbox']){
 const p=await b.newPage({viewport:{width:1280,height:820}});p.on('pageerror',e=>report.errors.push(mode+': '+e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))report.requests.push(r.url())});let app=p;
 const injected=html.replace('</body>','<script>window.viewerHelper=true;</script></body>');
 if(mode==='file')await p.goto(require('node:url').pathToFileURL(file).href);else if(mode==='viewer-wrapper')await p.setContent(injected);else{await p.setContent('<iframe sandbox="allow-scripts" style="width:1280px;height:820px;border:0"></iframe>');await p.evaluate(source=>document.querySelector('iframe').srcdoc=source,injected);await p.waitForTimeout(250);app=p.frames().find(f=>f!==p.mainFrame());}
 await app.getByRole('button',{name:'Friend, open settings',exact:true}).first().waitFor();await p.waitForTimeout(3000);assert.equal(await app.locator('.ob-launch').count(),0);assert.equal(await app.locator('.ob-render-error').count(),0);assert.equal(await app.locator('#oddbrain-preview-error').count(),0);assert.equal(await app.locator('h1').textContent(),'What’s the plan, Friend?');
 if(mode==='file')await p.screenshot({path:path.join(QA,'real-app-preview-home.png')});
 await app.getByRole('button',{name:'Friend, open settings',exact:true}).first().click();await app.getByRole('button',{name:'Section: Appearance',exact:true}).click();assert.equal(await app.locator('.ob-preset-row').count(),8);
 await app.getByRole('button',{name:'Details',exact:true}).click();await app.getByRole('group',{name:'Palette',exact:true}).getByRole('button',{name:'Sage Notes',exact:true}).click();assert.equal(await app.evaluate(()=>JSON.parse(localStorage.getItem('oddbrain.look.v2')).palette),'sage');await app.getByRole('group',{name:'Theme',exact:true}).getByRole('button',{name:'Light',exact:true}).click();
 const headline=await app.locator('.ob-appearance-preview .ob-home-heading h1').evaluate(e=>getComputedStyle(e).fontSize);assert.equal(headline,'30px');
 if(mode==='opaque-sandbox')assert.equal(await app.evaluate(()=>window.__oddbrainEphemeralStorage),true);
 if(mode==='file'){
  await app.getByRole('button',{name:'My mixes',exact:true}).click();await app.getByRole('textbox',{name:'Look name',exact:true}).fill('Portable sage');await app.getByRole('button',{name:'Save look',exact:true}).click();
  const downloaded=p.waitForEvent('download');await app.getByRole('button',{name:'Export offline HTML',exact:true}).click();const download=await downloaded;await download.saveAs(path.join(QA,'re-exported.html'));
  const contents=fs.readFileSync(path.join(QA,'re-exported.html'),'utf8');assert.equal((contents.match(/<\/body>/g)||[]).length,1);assert(!contents.includes('API-SECRET-SENTINEL'));
  const reopened=await b.newPage();reopened.on('pageerror',e=>report.errors.push(e.message));await reopened.setContent(contents.replace('</body>','<script>window.viewerHelper=true;</script></body>'));await reopened.getByRole('button',{name:'Friend, open settings',exact:true}).first().waitFor();assert.equal(await reopened.evaluate(()=>JSON.parse(localStorage.getItem('oddbrain.look.v2')).palette),'sage');assert.equal(await reopened.evaluate(()=>JSON.parse(localStorage.getItem('ai-assistant.appearance')).theme),'light');await reopened.close();report.checks.push('Re-exported renderer HTML reopens through the formerly failing viewer wrapper, retaining selected look');
 }
 report.checks.push(mode+': actual React app renders, 8 presets, palette switch, shared preview and no raw template or startup error');await p.close();
}
assert.equal(report.errors.length,0);assert.equal(report.requests.length,0);
}catch(e){report.failure=e.stack;console.error(e.stack);process.exitCode=1}finally{console.log(JSON.stringify(report,null,2));fs.writeFileSync(path.join(QA,'standalone-results.json'),JSON.stringify(report,null,2));await b.close()}})();
