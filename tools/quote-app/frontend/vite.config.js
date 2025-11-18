import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Allow external connections
    port: 3000, // Optional: specify a port
    strictPort: true
  },
  preview: {
    host: '0.0.0.0', // Allow external connections for preview mode
    port: 3000, // Optional: specify a port
  }
});
