import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

const rootDir = resolve(__dirname, '..', '..', '..');

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolve modules from root node_modules
    alias: {
      react: resolve(rootDir, 'node_modules/react'),
      'react-dom': resolve(rootDir, 'node_modules/react-dom'),
    }
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4095',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  }
});

