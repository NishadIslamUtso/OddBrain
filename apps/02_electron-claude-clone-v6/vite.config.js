import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // WebContainer API requires these headers for SharedArrayBuffer support
    {
      name: 'configure-webcontainer-headers',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Required for WebContainer API (enables SharedArrayBuffer)
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          next();
        });
      },
      // Also configure for preview builds
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          next();
        });
      }
    }
  ],
})
