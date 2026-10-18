// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { pinOwnOrigins, resetOwnOrigins, urlIsOurs } from '../src/main/ipcGuard'

/**
 * The one origin check, adversarially. These are the URLs a hostile page
 * would try: the app's own address smuggled into user-info, port-1
 * lookalikes, borrowed hostnames, arbitrary files. Every refusal here is a
 * path to the preload bridge that stays shut.
 */
const DEV = 'http://localhost:5173'
const PACKAGED = 'http://127.0.0.1:49152'
const APP_FILE = 'file:///C:/Program%20Files/OddBrain/resources/app.asar/index.html'

beforeEach(() => resetOwnOrigins())

describe('the one origin check', () => {
  beforeEach(() => pinOwnOrigins([DEV, PACKAGED, APP_FILE]))

  it('accepts the pages the app itself loaded, with any path or query', () => {
    expect(urlIsOurs(DEV + '/')).toBe(true)
    expect(urlIsOurs(DEV + '/settings?pane=engines')).toBe(true)
    expect(urlIsOurs(PACKAGED + '/index.html')).toBe(true)
  })

  it('refuses the app address worn as user-info by a hostile host', () => {
    // The prefix-regex bug: this URL STARTS with the pinned text, but its
    // origin is attacker.example. Node itself parses it so.
    expect(new URL(`${PACKAGED}@attacker.example/`).origin).toBe('http://attacker.example')
    expect(urlIsOurs(`${PACKAGED}@attacker.example/steal`)).toBe(false)
    expect(urlIsOurs(`${DEV}@attacker.example/`)).toBe(false)
  })

  it('refuses nearby ports and borrowed hostnames — different origins', () => {
    expect(urlIsOurs('http://localhost:51730/')).toBe(false)
    expect(urlIsOurs('http://localhost:5174/')).toBe(false)
    expect(urlIsOurs('http://127.0.0.1:49153/')).toBe(false)
    expect(urlIsOurs('http://localhost.evil.example:5173/')).toBe(false)
    expect(urlIsOurs('http://evil.example/')).toBe(false)
  })

  it('refuses every file URL except the app\u2019s own, exactly', () => {
    expect(urlIsOurs(APP_FILE)).toBe(true)
    expect(urlIsOurs(APP_FILE + '#section')).toBe(true, 'a hash rides along; the file is the same')
    expect(urlIsOurs('file:///etc/passwd')).toBe(false)
    expect(urlIsOurs('file:///C:/Windows/System32/config')).toBe(false)
    expect(urlIsOurs('file:///C:/Program%20Files/OddBrain/resources/app.asar/OTHER.html')).toBe(false)
  })

  it('refuses other schemes, garbage, and nothing', () => {
    expect(urlIsOurs('https://localhost:5173/')).toBe(false, 'an https twin is a different origin')
    expect(urlIsOurs('javascript:alert(1)')).toBe(false)
    expect(urlIsOurs('data:text/html,<h1>hi</h1>')).toBe(false)
    expect(urlIsOurs('not a url')).toBe(false)
    expect(urlIsOurs('')).toBe(false)
  })

  it('refuses everything when nothing is pinned - the fresh-slate rule', () => {
    resetOwnOrigins()
    pinOwnOrigins([])
    expect(urlIsOurs(DEV + '/')).toBe(false)
    expect(urlIsOurs(APP_FILE)).toBe(false)
  })

  it('pinning is additive: a later window joins, nothing is silently un-trusted', () => {
    // The quick window can be created after the main window (or before the
    // API exists); pinning it must not wipe the main window's trust.
    pinOwnOrigins(['http://localhost:5174'])
    expect(urlIsOurs(PACKAGED + '/')).toBe(true)
    expect(urlIsOurs(DEV + '/')).toBe(true)
    expect(urlIsOurs('http://localhost:5174/')).toBe(true)
  })

  it('only resetOwnOrigins un-trusts — the tests\u2019 fresh slate', () => {
    resetOwnOrigins()
    expect(urlIsOurs(DEV + '/')).toBe(false)
    expect(urlIsOurs(APP_FILE)).toBe(false)
  })
})
