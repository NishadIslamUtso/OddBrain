// The Memory_OB semantic search engine: bundled self-contained so the
// separately downloadable module can run beside any brain with no node_modules.
import { build } from 'vite'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    ssr: resolve(root, 'src/main/memoryOb/semantic.ts'),
    outDir: resolve(root, 'out/memory-ob/semantic'),
    emptyOutDir: true,
    sourcemap: false,
    minify: false,
    rollupOptions: {
      output: { format: 'cjs', entryFileNames: 'memory-ob-semantic.cjs', inlineDynamicImports: true },
    },
  },
  ssr: { noExternal: true },
})
