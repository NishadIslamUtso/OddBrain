// @vitest-environment jsdom
import { beforeEach, test, expect, vi } from 'vitest'
import { installSampleBridge } from '../src/renderer/src/platform/sampleBridge'

/**
 * The browser preview is how the owner looks at this app without building it.
 * It already demonstrates the engine, the vault and the artifacts; the sign-in
 * answer, the Ollama version and the tool-server list must answer there too,
 * and must answer as a sample rather than as a refusal or as a lie.
 */

const no = () => vi.fn()
function fakeWorld() {
  const mcp = { read: vi.fn(), write: vi.fn() }
  const engine = {
    authStatus: vi.fn(), ollamaVersion: vi.fn(), openLogin: vi.fn(),
    read: no(), pick: no(), detect: no(), models: no(), send: no(), stop: no(), onEvent: no(), answer: no(),
    downloads: { serveStatus: no(), serveStart: no(), serveStop: no() },
    journal: { list: no(), append: no(), clear: no() },
    memory: { list: no(), remove: no() },
  }
  const bridge = {
    mcp, engine,
    projects: {}, structure: {}, settings: {}, artifacts: {},
  }
  installSampleBridge(bridge as never, engine as never)
  return { bridge: bridge as never as { mcp: { read: () => Promise<any>; write: (s: unknown) => Promise<any> }; engine: any } }
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('oddbrain.sample.mode', 'on')
})

test('the sample answers the sign-in question for both engines, and says it is a sample', async () => {
  const world = fakeWorld()
  const claude = await world.bridge.engine.authStatus('claude-code')
  expect(claude.ok).toBe(true)
  expect(claude.answer).toContain('Sample answer')
  expect(claude.answer).toContain('No CLI was run')
  const agy = await world.bridge.engine.authStatus('agy')
  expect(agy.ok).toBe(true)
  expect(agy.loggedIn).toBe(false)
  expect(agy.answer).toContain('does not report a sign-in state')
  const login = await world.bridge.engine.openLogin()
  expect(login.ok).toBe(false)
  expect(login.answer).toContain('no terminal')
})

test('the sample states an Ollama version and whether it can serve the local door', async () => {
  const world = fakeWorld()
  const answer = await world.bridge.engine.ollamaVersion()
  expect(answer.compatible).toBe(true)
  expect(answer.version).toMatch(/^\d+\.\d+\.\d+$/)
  expect(answer.answer).toContain('Nothing was contacted')
})

test('the sample writes tool servers into sample storage only, and refuses an invalid one', async () => {
  const world = fakeWorld()
  expect(await world.bridge.mcp.read()).toEqual({ servers: [], problem: '' })
  const saved = await world.bridge.mcp.write([{ name: 'files', command: 'npx', args: ['-y', 'files-mcp'] }])
  expect(saved.ok).toBe(true)
  expect(saved.written.join(' ')).toContain('Sample workspace')
  expect(saved.answer).toContain('No engine config was touched')
  expect((await world.bridge.mcp.read()).servers).toEqual([{ name: 'files', command: 'npx', args: ['-y', 'files-mcp'] }])

  const refused = await world.bridge.mcp.write([{ name: 'bad name', command: 'npx' }])
  expect(refused.ok).toBe(false)
  expect((await world.bridge.mcp.read()).servers).toHaveLength(1)
})
