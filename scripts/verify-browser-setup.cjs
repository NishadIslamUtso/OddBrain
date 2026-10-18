'use strict';
const path = require('node:path');
const { chromium } = require(path.resolve(__dirname, '../apps/03_oddbrain/node_modules/playwright-core'));
const launch = chromium.launch.bind(chromium);
// Software rendering is a test-host choice, not an application UI change.
// Avoid SwiftShader GL teardown stalls between the existing reload checks.
chromium.launch = options => launch({ ...options, headless: true, args: [...(options?.args || []), '--disable-gpu'] });
