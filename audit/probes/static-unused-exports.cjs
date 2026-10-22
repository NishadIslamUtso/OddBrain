const path_ = require('node:path'); const { APP_ROOT, WORK } = require('./paths.cjs'); const REPO_ROOT = path_.resolve(APP_ROOT, '../..')
const ts = require(path_.join(APP_ROOT, 'node_modules/typescript')), fs = require('fs'), path = require('path'), cp = require('child_process')
const root = APP_ROOT
const files = cp.execSync(`git ls-files src`, { cwd: root }).toString().trim().split('\n').filter(f => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts')).map(f => path.join(root, f))
const idsByFile = new Map(), src = new Map()
for (const f of files) { const t = fs.readFileSync(f, 'utf8'); src.set(f, t); idsByFile.set(f, new Set(t.match(/[A-Za-z_$][\w$]*/g))) }
const filesWith = new Map(); for (const [f, ids] of idsByFile) for (const id of ids) { if (!filesWith.has(id)) filesWith.set(id, new Set()); filesWith.get(id).add(f) }
const out = []
for (const f of files) {
  const sf = ts.createSourceFile(f, src.get(f), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const names = []
  sf.forEachChild(n => {
    const exported = n.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
    if (!exported) return
    const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1
    if (ts.isVariableStatement(n)) n.declarationList.declarations.forEach(d => ts.isIdentifier(d.name) && names.push([d.name.text, line, 'const', n.getEnd() - n.getStart(), sf.getLineAndCharacterOfPosition(n.getEnd()).line + 1]))
    else if (n.name && ts.isIdentifier(n.name)) names.push([n.name.text, line, ts.SyntaxKind[n.kind].replace('Declaration', ''), n.getEnd() - n.getStart(), sf.getLineAndCharacterOfPosition(n.getEnd()).line + 1])
  })
  for (const [name, line, kind, size, endLine] of names) {
    const users = [...(filesWith.get(name) || [])].filter(u => u !== f)
    if (users.length === 0) out.push({ file: path.relative(root, f), name, line, endLine, lines: endLine - line + 1, kind, chars: size, inFileUses: (src.get(f).match(new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`, 'g')) || []).length })
  }
}
// who used it in the old tests?
const oldTests = (name) => { try { return cp.execSync(`git grep -l -w -F "${name}" ba66c9d -- apps/03_oddbrain/tests | wc -l`, { cwd: REPO_ROOT }).toString().trim() } catch { return '0' } }
for (const o of out) o.oldTestFiles = Number(oldTests(o.name))

const repoUses = (name) => { try { return Number(cp.execSync(`git grep -I -w -F -c "${name}" -- . ':!package-lock.json' | awk -F: '{s+=$NF} END {print s+0}'`, { cwd: REPO_ROOT, shell: '/bin/bash' }).toString().trim()) } catch { return 0 } }
for (const o of out) if (o.kind !== 'TypeAlias' && o.kind !== 'InterfaceDeclaration' && o.kind !== 'Interface') o.repoWideOccurrences = repoUses(o.name)
fs.writeFileSync(path_.join(WORK, 'unused-exports.json'), JSON.stringify(out, null, 1))

const code = out.filter(o => o.kind !== 'TypeAlias' && o.kind !== 'Interface')
const dead = code.filter(o => o.repoWideOccurrences <= 1)             // only its own definition mentions it, anywhere in the repo
const testsOnly = dead.filter(o => o.oldTestFiles > 0), unused = dead.filter(o => o.oldTestFiles === 0)
const hooks = testsOnly.filter(o => /^reset|ForTests$|State$/.test(o.name)), L = a => a.reduce((n, o) => n + o.lines, 0)
console.log(`exported functions/constants with no use in another src file: ${code.length}; also not mentioned anywhere else in the repo: ${dead.length} items, about ${L(dead)} lines`)
console.log(`  used only by the deleted tests: ${testsOnly.length} items, ${L(testsOnly)} lines (${hooks.length} are test hooks or state getters, ${testsOnly.length - hooks.length} are real helpers the app never calls)`)
console.log(`  never used and never tested: ${unused.length} items, ${L(unused)} lines`)
const rows = ['# Exported functions and constants that nothing in the repo calls (written by static-unused-exports.cjs)', '# lines | where | what | status', '# tests-only = only the deleted tests used it; unused = no user and no test', '# Method: every export in src/** with no use in another src file, then a whole-repo word search (app, extension, scripts, store, vault). Types are excluded.', '']
for (const o of dead.sort((a, b) => b.lines - a.lines)) rows.push(`${String(o.lines).padStart(3)} | ${o.file.replace('src/', '')}:${o.line} | ${o.kind} ${o.name} | ${o.oldTestFiles > 0 ? 'tests-only' : 'unused'}`)
const deadOut = process.env.AUDIT_DEAD_CODE_OUT || path_.resolve(__dirname, '..', 'dead-code.txt'); fs.writeFileSync(deadOut, rows.join('\n') + '\n'); console.log('wrote ' + deadOut)
