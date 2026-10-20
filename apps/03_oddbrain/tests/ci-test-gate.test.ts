import { expect, it } from 'vitest'
import { createRequire } from 'node:module'
const { checkReport } = createRequire(import.meta.url)('../scripts/check-ci-tests.cjs')
const reader = 'tests/conversation-runner.test.ts', outbox = 'tests/conversation-outbox-browser.test.ts'
const suite = (file: string, name = 'browser works', skipped = false) => `<testsuite name="${file}" tests="1" failures="0" errors="0" skipped="${Number(skipped)}"><testcase name="${name}">${skipped ? '<skipped/>' : ''}</testcase></testsuite>`
const report = (suites = [suite(reader), suite(outbox)]) => `<testsuites tests="${suites.length}" failures="0" errors="0">${suites.join('')}</testsuites>`
it('requires both reader and durable-restart browser suites on both operating systems', () => {
  for (const os of ['linux', 'win32']) {
    expect(checkReport(report(), os)).toEqual({ tests: 2, passed: 2, skipped: [] })
    expect(() => checkReport(report([suite(reader)]), os)).toThrow('Missing browser suite')
    expect(() => checkReport(report([suite(reader), suite(outbox, 'browser works', true)]), os)).toThrow('Unexpected skip')
  }
})
it('allows only named platform-specific Windows exceptions, not an arbitrary skip budget', () => {
  const specific = suite('tests/key-storage-durability.test.ts', 'rewriting a key file restores owner-only permissions', true)
  expect(checkReport(report([suite(reader), suite(outbox), specific]), 'win32').skipped).toHaveLength(1)
  expect(() => checkReport(report([suite(reader), suite(outbox), specific]), 'linux')).toThrow('Unexpected skip')
  expect(() => checkReport(report([suite(reader), suite(outbox), suite('tests/other.test.ts', 'unknown', true)]), 'win32')).toThrow('Unexpected skip')
})
it('rejects malformed, empty, duplicate, failed and inconsistent reports', () => {
  for (const xml of ['<testsuites>', report([]), report([suite(reader), suite(reader), suite(outbox)]), report().replace('tests="2"', 'tests="0"'), report().replace('failures="0"', 'failures="1"'), report().replace('<testcase name="browser works">', '<testcase name="browser works"><failure/>'), report().replace('skipped="0"', 'skipped="1"'), report().replace('tests="1"', 'tests="0"')]) {
    expect(() => checkReport(xml, 'linux')).toThrow()
  }
})
