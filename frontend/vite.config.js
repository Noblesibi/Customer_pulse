import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/CustomerPulse/',
  plugins: [react()],
  server: {
    proxy: {
      '/CustomerPulse/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/CustomerPulse/, ''),
      },
    },
  },
})
