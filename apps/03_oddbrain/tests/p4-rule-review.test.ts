// NOT RUN. Review of instructions never constitutes runtime permission approval.
import { expect, test } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createProjectRuleReview, upsertBlock, BLOCK_START, BLOCK_END } from '../src/main/engine/houseRulesDeploy'
test('ambiguous ownership markers refuse instead of adding competing rules', () => {
  expect(() => upsertBlock(BLOCK_START + 'unfinished', 'replacement')).toThrow('ambiguous')
  expect(() => upsertBlock(`${BLOCK_START}${BLOCK_END}${BLOCK_START}${BLOCK_END}`, 'replacement')).toThrow()
})
test('rule review preserves owner prose, supports deny and rechecks authority on allow', () => {
  const dir = mkdtempSync(join(tmpdir(), 'p4-rules-')), file = join(dir, 'CLAUDE.md')
  try {
    writeFileSync(file, 'Owner prose\n'); let authorized = true
    const service = createProjectRuleReview(path => { if (!authorized || path !== file) throw Error('Not authorized') })
    const denied = service.preview(file, 'Rule one'); expect(service.decide(denied.token, 'deny').ok).toBe(true); expect(readFileSync(file, 'utf8')).toBe('Owner prose\n')
    const revoked = service.preview(file, 'Rule two'); authorized = false
    expect(service.decide(revoked.token, 'allow').ok).toBe(false); expect(readFileSync(file, 'utf8')).toBe('Owner prose\n')
    authorized = true; const allowed = service.preview(file, 'Rule three'); expect(service.decide(allowed.token, 'allow').ok).toBe(true)
    expect(readFileSync(file, 'utf8')).toContain('Owner prose\n'); expect(readFileSync(file, 'utf8')).toContain('Rule three')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
