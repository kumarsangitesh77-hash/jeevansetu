import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The API port is shared with the server so `PORT=3002 npm run dev` keeps the
// proxy pointing at the right place.
const apiTarget = process.env.API_TARGET || `http://localhost:${process.env.PORT || 3001}`

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Transpile modern syntax (optional chaining, nullish coalescing) so the
    // bundle also runs on older Safari and Firefox releases.
    target: 'es2018'
  },
  server: {
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true
      }
    }
  },
  preview: {
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true
      }
    }
  }
})
