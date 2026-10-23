// The Brain Window server: the addon's local host, built self-contained so it
// runs from an install path with no node_modules beside it.
import { build } from 'vite'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    ssr: resolve(root, 'src/main/brainWindow.ts'),
    outDir: resolve(root, 'out/memory-ob/brain-window'),
    emptyOutDir: true,
    sourcemap: false,
    minify: false,
    rollupOptions: {
      output: { format: 'cjs', entryFileNames: 'brain-window-server.cjs', inlineDynamicImports: true },
    },
  },
  // Like the MCP adapter, the host must run standalone: npm dependencies are
  // bundled in rather than externalized.
  ssr: { noExternal: true },
})
