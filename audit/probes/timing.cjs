const fs=require('fs'), path=require('path'); const { WORK, OUT } = require('./paths.cjs'); const { createMediaService } = require(path.join(OUT, 'media-service.cjs')); const { runMediaCommand } = require(path.join(OUT, 'process.cjs'))
const timings = []
const run = async (cmd, args, signal, timeout, limit) => { const t0 = Date.now(); try { return await runMediaCommand(cmd, args.map(a => typeof a === 'string' ? a.replace('file=pipe\\:1','file=-') : a), signal, timeout, limit) } finally { const kind = args.includes('-vf') ? (args.join(' ').includes('select=') ? 'scene pass' : 'other-video') : args.join(' ').includes('astats') ? 'RMS pass' : args.join(' ').includes('silencedetect') ? 'silence pass' : args.join(' ').includes('pcm_s16le') ? 'wav extract' : args.includes('-frames:v') ? 'frame grab' : cmd.includes('ffprobe') ? 'ffprobe' : 'other'; timings.push([kind, (Date.now()-t0)/1000]) } }
const root = fs.mkdtempSync(path.join(WORK, 't-'))
const media = createMediaService({ file: path.join(root,'media.json'), sourceRoot: path.join(root,'o'), runCommand: run, access: () => ({ permissions:{local:true}, external:false, key:()=>'', customBaseUrl:'' }), recognize: async () => 'stub' })
const p = process.argv[2], t0 = Date.now()
media.decodeFile(1, p, { name: path.basename(p), mime:'video/mp4', size: fs.statSync(p).size, route:'local', storage:'in-place' }).then(r => {
  const total = (Date.now()-t0)/1000
  const by = timings.reduce((m,[k,v]) => (m[k]=(m[k]||0)+v, m), {})
  console.log(path.basename(p), 'total', total.toFixed(1)+'s', 'passes:', JSON.stringify(Object.fromEntries(Object.entries(by).map(([k,v])=>[k,+v.toFixed(1)]))), 'hash/other:', (total - Object.values(by).reduce((a,b)=>a+b,0)).toFixed(1)+'s', 'frames:', r.images.length, 'scenes:', r.sceneMap.length)
})
