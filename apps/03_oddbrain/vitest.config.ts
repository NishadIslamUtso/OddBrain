import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * The test runner for the logic layer.
 *
 * - env: 'node'  — these are pure functions, no DOM involved yet
 * - 'node:test' is aliased to a shim so the ported tests keep their own imports
 * - '@shared/*' points at the environment-agnostic code both the main process and
 *   the renderer will use
 */
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^node:test$/,
        replacement: fileURLToPath(new URL('./tests/shims/node-test.ts', import.meta.url)),
      },
      {
        // The main process's electron import, for tests of its guards (the
        // shim carries no GUI — only the decision points under test).
        find: /^electron$/,
        replacement: fileURLToPath(new URL('./tests/shims/electron.ts', import.meta.url)),
      },
      {
        find: /^@shared\//,
        replacement: fileURLToPath(new URL('./src/shared/', import.meta.url)),
      },
      {
        // The renderer's own alias, so a test can import a state module that
        // reaches for the bridge the way the interface does.
        find: /^@\//,
        replacement: fileURLToPath(new URL('./src/renderer/src/', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'node',
    // The suite contains live filesystem watchers, ports and child processes.
    // Serial files avoid starving their short, real-time deadlines across CI runner sizes.
    fileParallelism: false,
    // Top level only: tests/pending/ holds the tests whose subject is not ported
    // yet, and it is listed in tests/pending/README.md. Nothing there runs or counts.
    include: ['tests/*.test.{js,cjs,ts}'],
    reporters: ['default'],
  },
})
