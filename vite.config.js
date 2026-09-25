import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Dev has no generator of its own. /api stays on this origin and is
    // forwarded, so a missing local server is not "Failed to fetch".
    proxy: {
      "/api": {
        target: "https://api.tryresurface.com",
        changeOrigin: true,
      },
    },
  },
})
