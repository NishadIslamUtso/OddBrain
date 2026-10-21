const path_ = require('node:path'); const { APP_ROOT, WORK } = require('./paths.cjs'); const REPO_ROOT = path_.resolve(APP_ROOT, '../..')
const ts = require(path_.join(APP_ROOT, 'node_modules/typescript')), fs = require('fs'), path = require('path'), cp = require('child_process')
const root = APP_ROOT
const files = cp.execSync(`git ls-files src`, { cwd: root }).toString().trim().split('\n').filter(f => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts'))
const rows = []
for (const rel of files) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8')
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const line = n => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1
  const visit = n => {
    if (ts.isTryStatement(n) && n.catchClause && n.catchClause.block.statements.length === 0) rows.push({ rel, line: line(n), form: 'try/catch{}', body: n.tryBlock.getText(sf) })
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'catch' && n.arguments[0] && ts.isArrowFunction(n.arguments[0])) {
      const b = n.arguments[0].body
      const empty = (ts.isBlock(b) && b.statements.length === 0) || (!ts.isBlock(b) && /^(undefined|void 0|null|false|\[\]|\{\})$/.test(b.getText(sf)))
      if (empty) rows.push({ rel, line: line(n), form: '.catch(()=>nothing)', body: n.expression.expression.getText(sf) })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}
const cls = r => /runCommand|runMediaCommand|spawn\(|execFile|ffmpeg|ffprobe/.test(r.body) ? 'runs an external program' : /fetch\(|fetchImpl|response|http/i.test(r.body) ? 'network call' : /writeFile|writeRecoverableJson|rename\(|copyFile|appendFile|createWriteStream|mkdir\(|\.write\(|saveEvidence|persist|save\(/i.test(r.body) ? 'writes owner data / files' : /\brm\(|unlink|rmSync|rmdir|kill|abort|cancel|release|close\(|removeListener|clearTimeout|destroy/i.test(r.body) ? 'cleanup (fine to ignore)' : /JSON\.parse|parse\(/.test(r.body) ? 'parsing' : 'other'
const by = {}; for (const r of rows) { r.cls = cls(r); (by[r.cls] = by[r.cls] || []).push(r) }
console.log(`empty catches (try/catch{} and .catch(()=>nothing)): ${rows.length}`)
for (const [k, v] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) console.log(`  ${String(v.length).padStart(3)}  ${k}`)
for (const k of ['runs an external program', 'writes owner data / files', 'network call']) { console.log(`\n${k}:`); for (const r of (by[k] || []).slice(0, 12)) console.log(`  ${r.rel.replace('src/', '')}:${r.line}  ${r.body.replace(/\s+/g, ' ').slice(0, 110)}`) }
fs.writeFileSync(path_.join(WORK, 'catches.json'), JSON.stringify(rows.map(({ body, ...r }) => r)))
