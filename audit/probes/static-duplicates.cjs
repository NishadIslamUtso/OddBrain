const path_ = require('node:path'); const { APP_ROOT, WORK } = require('./paths.cjs'); const REPO_ROOT = path_.resolve(APP_ROOT, '../..')
const ts = require(path_.join(APP_ROOT, 'node_modules/typescript')), fs = require('fs'), path = require('path'), cp = require('child_process')
const root = APP_ROOT
const files = cp.execSync(`git ls-files src`, { cwd: root }).toString().trim().split('\n').filter(f => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts'))
const groups = new Map()
const norm = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ').trim()
for (const rel of files) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8')
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const visit = n => {
    let name = '', node = null
    if (ts.isFunctionDeclaration(n) && n.name && n.body) { name = n.name.text; node = n }
    else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) { name = n.name.text; node = n.initializer }
    if (node) {
      const body = norm(node.getText(sf)); 
      if (body.length >= 70) { const key = body; const g = groups.get(key) || []; g.push({ rel, name, line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, lines: sf.getLineAndCharacterOfPosition(n.getEnd()).line - sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, chars: body.length }); groups.set(key, g) }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
}
const dup = [...groups.values()].filter(g => g.length >= 2 && new Set(g.map(x => x.rel)).size >= 2).sort((a, b) => b[0].chars * (b.length - 1) - a[0].chars * (a.length - 1))
console.log(`identical function bodies (>=70 chars) copied into 2+ files: ${dup.length} groups, ${dup.reduce((n, g) => n + g.length - 1, 0)} extra copies, about ${dup.reduce((n, g) => n + (g.length - 1) * g[0].lines, 0)} lines`)
for (const g of dup.slice(0, 22)) console.log(`  x${g.length}  ${g[0].name}  (${g[0].lines} line${g[0].lines > 1 ? 's' : ''}, ${g[0].chars} chars)  in: ${g.map(x => `${x.rel.replace('src/', '')}:${x.line}`).join('  ')}`)
