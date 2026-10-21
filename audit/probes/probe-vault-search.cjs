'use strict'
// Runs the REAL searchVault on synthetic vaults of growing size and reports time per query and event-loop stall.
const fs = require('node:fs'), path = require('node:path')
const { WORK, OUT } = require('./paths.cjs')
const { createVaultFiles } = require(path.join(OUT, 'vfiles.cjs')), { searchVault } = require(path.join(OUT, 'recall.cjs'))
const words = 'meeting notes project idea video script caption music budget travel family health reading course exam deadline'.split(' ')
const note = (n, kb) => { let t = `# Note ${n}\n\n`; for (let i = 0; i < kb * 1024 / 7; i++) t += words[(i * 13 + n) % words.length] + (i % 12 === 11 ? '.\n' : ' '); return t }
function build(root, count, kb) {
  fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(path.join(root, '00 System'), { recursive: true }); fs.mkdirSync(path.join(root, 'Notes'), { recursive: true })
  fs.writeFileSync(path.join(root, '00 System', 'Privacy & Access.md'), '# Privacy\n')
  for (let i = 0; i < count; i++) fs.writeFileSync(path.join(root, 'Notes', `note-${i}.md`), note(i, kb))
}
const sizes = (process.env.AUDIT_VAULT_NOTES || '76,3000,20000').split(',').map(Number)
const run = count => new Promise(done => {
  const root = path.join(WORK, `search-vault-${count}`); build(root, count, 3)
  const files = createVaultFiles(root, () => new Date())
  let worst = 0, last = process.hrtime.bigint(); const timer = setInterval(() => { const now = process.hrtime.bigint(); worst = Math.max(worst, Number(now - last) / 1e6); last = now }, 5)
  setTimeout(() => {
    const t0 = Date.now(), reply = searchVault(files, 'budget deadline exam', { purpose: 'personal' }), ms = Date.now() - t0
    setTimeout(() => { clearInterval(timer); fs.rmSync(root, { recursive: true, force: true })
      console.log(`[${worst > 1000 || reply.notices?.some(n => /Not all saved files/.test(n)) ? 'DEFECT' : 'INFO'}] B02 ${String(count).padStart(6)} notes x 3 KB: one search ${ms} ms, app unresponsive ${(worst / 1000).toFixed(2)} s${reply.notices?.length ? ', notice: ' + reply.notices[0].slice(0, 70) : ''}`); done() }, 50)
  }, 100)
})
;(async () => { for (const n of sizes) await run(n); process.exit(0) })()
