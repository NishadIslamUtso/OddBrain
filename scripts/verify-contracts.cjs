'use strict';
const assert = require('node:assert/strict');
const clean = text => text.replace(/\x1b\[[0-9;]*m/g, '');
function smokeResult(output) {
  const lines = clean(output).split(/\r?\n/).filter(line => /^SMOKE /.test(line));
  assert.equal(lines.length, 1, 'Require exactly one smoke verdict');
  assert.match(lines[0], /^SMOKE OK SCROLL OK\b/, 'The actual [data-find-scroll] probe must pass');
  assert.match(lines[0], /\berrors=0 warnings=0\s*$/, 'Errors AND warnings must be zero');
  return { verdict: lines[0], errors: 0, warnings: 0, scroll: 'passed' };
}
function unitResult(output) {
  const text = clean(output);
  const files = text.match(/Test Files\s+(\d+) passed(?:\s+\((\d+)\))?/);
  const tests = text.match(/\bTests\s+(\d+) passed(?:\s+\((\d+)\))?/);
  assert(files && tests, 'Require measured Vitest file and test totals');
  assert(!/\b[1-9]\d* failed\b/.test(text), 'A failing test cannot be a green receipt');
  return { files: Number(files[1]), tests: Number(tests[1]) };
}
function unsignedNotice() {
  return 'UNSIGNED Windows installer: no signing certificate is configured. Windows shows “unknown publisher”. Building or hashing this file is not installed-Windows acceptance.';
}
function failureAnnotation(error) {
  if (process.env.GITHUB_ACTIONS) console.error('::error::' + String(error.stack || error).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A'));
}
module.exports = { clean, smokeResult, unitResult, unsignedNotice, failureAnnotation };
