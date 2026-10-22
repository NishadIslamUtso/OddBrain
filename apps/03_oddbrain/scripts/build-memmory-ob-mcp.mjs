import { build } from 'vite'
import { copyFileSync, mkdirSync } from 'node:fs'
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
  // The adapter must stay self-contained: it runs from an install path with
  // no node_modules beside it, so npm dependencies (yaml, via the vault
  // blacklist law) are bundled in rather than externalized.
  ssr: { noExternal: true },
})
// The Goose hints/skill file ships beside the bundle so the reviewed install
// can place it in Goose's own skills folder from an app-bundled source.
mkdirSync(resolve(root, 'out/memmory-ob'), { recursive: true })
copyFileSync(resolve(root, '../../packages/Memmory_OB/goose-skill/SKILL.md'), resolve(root, 'out/memmory-ob/memmory-ob-memory.skill.md'))
