/**
 * blacklist-parity.test.cjs
 *
 * The never-check list is enforced in two places: the vault API (server-side,
 * when captures arrive) and the browser extension (client-side, before anything
 * is read from a page). If they disagree, a pattern the user trusted is quietly
 * not enforced in one of them.
 *
 * This asserts both implementations return the same answer for every case,
 * including the look-alike host the rules exist to stop.
 */
const test = require('node:test')
const assert = require('node:assert/strict')

const { excluded } = require('../server/vault-api.cjs')
const { isExcluded } = require('../../../extension/lib/blacklist.js')

const PATTERNS = [
  ['https://secure.bank.com/page', ['bank.com/*'], true, 'a subdomain of the host is covered'],
  ['https://bank.com.evil.org/page', ['bank.com/*'], false, 'a look-alike host is NOT covered'],
  ['https://other.com/bank.com/page', ['bank.com/*'], false, 'the host appearing in a path is not a match'],
  ['https://bank.com/anything', ['bank.com'], true, 'a bare host covers every path'],
  ['https://sub.bank.com', ['bank.com'], true, 'subdomains are part of the same site'],
  ['https://bank.com.evil.org', ['bank.com'], false, 'look-alike host, bare pattern'],
  ['https://bank.com/a', ['bank.com/a'], true, 'an exact path matches'],
  ['https://bank.com/b', ['bank.com/a'], false, 'a different path does not'],
  ['https://bank.com/page', ['https://bank.com/page'], true, 'a full URL pattern matches the href'],
  ['https://bank.com/other', ['https://bank.com/page'], false, 'a full URL pattern is exact'],
  ['https://safe.com/page', ['bank.com/*'], false, 'an unrelated site is never excluded'],
  ['not-a-url', ['bank.com/*'], false, 'an unparseable URL is never excluded'],
]

for (const [url, patterns, expected, why] of PATTERNS) {
  test(`${url} vs ${JSON.stringify(patterns)} -> ${expected} (${why})`, () => {
    assert.equal(excluded(url, patterns), expected, `server said ${excluded(url, patterns)}`)
    assert.equal(isExcluded(url, patterns), expected, `extension said ${isExcluded(url, patterns)}`)
    assert.equal(excluded(url, patterns), isExcluded(url, patterns), 'server and extension disagree')
  })
}

test('an empty pattern list excludes nothing', () => {
  assert.equal(excluded('https://bank.com/x', []), false)
  assert.equal(isExcluded('https://bank.com/x', []), false)
})

test('the look-alike host is the case that must never regress', () => {
  // Documented requirement: bank.com.evil.org must NOT be treated as bank.com/*.
  assert.equal(isExcluded('https://bank.com.evil.org/login', ['bank.com/*']), false)
})
