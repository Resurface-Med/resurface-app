import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

/* Which build this is. Bumped on 2026-10-17 so the entry file got a new
   name: browsers had cached an HTML page under the old one for a year. */
window.__RESURFACE_BUILD = "2026-10-17.1";
import { AuthProvider } from './lib/auth'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
)

// Production only — a registered SW with a fetch handler is what lets Chrome
// offer Add to Home Screen. iOS Safari uses the apple-touch meta tags instead.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
