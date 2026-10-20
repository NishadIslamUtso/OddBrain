import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

/**
 * The renderer, built as a plain static site.
 *
 * This exists so the interface can be looked at in a browser — including from a
 * phone, and without waiting for a desktop build — while the desktop app stays
 * the real product. It is the same renderer source, the same styles and the same
 * components; only the thing behind the window is different.
 *
 * What it is NOT: a version of the app that can reach your files, your vault or
 * your models. In the desktop app those arrive through the preload bridge
 * (window.api), which a browser does not have. Anything the UI asks for that
 * needs the machine falls back to demo data, and the bridge says so out loud —
 * see src/renderer/src/platform/bridge.ts. Nothing pretends to be a real vault.
 *
 * No Electron here on purpose: this build must run on a host that has no display
 * and no desktop runtime.
 */
export default defineConfig({
  root: fileURLToPath(new URL('./src/renderer', import.meta.url)),
  base: '/',
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      // The same three aliases the desktop build and tsconfig know about, so a
      // component cannot accidentally be importable in one build and not another.
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@renderer': fileURLToPath(new URL('./src/renderer/src', import.meta.url)),
      '@': fileURLToPath(new URL('./src/renderer/src', import.meta.url)),
    },
  },
  // Binding to 0.0.0.0 and allowing any host is what makes this work behind a
  // preview proxy as well as on Vercel. It serves static files and nothing else.
  server: { host: '0.0.0.0', port: 5174, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4174, allowedHosts: true },
  build: {
    // Relative-safe absolute path: this is served from the host root.
    outDir: fileURLToPath(new URL('./dist-web', import.meta.url)),
    emptyOutDir: true,
    // Public previews ship executable bundles, not original source or embedded source maps.
    sourcemap: false,
    target: 'es2022',
  },
})
