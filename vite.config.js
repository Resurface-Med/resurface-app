import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  /* Tools for looking at the app as someone else would — the first-run
     dashboard and film, for instance — on local dev and Vercel preview
     builds (the dev branch) only. Compiled to false in production, so the
     code is dropped from the bundle there. */
  define: {
    __PREVIEW_TOOLS__: JSON.stringify(process.env.VERCEL_ENV !== "production"),
  },
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
