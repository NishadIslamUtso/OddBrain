import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Three builds, one config.
 *
 * main and preload run in Node (Electron), so their dependencies are externalised —
 * electron and anything native must never be bundled. The renderer is a normal web
 * build and everything in it *is* bundled, because it ships as static files.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts'), 'media-worker': resolve(__dirname, 'src/main/media/worker.ts') } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') },
    },
    server: {
      // The main process serves /api on this port; forwarding it here keeps the
      // renderer's fetch calls same-origin in dev exactly as in the built app.
      // The Origin header is rewritten to match, so the same guard decides both.
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${process.env.AI_ASSISTANT_API_PORT || 41979}`,
          changeOrigin: true,
          headers: { origin: `http://127.0.0.1:${process.env.AI_ASSISTANT_API_PORT || 41979}` },
        },
      },
    },
  },
})
