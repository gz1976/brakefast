import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/latest': {
        target: 'https://clogzoehrer.ddns.net',
        changeOrigin: true,
        secure: false,
      },
      '/legacy': {
        target: 'https://clogzoehrer.ddns.net',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
