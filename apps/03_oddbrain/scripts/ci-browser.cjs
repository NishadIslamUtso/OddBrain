// Use Playwright's own installed-browser path on both Linux and Windows.
const { chromium } = require('playwright-core');
const { existsSync, writeFileSync, appendFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const executablePath = chromium.executablePath();
if (!existsSync(executablePath)) throw Error('Install Playwright Chromium before configuring browser tests.');
if (!process.env.GITHUB_ENV) throw Error('This helper is for GitHub Actions. Set ODDBRAIN_BROWSER_OPTIONS directly for local tests.');
const options = join(process.env.RUNNER_TEMP || tmpdir(), 'oddbrain-browser-options.json');
writeFileSync(options, JSON.stringify({ executablePath, headless: true }));
appendFileSync(process.env.GITHUB_ENV, `ODDBRAIN_BROWSER_OPTIONS=${options}\n`);
console.log(`Browser tests configured: ${executablePath}`);
