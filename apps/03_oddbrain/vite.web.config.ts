import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: fileURLToPath(new URL('./src/renderer', import.meta.url)),
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5174, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4174, allowedHosts: true },
  build: {
    outDir: fileURLToPath(new URL('./dist-web', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
  },
})
