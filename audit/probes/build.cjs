// Bundle the REAL app modules (unmodified) so probes exercise shipped code, not copies.
const path = require('node:path'), fs = require('node:fs')
const { APP_ROOT, OUT } = require('./paths.cjs')
const esbuild = require(path.join(APP_ROOT, 'node_modules/esbuild'))
const root = path.join(APP_ROOT, 'src')
fs.mkdirSync(OUT, { recursive: true })
const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node24', logLevel: 'warning', packages: 'external', sourcemap: 'inline' }
Promise.all([
  esbuild.build({ ...common, entryPoints: [root + '/main/video/service.ts'], outfile: path.join(OUT, 'video-service.cjs') }),
  esbuild.build({ ...common, entryPoints: [root + '/main/media/service.ts'], outfile: path.join(OUT, 'media-service.cjs') }),
  esbuild.build({ ...common, entryPoints: [root + '/shared/lib/videoStudio.ts'], outfile: path.join(OUT, 'video-shared.cjs') }),
  esbuild.build({ ...common, entryPoints: [root + '/main/video/nativeProtocol.ts'], outfile: path.join(OUT, 'native-protocol.cjs') }),
  esbuild.build({ ...common, entryPoints: [root + '/shared/lib/videoEditingSkill.ts'], outfile: path.join(OUT, 'skill.cjs') }),
  esbuild.build({ ...common, entryPoints: [root + '/main/media/process.ts'], outfile: path.join(OUT, 'process.cjs') }),
  esbuild.build({ ...common, entryPoints: [root + '/main/vault/backup.ts'], outfile: path.join(OUT, 'backup.cjs') }),
  esbuild.build({ ...common, entryPoints: [root + '/main/vault/recall.ts'], outfile: path.join(OUT, 'recall.cjs') }),
  esbuild.build({ ...common, entryPoints: [root + '/main/vault/files.ts'], outfile: path.join(OUT, 'vfiles.cjs') }),
]).then(() => console.log('bundled OK')).catch(e => { console.error('BUNDLE FAILED', e.message); process.exit(1) })
