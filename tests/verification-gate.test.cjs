'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { smokeResult, unitResult, unsignedNotice } = require('../scripts/verify-contracts.cjs');
test('smoke requires the actual scrolling probe and both clean console counts', () => {
  assert.equal(smokeResult('SMOKE OK SCROLL OK title="OddBrain" size=940x620 in 1800ms errors=0 warnings=0').scroll, 'passed');
});
for (const [name, line] of Object.entries({
  skipped: 'SMOKE OK SCROLL skipped errors=0 warnings=0',
  broken: 'SMOKE OK SCROLL BROKEN errors=0 warnings=0',
  failed: 'SMOKE OK SCROLL FAILED errors=0 warnings=0',
  error: 'SMOKE OK SCROLL OK errors=1 warnings=0',
  warning: 'SMOKE OK SCROLL OK errors=0 warnings=1',
  blank: 'SMOKE BLANK SCROLL OK errors=0 warnings=0',
})) test(`reject ${name} smoke instead of accepting a zero process exit`, () => assert.throws(() => smokeResult(line)));
test('reject missing and duplicated smoke verdicts', () => {
  assert.throws(() => smokeResult('window opened'));
  assert.throws(() => smokeResult('SMOKE OK SCROLL OK errors=0 warnings=0\nSMOKE OK SCROLL OK errors=0 warnings=0'));
});
test('unit totals come from the runner output rather than an expected count', () => {
  assert.deepEqual(unitResult('\x1b[32mTest Files 3 passed (3)\x1b[0m\nTests 19 passed (19)'), { files: 3, tests: 19 });
  assert.throws(() => unitResult('Tests are fine'));
  assert.throws(() => unitResult('Test Files 3 passed (4)\nTests 19 passed (20)\n1 failed'));
});
test('installer notice says unsigned and does not equate hashing with acceptance', () => {
  assert.match(unsignedNotice(), /UNSIGNED/); assert.match(unsignedNotice(), /unknown publisher/);
  assert.match(unsignedNotice(), /not installed-Windows acceptance/);
});
