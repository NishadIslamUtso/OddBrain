import { test, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import audit from './fixtures/ui-retention.json'
test('all 221 original dispatcher action purposes have explicit source traceability; only mobile UI is out of scope',()=>{
 expect(audit.actionCount).toBe(221);expect(audit.rows).toHaveLength(221);expect(new Set(audit.rows.map(r=>r.originalAction)).size).toBe(221)
 for(const row of audit.rows){expect(row.purpose.length).toBeGreaterThan(20);for(const p of row.nativeSources)expect(existsSync(resolve('src/renderer/src',p))).toBe(true)}
 expect(audit.rows.filter(r=>r.feature==='not-applicable-mobile').map(r=>r.originalAction)).toEqual(['mobile-menu'])
})
test('native controls use the real operational store, not only cosmetic look state',()=>{
 const controls=readFileSync(resolve('src/renderer/src/ui/AutomationControls.tsx'),'utf8'),main=readFileSync(resolve('src/main/index.ts'),'utf8')
 expect(controls).toContain('updateAutomation(patch)');expect(main).toContain('shouldCheckpoint: () => automation?.preferences().autoKeep !== false');expect(main).toContain('automation?.ingest(event)')
 expect(main).toContain('inferenceAllowed(usedEngine');expect(main).toContain("handle('automation:review'")
})
