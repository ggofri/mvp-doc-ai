import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const DEFAULT_SERVER_PORT = 5173;
const PROXY_TARGET_URL = 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@fuse/shared': path.resolve(__dirname, '../shared')
    }
  },
  server: {
    port: DEFAULT_SERVER_PORT,
    proxy: {
      '/api': {
        target: PROXY_TARGET_URL,
        changeOrigin: true,
      }
    }
  }
})
