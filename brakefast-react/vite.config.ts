import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/latest': {
        target: 'https://ottobot.net',
        changeOrigin: true,
        secure: false,
        timeout: 5000,
      },
      '/legacy': {
        target: 'https://ottobot.net',
        changeOrigin: true,
        secure: false,
        timeout: 5000,
      },
    },
  },
})
