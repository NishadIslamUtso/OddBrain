// The Goose-history import core: bundled self-contained so the addon's CLI can
// run it from an install path with no node_modules beside it.
import { build } from 'vite'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    ssr: resolve(root, 'src/main/memoryOb/gooseImport.ts'),
    outDir: resolve(root, 'out/memory-ob/goose-import'),
    emptyOutDir: true,
    sourcemap: false,
    minify: false,
    rollupOptions: {
      output: { format: 'cjs', entryFileNames: 'goose-import-core.cjs', inlineDynamicImports: true },
    },
  },
  ssr: { noExternal: true },
})
