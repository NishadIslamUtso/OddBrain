import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { excluded } from '../src/main/vault/blacklist'

/**
 * The never-check list is enforced in two places, and they must agree.
 *
 * The vault refuses a capture on the app's side; the browser extension refuses
 * to read the page on the browser's side. If the two implementations drift, a
 * pattern the user trusted is quietly enforced in one place and not the other —
 * and the failure is invisible, because both look like they work.
 *
 * So this test does not assert the extension agrees with the vault, or the vault
 * with the extension: it asserts the two answer identically for every case,
 * including the look-alike host the rules exist to stop. The extension's copy is
 * imported from where it actually lives and is used by the browser
 * (extension/lib/blacklist.js) rather than re-implemented here.
 */

const here = dirname(fileURLToPath(import.meta.url))
const extension = createRequire(import.meta.url)(
  resolve(here, '../../../extension/lib/blacklist.js')
) as { isExcluded: (url: string, patterns: string[]) => boolean }

const CASES: Array<[string, string[], boolean, string]> = [
  ['https://secure.bank.com/page', ['bank.com/*'], true, 'a subdomain of the host is covered'],
  ['https://bank.com.evil.org/page', ['bank.com/*'], false, 'a look-alike host is NOT covered'],
  ['https://other.com/bank.com/page', ['bank.com/*'], false, 'the host in a path is not a match'],
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

for (const [url, patterns, expected, why] of CASES) {
  test(`${url} vs ${JSON.stringify(patterns)} -> ${expected} (${why})`, () => {
    assert.equal(excluded(url, patterns), expected, `the vault said ${excluded(url, patterns)}`)
    assert.equal(extension.isExcluded(url, patterns), expected, `the extension said ${extension.isExcluded(url, patterns)}`)
    assert.equal(excluded(url, patterns), extension.isExcluded(url, patterns), 'they disagree')
  })
}

test('an empty pattern list excludes nothing, in both', () => {
  assert.equal(excluded('https://bank.com/x', []), false)
  assert.equal(extension.isExcluded('https://bank.com/x', []), false)
})

test('the look-alike host is the case that must never regress', () => {
  // Documented requirement: bank.com.evil.org must NOT be treated as bank.com/*.
  assert.equal(extension.isExcluded('https://bank.com.evil.org/login', ['bank.com/*']), false)
  assert.equal(excluded('https://bank.com.evil.org/login', ['bank.com/*']), false)
})
