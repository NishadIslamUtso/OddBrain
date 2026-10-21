'use strict'
// Runs the REAL backupVault on a vault holding one big file and reports the longest time the event loop could
// not answer anything. In the app this is the main process, so the window cannot answer either.
const fs = require('node:fs'), path = require('node:path')
const { WORK, OUT } = require('./paths.cjs')
const { backupVault } = require(path.join(OUT, 'backup.cjs'))
const mb = Number(process.env.AUDIT_BACKUP_MB || 1024)
const vault = path.join(WORK, 'stall-vault'), target = path.join(WORK, 'stall-vault-backup')
fs.rmSync(vault, { recursive: true, force: true }); fs.rmSync(target, { recursive: true, force: true })
fs.mkdirSync(path.join(vault, 'Brain'), { recursive: true })
fs.writeFileSync(path.join(vault, 'Brain', 'note.md'), '# a note\n')
const chunk = require('node:crypto').randomBytes(1024 * 1024), fd = fs.openSync(path.join(vault, 'big-attachment.bin'), 'w')
for (let i = 0; i < mb; i++) fs.writeSync(fd, chunk); fs.closeSync(fd)
let last = process.hrtime.bigint(), worst = 0
const timer = setInterval(() => { const now = process.hrtime.bigint(); worst = Math.max(worst, Number(now - last) / 1e6); last = now }, 10)
setTimeout(() => {
  const t0 = Date.now(), result = backupVault(vault, target), took = (Date.now() - t0) / 1000
  setTimeout(() => {
    clearInterval(timer)
    const verdict = worst > 1000 ? 'DEFECT' : 'PASS'
    console.log(`[${verdict}] B01 backupVault on ${mb} MB: ok=${result.ok}, took ${took.toFixed(1)} s, longest time the app could not answer: ${(worst / 1000).toFixed(1)} s (a healthy loop answers every 0.01 s)`)
    fs.rmSync(vault, { recursive: true, force: true }); fs.rmSync(target, { recursive: true, force: true }); process.exit(0)
  }, 100)
}, 200)
