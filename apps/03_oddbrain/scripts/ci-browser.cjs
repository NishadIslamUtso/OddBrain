// Use Playwright's own installed-browser path on both Linux and Windows.
const { chromium } = require('playwright-core');
const { existsSync, writeFileSync, appendFileSync, mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const executablePath = chromium.executablePath();
if (!existsSync(executablePath)) throw Error('Install Playwright Chromium before configuring browser tests.');
if (!process.env.GITHUB_ENV) throw Error('This helper is for GitHub Actions. Set ODDBRAIN_BROWSER_OPTIONS directly for local tests.');
// Keep runner configuration in an unpredictable owner-only directory. A fixed
// name in the shared OS temp folder would let another local process replace it.
const privateDirectory = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), 'oddbrain-browser-'));
const options = join(privateDirectory, 'options.json');
writeFileSync(options, JSON.stringify({ executablePath, headless: true }), { mode: 0o600, flag: 'wx' });
appendFileSync(process.env.GITHUB_ENV, `ODDBRAIN_BROWSER_OPTIONS=${options}\n`);
console.log(`Browser tests configured: ${executablePath}`);
