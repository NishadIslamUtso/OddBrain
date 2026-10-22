import { build } from 'vite'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    ssr: resolve(root, 'src/main/memmoryOb/mcpServer.ts'),
    outDir: resolve(root, 'out/memmory-ob'),
    emptyOutDir: true,
    sourcemap: false,
    minify: false,
    rollupOptions: {
      output: { format: 'cjs', entryFileNames: 'memmory-ob-mcp.cjs', inlineDynamicImports: true },
    },
  },
})
