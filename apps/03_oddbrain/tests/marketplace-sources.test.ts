import { test, expect } from 'vitest'
import { KNOWN_MARKETPLACES } from '../src/shared/lib/marketplace'
import { repository } from '../src/main/engine/marketplace'

test('the suggested catalogs are real owner/repository names the fetch path accepts', () => {
  expect(KNOWN_MARKETPLACES.length).toBeGreaterThan(0)
  for (const source of KNOWN_MARKETPLACES) {
    expect(() => repository(source.repo)).not.toThrow()
    expect(source.repo).toMatch(/^[a-zA-Z0-9][\w-]*\/[a-zA-Z0-9][\w.-]*$/)
    expect(source.label.length).toBeGreaterThan(0)
  }
  expect(KNOWN_MARKETPLACES.map(source => source.repo)).toContain('anthropics/claude-code')
})
