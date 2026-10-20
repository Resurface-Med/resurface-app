import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'

/*
 * Offline (2026-10-19): a list of every file the build made, for the service
 * worker to keep (public/sw.js). It only kept what had been fetched, so a
 * screen never opened online — Generate, What's new — was a blank page
 * offline. Large files only Generate uses (the PDF reader, SQLite for Anki
 * imports) are left out: Generate needs a connection anyway.
 */
function precacheList() {
  return {
    name: 'precache-list',
    apply: 'build',
    generateBundle(_, bundle) {
      const skip = /pdf\.worker|sql-wasm/;
      const files = Object.keys(bundle)
        .filter(f => f.startsWith('assets/') && !skip.test(f) && !f.endsWith('.map'))
        .map(f => '/' + f)
        .sort();
      /* What the app draws from public/: logos, icons, the books. */
      for (const f of ['/books.webp', '/icon-192.png', '/logo-lockup.png', '/logo-lockup-white.png',
        '/favicon.ico', '/favicon-32.png', '/favicon-16.png', '/apple-touch-icon.png',
        '/manifest.webmanifest']) {
        if (existsSync('public' + f)) files.push(f);
      }
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify({ files }) });
    },
  }
}

export default defineConfig({
  plugins: [react(), precacheList()],
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
