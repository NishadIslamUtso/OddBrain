import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  brainFileContents,
  brainFilePaths,
  classifyBrainRoot,
  planBrainApply,
  planBrainRefresh,
  applyConflictAction,
  besidePath,
  defaultVaultPath,
} from '../src/shared/lib/brainStructure'

/**
 * The second-brain structure (his 2026-10-16 order). The one rule everything
 * here protects: adoption ADDS, it never overwrites. What a folder already
 * holds is counted, named, and left exactly as it was.
 */

test('classify reads the real entries, never guesses', () => {
  assert.equal(classifyBrainRoot(['00 System', '02 Sources', '09 Activity & Undo', 'index.md']).kind, 'app-structure')
  assert.equal(classifyBrainRoot(['.obsidian', 'Notes', 'Daily']).kind, 'obsidian')
  assert.equal(classifyBrainRoot(['raw', 'wiki', 'journal', 'CLAUDE.md']).kind, 'llm-wiki')
  assert.equal(classifyBrainRoot([]).kind, 'empty')
  assert.equal(classifyBrainRoot(['.stash']).kind, 'empty')
  assert.equal(classifyBrainRoot(['Documents', 'budget.xlsx']).kind, 'other')
})

test('brainFilePaths names the five base files; templates ride along for app-shaped vaults', () => {
  assert.deepEqual([...brainFilePaths()].sort(), [
    '05 Knowledge/README.md',
    '10 People/README.md',
    'AGENTS.md',
    'CLAUDE.md',
    'index.md',
  ])
  const app = [...brainFileContents('app-structure').keys()].sort()
  assert.deepEqual(app, [
    '00 System/Privacy & Access.md',
    '00 System/START HERE.md',
    '00 System/Templates/Knowledge Note.md',
    '00 System/Templates/Person.md',
    '05 Knowledge/README.md',
    '10 People/README.md',
    'AGENTS.md',
    'CLAUDE.md',
    'index.md',
  ])
  // A foreign layout is never handed a 00 System folder it did not ask for.
  assert.ok(!brainFileContents('llm-wiki').has('00 System/Templates/Person.md'))
})

test('the rulebooks carry the researched rules: path links, templates, Evolution, status lifecycle, #manual', () => {
  const rules = brainFileContents('app-structure').get('CLAUDE.md') || ''
  assert.match(rules, /not by bare name/)
  assert.match(rules, /00 System\/Templates\//)
  assert.match(rules, /## Evolution \[YYYY-MM-DD\]/)
  assert.match(rules, /`raw` while written/)
  assert.match(rules, /#manual/)
  // The template itself carries the lifecycle honestly: raw until audited.
  const template = brainFileContents('app-structure').get('00 System/Templates/Knowledge Note.md') || ''
  assert.match(template, /status: raw/)
  assert.match(template, /last_ai_audit: ""/)
})

test('planBrainRefresh names only rulebooks whose wording differs; identical text is never listed', () => {
  const current = brainFileContents('app-structure')
  const same = (relative: string): string | null => current.get(relative) ?? null
  assert.deepEqual(planBrainRefresh('app-structure', same), [])
  const older = (relative: string): string | null => (current.get(relative) ?? '') + '\n<!-- old wording -->'
  assert.deepEqual(planBrainRefresh('app-structure', older), ['index.md', 'CLAUDE.md', 'AGENTS.md'])
  const partial = (relative: string): string | null => (relative === 'CLAUDE.md' ? 'stale' : current.get(relative) ?? null)
  assert.deepEqual(planBrainRefresh('app-structure', partial), ['CLAUDE.md'])
  // A missing file is not "differing" — the plain apply writes it once.
  assert.deepEqual(planBrainRefresh('app-structure', () => null), [])
})

test('on a fresh folder the plan writes everything, and the rules carry the wall and the link honesty', () => {
  const plan = planBrainApply('app-structure', () => false)
  assert.equal(plan.writes.length, 9)
  const claude = plan.writes.find(file => file.relative === 'CLAUDE.md')
  assert.ok(claude)
  assert.match(claude.content, /Never edit or delete anything in `02 Sources\/`/)
  assert.match(claude.content, /Synthesis lands in `05 Knowledge\/`/)
  assert.match(claude.content, /Link only files that exist/)
  assert.match(claude.content, /excluded patterns.*absolute/s)
  const agy = plan.writes.find(file => file.relative === 'AGENTS.md')
  assert.ok(agy && agy.content.includes('AGENTS.md'))
  const index = plan.writes.find(file => file.relative === 'index.md')
  assert.ok(index && index.content.includes('## Changes'))
})

test('a raw/wiki vault is met where it stands: the rules speak its names', () => {
  const plan = planBrainApply('llm-wiki', relative => relative === 'raw/README.md')
  const claude = plan.writes.find(file => file.relative === 'CLAUDE.md')
  assert.ok(claude)
  assert.match(claude.content, /Never edit or delete anything in `raw\/`/)
  assert.ok(!claude.content.includes('02 Sources'))
  // An existing path is never planned for writing, even when siblings are missing.
  assert.ok(!plan.writes.some(file => file.relative === 'raw/README.md'))
  assert.ok(plan.writes.every(file => brainFilePaths().includes(file.relative)))
  // And the index map speaks this vault's own names.
  const index = plan.writes.find(file => file.relative === 'index.md')
  assert.ok(index && index.content.includes('raw') && index.content.includes('wiki'))
})

test('apply on a real folder lands byte for byte, and a second apply adds nothing', t => {
  const root = mkdtempSync(join(tmpdir(), 'oddbrain-structure-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  // The app's own door logic: plan, then write each file exclusively.
  const applyOnce = (): string[] => {
    const names = existsSync(root) ? [] : []
    const { kind } = classifyBrainRoot(names.length ? names : [])
    const plan = planBrainApply(kind, relative => existsSync(join(root, relative)))
    for (const file of plan.writes) {
      mkdirSync(join(root, file.relative, '..'), { recursive: true })
      writeFileSync(join(root, file.relative), file.content, { flag: 'wx' })
    }
    return plan.writes.map(file => file.relative)
  }
  const first = applyOnce()
  assert.equal(first.length, 9)
  assert.ok(existsSync(join(root, '05 Knowledge/README.md')))
  assert.ok(existsSync(join(root, '10 People/README.md')))
  assert.match(readFileSync(join(root, 'index.md'), 'utf8'), /## Changes/)
  const second = applyOnce()
  assert.equal(second.length, 0)
})

test('the structure content is a fixed, honest set — same bytes for the same kind', () => {
  const a = brainFileContents('app-structure')
  const b = brainFileContents('app-structure')
  assert.equal(a.get('CLAUDE.md'), b.get('CLAUDE.md'))
  assert.notEqual(a.get('CLAUDE.md'), a.get('AGENTS.md'))
})

test('the default path is Documents/OddBrain/Brain under any home', () => {
  // Separators are the platform's business; the shape is not.
  assert.match(defaultVaultPath('C:\\Users\\utso'), /Documents[/\\]OddBrain[/\\]Brain$/)
  assert.ok(defaultVaultPath('C:\\Users\\utso').startsWith('C:\\Users\\utso'))
  assert.match(defaultVaultPath('/home/user'), /^[/\\]home[/\\]user[/\\]Documents[/\\]OddBrain[/\\]Brain$/)
  assert.throws(() => defaultVaultPath(''))
})

test('an existing file with different content is kept AND the default lands beside it as a conflict', () => {
  const current = brainFileContents('app-structure')
  const exists = (relative: string): boolean => relative === 'CLAUDE.md' || relative === 'index.md'
  const read = (relative: string): string | null =>
    relative === 'CLAUDE.md' ? '# my own rules\n' : (current.get(relative) ?? null)
  const plan = planBrainApply('app-structure', exists, read)
  // identical-content files still count as present, not conflicts
  assert.ok(plan.present.includes('index.md'))
  assert.deepEqual(plan.conflicts, [{ original: 'CLAUDE.md', added: 'CLAUDE (new).md' }])
  const beside = plan.writes.find(file => file.relative === 'CLAUDE (new).md')
  assert.ok(beside, 'the beside copy is planned')
  assert.equal(beside.content, current.get('CLAUDE.md'))
  // the owner's own file is never in the writes plan
  assert.ok(!plan.writes.some(file => file.relative === 'CLAUDE.md'))
})

test('identical content means one file and no conflict asked', () => {
  const current = brainFileContents('app-structure')
  const plan = planBrainApply('app-structure', relative => relative === 'index.md', relative => current.get(relative) ?? null)
  assert.deepEqual(plan.conflicts, [])
  assert.ok(plan.present.includes('index.md'))
})

test('besidePath keeps folders and extensions intact', () => {
  assert.equal(besidePath('CLAUDE.md'), 'CLAUDE (new).md')
  assert.equal(besidePath('00 System/Templates/Person.md'), '00 System/Templates/Person (new).md')
})

test('the four conflict answers do exactly what they say', () => {
  const mine = '# my rules\n'
  const theirs = '# app rules\n'
  assert.deepEqual(applyConflictAction('mine', mine, theirs), { original: null, deleteAdded: true })
  assert.deepEqual(applyConflictAction('new', mine, theirs), { original: theirs, deleteAdded: true })
  assert.deepEqual(applyConflictAction('both', mine, theirs), { original: null, deleteAdded: false })
  const combined = applyConflictAction('combine', mine, theirs)
  assert.equal(combined.deleteAdded, true)
  assert.ok(combined.original?.startsWith(mine))
  assert.ok(combined.original?.endsWith(theirs))
})
