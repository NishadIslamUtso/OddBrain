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
    if (ts.isTryStatement(n) && n.catchClause) {
      const cc = n.catchClause, name = cc.variableDeclaration && ts.isIdentifier(cc.variableDeclaration.name) ? cc.variableDeclaration.name.text : ''
      const blockText = cc.block.getText(sf)
      const usesError = name && new RegExp(`\\b${name}\\b`).test(blockText)
      const rethrows = /\bthrow\b/.test(blockText)
      const logs = /console\.|log\(|logger|report\(/.test(blockText)
      if (!usesError && !rethrows && !logs) rows.push({ rel, line: line(n), tryText: n.tryBlock.getText(sf), catchText: blockText })
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}
const cls = r => /runCommand|runMediaCommand|spawn\(|execFile|ffmpeg|ffprobe|prefs\.ffmpeg/.test(r.tryText) ? 'runs an external program' : /fetch\(|fetchImpl|jsonResponse|boundedResponse/.test(r.tryText) ? 'network call' : /writeFile|writeRecoverableJson|rename\(|copyFile|appendFile|\.write\(|mkdir\(/.test(r.tryText) ? 'writes files / owner data' : /\brm\(|unlink|rmSync|kill|abort|cancel|release|close\(|removeListener|clearTimeout|destroy/.test(r.tryText) ? 'cleanup (fine)' : /JSON\.parse|parse\(/.test(r.tryText) ? 'parsing' : 'other'
const by = {}; for (const r of rows) { r.cls = cls(r); (by[r.cls] = by[r.cls] || []).push(r) }
console.log(`try/catch blocks that ignore the error (no use of it, no throw, no log): ${rows.length}`)
for (const [k, v] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) console.log(`  ${String(v.length).padStart(3)}  ${k}`)
for (const k of ['runs an external program', 'writes files / owner data', 'network call']) { console.log(`\n${k}:`); for (const r of (by[k] || []).slice(0, 14)) console.log(`  ${r.rel.replace('src/', '')}:${r.line}  catch -> ${r.catchText.replace(/\s+/g, ' ').slice(0, 90)}`) }
fs.writeFileSync(path_.join(WORK, 'catches2.json'), JSON.stringify(rows.map(({ tryText, catchText, ...r }) => r)))
