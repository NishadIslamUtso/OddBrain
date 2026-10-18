// Build the SAME React renderer into one offline HTML file. This is an export
// asset, never an iframe or substitute runtime inside the installed app.
import { build } from 'vite'
import { gzipSync } from 'node:zlib'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
const root = fileURLToPath(new URL('..', import.meta.url))
const result = await build({
  configFile: join(root, 'vite.web.config.ts'), base: './', publicDir: false,
  // This is a one-file interface preview, including in opaque viewer frames.
  // Vite's ?url asset helper constructs an absolute URL at module load, which
  // throws on about:blank and breaks the entire preview before React starts.
  // The installed/web apps still bundle the real local PDF worker; this
  // UI-only export has neither a backend nor a separate worker file.
  plugins: [{
    name: 'offline-preview-without-pdf-worker', enforce: 'pre',
    resolveId(id) { if (id === 'pdfjs-dist/build/pdf.worker.min.mjs?url') return '\0offline-pdf-worker' },
    load(id) { if (id === '\0offline-pdf-worker') return 'export default ""' },
  }],
  build: { write: false, emptyOutDir: false, sourcemap: false, cssCodeSplit: false, minify: 'esbuild',
    rollupOptions: { input: join(root, 'src/renderer/src/main.tsx'), output: { format: 'iife', name: 'OddBrainPreview', inlineDynamicImports: true } } },
})
const output = Array.isArray(result) ? result[0].output : result.output
const javascript = output.filter(o => o.type === 'chunk').map(o => o.code).join('\n')
const css = output.filter(o => o.type === 'asset' && o.fileName.endsWith('.css')).map(o => String(o.source)).join('\n')
if (!javascript || !css) throw Error('The renderer preview build did not produce JavaScript and CSS.')
const encoded = gzipSync(Buffer.from(javascript, 'utf8'), { level: 9 }).toString('base64')
const mark = (await readFile(join(root, 'resources/icon.svg'), 'utf8')).replace('<svg ', '<svg style="width:100%;height:100%;display:block" ')
const bootstrap = String.raw`(function(){
'use strict';
var root=document.getElementById('root');
function fail(){var p=document.getElementById('oddbrain-preview-error');if(!p){p=document.createElement('p');p.id='oddbrain-preview-error';p.style.cssText='position:fixed;bottom:24px;left:24px;right:24px;font:13px/1.6 system-ui;color:#ececef;background:#202027;padding:14px;border:1px solid #2e2e36;z-index:9999';document.body.appendChild(p);}p.textContent='The preview could not start. Download this file and open it in a current Edge or Chrome browser.';}
window.addEventListener('error',fail,{once:true});
try{
 var raw=document.getElementById('oddbrain-look-snapshot').textContent;
 var seed=JSON.parse(raw||'null');
 var hash=2166136261;for(var i=0;i<raw.length;i++)hash=Math.imul(hash^raw.charCodeAt(i),16777619)>>>0;
 var prefix='oddbrain-ui-preview-'+hash.toString(36)+':',backing=null,memory=new Map();
 try{backing=window.localStorage;backing.setItem(prefix+'test','1');backing.removeItem(prefix+'test');}catch(_){window.__oddbrainEphemeralStorage=true;backing=null;}
 var storage={getItem:function(k){return backing?backing.getItem(prefix+k):(memory.has(k)?memory.get(k):null);},setItem:function(k,v){if(backing)backing.setItem(prefix+k,String(v));else memory.set(k,String(v));},removeItem:function(k){if(backing)backing.removeItem(prefix+k);else memory.delete(k);},key:function(n){if(!backing)return Array.from(memory.keys())[n]||null;var keys=[];for(var j=0;j<backing.length;j++){var k=backing.key(j);if(k&&k.indexOf(prefix)===0)keys.push(k.slice(prefix.length));}return keys[n]||null;},clear:function(){if(backing){var keys=[];for(var j=0;j<backing.length;j++){var k=backing.key(j);if(k&&k.indexOf(prefix)===0)keys.push(k);}keys.forEach(function(k){backing.removeItem(k);});}else memory.clear();}};
 Object.defineProperty(storage,'length',{get:function(){return backing?Array.from({length:backing.length},function(_,i){return backing.key(i);}).filter(function(k){return k&&k.indexOf(prefix)===0;}).length:memory.size;}});
 Object.defineProperty(window,'localStorage',{configurable:true,value:storage});
 if(storage.getItem('__seeded')!=='true'){
   storage.setItem('ai-assistant.welcomed','true');storage.setItem('ai-assistant.profile',JSON.stringify({name:'Friend'}));if(!seed)storage.setItem('ai-assistant.appearance',JSON.stringify({theme:'dark'}));
   if(seed&&seed.format==='oddbrain-look'&&seed.version===3){
     if(seed.appearance&&typeof seed.appearance==='object')storage.setItem('ai-assistant.appearance',JSON.stringify(seed.appearance));
     if(seed.look&&typeof seed.look==='object')storage.setItem('oddbrain.look.v2',JSON.stringify(seed.look));
     if(seed.sidebar&&typeof seed.sidebar==='object')storage.setItem('ai-assistant.sidebar',JSON.stringify(seed.sidebar));
   }
   storage.setItem('__seeded','true');
 }
 var bytes=Uint8Array.from(atob(document.getElementById('oddbrain-preview-bundle').textContent.trim()),function(c){return c.charCodeAt(0);});
 if(typeof DecompressionStream!=='function')throw Error('This browser needs a newer version.');
new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text().then(function(source){var script=document.createElement('script');script.id='oddbrain-preview-runtime';script.textContent=source;document.body.appendChild(script);setTimeout(function(){window.removeEventListener('error',fail);},4000);}).catch(function(error){console.error(error);fail();});
}catch(error){console.error(error);fail();}
})();`
const html = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src blob:; font-src data:; connect-src 'none'; frame-src data: blob:; object-src 'none'; base-uri 'none'"><title>OddBrain · actual app preview</title><style>${css}</style></head><body><div id="root"><div style="height:100vh;display:grid;place-content:center;background:#141417;color:#ececef"><div style="width:150px;height:150px">${mark}</div></div></div><script type="application/json" id="oddbrain-look-snapshot">null</script><script type="application/octet-stream" id="oddbrain-preview-bundle">${encoded}</script><script id="oddbrain-preview-bootstrap">${bootstrap}</script></body></html>`
if ((html.match(/<\/body>/g) || []).length !== 1) throw Error('Unsafe nested document tag in exported preview.')
for (const path of [join(root, 'resources/oddbrain-preview.html'), join(root, 'src/renderer/public/oddbrain-preview.html')]) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, html)
}
console.log(`Offline renderer preview: ${Buffer.byteLength(html).toLocaleString()} bytes, no external runtime or fonts.`)
