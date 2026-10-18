import { defineConfig } from '@playwright/test'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 30_000,
  reporter: 'list', outputDir: './test-results',
  use: {
    baseURL: 'http://127.0.0.1:5174', viewport: { width: 1568, height: 833 },
    locale: 'en-US', timezoneId: 'Asia/Dhaka', colorScheme: 'dark', trace: 'retain-on-failure',
    ...(executablePath ? { launchOptions: { executablePath, args: JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS || '[]') } } : { channel: process.env.AI_ASSISTANT_BROWSER || 'chrome' }),
  },
  webServer: {
    command: 'node tests/start-e2e-server.cjs', url: 'http://127.0.0.1:5174',
    timeout: 30_000, reuseExistingServer: false,
  },
})
