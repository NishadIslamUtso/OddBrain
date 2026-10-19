// Fail closed if browser coverage disappears or a new skip hides behind green CI.
const { XMLParser, XMLValidator } = require('fast-xml-parser');
const { readFileSync, appendFileSync } = require('node:fs');
const list = value => value === undefined ? [] : Array.isArray(value) ? value : [value];
const WINDOWS_SKIPS = new Set([
  'tests/artifact-recovery.test.ts::a broken version link cannot prevent recovery of healthy sibling artifacts',
  'tests/artifact-recovery.test.ts::recovery does not import linked folders or version files outside the library',
  'tests/key-storage-durability.test.ts::rewriting a key file restores owner-only permissions',
]);
const BROWSER_SUITES = ['tests/conversation-runner.test.ts', 'tests/conversation-outbox-browser.test.ts'];
function checkReport(xml, platform = process.platform) {
  if (XMLValidator.validate(xml) !== true) throw Error('Invalid JUnit XML');
  const root = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@' }).parse(xml).testsuites;
  const suites = list(root?.testsuite);
  if (!suites.length) throw Error('No test suites were reported');
  let tests = 0;
  const skipped = [], seen = new Set();
  for (const suite of suites) {
    const name = String(suite['@name']).replaceAll('\\', '/');
    if (seen.has(name)) throw Error(`Duplicate suite: ${name}`);
    seen.add(name);
    const cases = list(suite.testcase);
    if (!cases.length || Number(suite['@tests']) !== cases.length) throw Error(`Empty or inconsistent suite: ${name}`);
    if (Number(suite['@failures']) !== 0 || Number(suite['@errors']) !== 0) throw Error(`Failed suite: ${name}`);
    let suiteSkips = 0;
    for (const test of cases) {
      tests++;
      if (Object.hasOwn(test, 'failure') || Object.hasOwn(test, 'error')) throw Error(`Failed test: ${name}::${test['@name']}`);
      if (!Object.hasOwn(test, 'skipped')) continue;
      suiteSkips++;
      const identity = `${name}::${test['@name']}`;
      if (platform !== 'win32' || !WINDOWS_SKIPS.has(identity)) throw Error(`Unexpected skip: ${identity}`);
      skipped.push(identity);
    }
    if (Number(suite['@skipped']) !== suiteSkips) throw Error(`Inconsistent skip count: ${name}`);
  }
  if (Number(root['@tests']) !== tests || Number(root['@failures']) !== 0 || Number(root['@errors']) !== 0) throw Error('Inconsistent or failed test run');
  for (const name of BROWSER_SUITES) if (!seen.has(name)) throw Error(`Missing browser suite: ${name}`);
  return { tests, passed: tests - skipped.length, skipped };
}
module.exports = { checkReport };
if (require.main === module) {
  const result = checkReport(readFileSync(process.argv[2], 'utf8'));
  const summary = `${result.passed} passed / ${result.skipped.length} skipped / ${result.tests} total. Both browser suites ran.\n` +
    result.skipped.map(name => `- Windows-only exception: ${name}\n`).join('');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Test coverage\n${summary}\n`);
}
