const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { createVaultApp } = require('../server/vault-api.cjs')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-assistant-e2e-'))
fs.mkdirSync(path.join(root, '00 System'), { recursive: true })
fs.writeFileSync(path.join(root, '00 System/Privacy & Access.md'), '# Privacy\n\n```yaml\nexcluded_patterns:\n  - bank.com/*\n```\n')
fs.mkdirSync(path.join(root, '03 Memory/Entities'), { recursive: true })
fs.writeFileSync(path.join(root, '03 Memory/Entities/capsule-synthetic.md'), '---\nid: capsule-synthetic\ntype: capsule\ntitle: Synthetic website capsule\nversion: 1\nstatus: active\n---\n\n# Capsule: Synthetic website capsule\n\n## Background\nSynthetic blue and white website design. This is test data, not a personal memory.\n\n## Sources\n- Synthetic test fixture\n')
const server = createVaultApp({ vaultPath: root }).listen(18765, '0.0.0.0')
const vite = spawn(process.execPath, [path.resolve(__dirname, '../node_modules/vite/bin/vite.js'), '--host', '0.0.0.0', '--port', '5174'], {
  cwd: path.resolve(__dirname, '..'), env: { ...process.env, VAULT_API_URL: 'http://127.0.0.1:18765' }, stdio: 'inherit',
})
let closing = false
function cleanup(code = 0) {
  if (closing) return
  closing = true
  vite.kill('SIGTERM')
  server.close(() => { fs.rmSync(root, { recursive: true, force: true }); process.exit(code) })
  setTimeout(() => { fs.rmSync(root, { recursive: true, force: true }); process.exit(code) }, 2000).unref()
}
process.on('SIGTERM', () => cleanup()); process.on('SIGINT', () => cleanup())
server.on('error', error => { console.error(error.message); cleanup(1) })
vite.on('error', error => { console.error(error.message); cleanup(1) })
vite.on('exit', code => { if (!closing) cleanup(code || 0) })
