const path_ = require('node:path'); const { APP_ROOT, WORK } = require('./paths.cjs'); const REPO_ROOT = path_.resolve(APP_ROOT, '../..')
const ts = require(path_.join(APP_ROOT, 'node_modules/typescript')), fs = require('fs'), path = require('path'), cp = require('child_process')
const root = APP_ROOT
const files = cp.execSync(`git ls-files src`, { cwd: root }).toString().trim().split('\n').filter(f => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts'))
const fns = []; let codeLines = 0, commentLines = 0, blank = 0, longLines = 0, totalLines = 0
for (const rel of files) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8'); const lines = text.split('\n'); totalLines += lines.length
  for (const l of lines) { const t = l.trim(); if (!t) blank++; else if (/^(\/\/|\/\*|\*)/.test(t)) commentLines++; else codeLines++; if (l.length > 160) longLines++ }
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const visit = (n, depth) => {
    let name = '', node = null
    if (ts.isFunctionDeclaration(n) && n.body) { name = n.name?.text || '(anonymous)'; node = n }
    else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer))) { name = n.name.text; node = n.initializer }
    else if (ts.isMethodDeclaration(n) && n.body && ts.isIdentifier(n.name)) { name = n.name.text; node = n }
    if (node) { const a = sf.getLineAndCharacterOfPosition(node.getStart()).line, b = sf.getLineAndCharacterOfPosition(node.getEnd()).line; fns.push({ rel, name, line: a + 1, len: b - a + 1 }) }
    ts.forEachChild(n, c => visit(c, depth + 1))
  }
  visit(sf, 0)
}
fns.sort((a, b) => a.len - b.len)
const med = fns[Math.floor(fns.length / 2)].len, p90 = fns[Math.floor(fns.length * 0.9)].len
console.log(`functions: ${fns.length}; median length ${med} lines; 90th percentile ${p90}; over 50 lines: ${fns.filter(f => f.len > 50).length}; over 100: ${fns.filter(f => f.len > 100).length}; over 300: ${fns.filter(f => f.len > 300).length}`)
console.log('longest functions (a function that long cannot be held in one head):')
for (const f of fns.slice(-8).reverse()) console.log(`  ${String(f.len).padStart(5)} lines  ${f.rel.replace('src/', '')}:${f.line}  ${f.name}`)
console.log(`\nlines: ${totalLines} total = ${codeLines} code + ${commentLines} comment + ${blank} blank; comment share of non-blank lines: ${(100 * commentLines / (codeLines + commentLines)).toFixed(1)}%; lines over 160 chars: ${longLines}`)
