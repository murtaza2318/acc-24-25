import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 12001,
    allowedHosts: ['work-1-dhakpmgyrvovyfnz.prod-runtime.all-hands.dev', 'work-2-dhakpmgyrvovyfnz.prod-runtime.all-hands.dev'],
    proxy: {
      '/api': {
        target: 'http://localhost:12000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})