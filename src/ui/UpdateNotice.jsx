import { useEffect, useState } from "react";

/**
 * "A new version of Resurface is ready." (2026-10-18)
 *
 * A tab left open keeps running the version it loaded, for days if it is a
 * phone's home-screen app, so a fix that has shipped does not reach the
 * person who most needs it. Each deploy gives the app's script a new hashed
 * name, so the page as the server has it now names a different script from
 * the one this tab is running. That is checked when the tab comes back into
 * view and every ten minutes while it is open; when they differ, this asks
 * for a refresh rather than doing one — a reload mid-question would throw
 * away what they were doing.
 *
 * Held back during a practice session (`hold`) and shown once it ends.
 * Dismissed, it stays away until the next deploy.
 */
const EVERY = 10 * 60 * 1000;
/* ?newversion on a preview build shows the notice straight away, to look
   at. Read once, when this file loads, before anything tidies the address. */
const PREVIEW = typeof __PREVIEW_TOOLS__ !== "undefined" && __PREVIEW_TOOLS__
  && new URLSearchParams(window.location.search).has("newversion");
const scriptIn = html => html.match(/\/assets\/index-[\w-]+\.js/)?.[0] ?? null;

export default function UpdateNotice({ hold = false }) {
  const [ready, setReady] = useState(PREVIEW ? "preview" : null);   // the new script's name
  const [dismissed, setDismissed] = useState(null);

  useEffect(() => {
    const mine = scriptIn(
      [...document.querySelectorAll('script[type="module"][src]')].map(s => new URL(s.src).pathname).join(" "),
    );
    if (!mine) return;                              // dev: no hashed build to compare
    let stopped = false;
    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/", { cache: "no-store", headers: { accept: "text/html" } });
        if (!res.ok || !res.headers.get("x-vercel-id")) return;   // a campus filter's page is not news
        const theirs = scriptIn(await res.text());
        if (!stopped && theirs && theirs !== mine) setReady(theirs);
      } catch { /* offline: try again later */ }
    }
    const t = setInterval(check, EVERY);
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVis);
    const first = setTimeout(check, 30_000);
    return () => { stopped = true; clearInterval(t); clearTimeout(first); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  if (!ready || hold || dismissed === ready) return null;
  return (
    <div className="update-note" role="status" aria-live="polite">
      <span className="update-note-text">A new version of Resurface is ready.</span>
      <button type="button" className="update-note-btn btn-press" onClick={() => window.location.reload()}>Refresh</button>
      <button type="button" className="update-note-x" onClick={() => setDismissed(ready)} aria-label="Not now">
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}
