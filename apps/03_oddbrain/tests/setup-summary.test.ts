import { expect, test } from 'vitest'
import { setupSummary } from '../src/shared/lib/setupSummary'
import { DEFAULT_ENGINE } from '../src/shared/lib/engine'
test('setup diagnostics omit all user text and secret-bearing addresses rather than attempting to scrub arbitrary logs', () => {
  const raw = setupSummary({ appVersion: '0.9.0', platform: 'win32', settings: { ...DEFAULT_ENGINE, model: 'private-model-secret', workspace: 'C:\\Users\\Private Name', baseUrl: 'https://user:password@private.example/path?token=secret' }, engines: [{ id: 'agy', found: true, version: 'agy 1.4.2 private-account-secret' }], running: true })
  expect(raw).not.toMatch(/private|password|token=|Users|account-secret/i)
  expect(JSON.parse(raw)).toMatchObject({ appVersion: '0.9.0', explicitModel: true, customWorkspace: true, processRunning: true, engines: [{ engine: 'agy', found: true, version: '1.4.2' }] })
  expect(raw).toContain('not verified')
})
test('unknown versions and providers never become fabricated health checks', () => {
  const r = JSON.parse(setupSummary({ appVersion: 'unknown', platform: 'secret-platform', settings: { ...DEFAULT_ENGINE, id: 'agy', baseUrl: '' }, engines: [{ id: 'unexpected-secret', found: true, version: 'secret' }, { id: 'agy', found: false }], running: false }))
  expect(r.appVersion).toBe('Not reported'); expect(r.platform).toBe('Unknown'); expect(r.engines).toEqual([{ engine: 'agy', found: false, version: 'Not reported' }])
})
