import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import autoprefixer from 'autoprefixer'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = resolve(__dirname, '..', '..', '..')

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2019',
    minify: false
  },
  resolve: {
    alias: {
      react: resolve(rootDir, 'node_modules/react'),
      'react-dom': resolve(rootDir, 'node_modules/react-dom'),
      'react-dom/client': resolve(rootDir, 'node_modules/react-dom/client.js'),
      'react/jsx-runtime': resolve(rootDir, 'node_modules/react/jsx-runtime.js'),
      'react/jsx-dev-runtime': resolve(rootDir, 'node_modules/react/jsx-dev-runtime.js')
    }
  },
  css: {
    postcss: {
      plugins: [
        autoprefixer(),
      ],
    },
  },
  server: {
    port: 4099,
    proxy: {
      '/api': {
        target: process.env.INVENTORY_BACKEND_URL || 'http://localhost:4096',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('[Vite Proxy] Error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[Vite Proxy] Request:', req.method, req.url, '→', proxyReq.path);
          });
        },
      },
    },
  },
  preview: {
    port: 4099,
    proxy: {
      '/api': {
        target: process.env.INVENTORY_BACKEND_URL || 'http://localhost:4096',
        changeOrigin: true,
      },
    },
  },
})
