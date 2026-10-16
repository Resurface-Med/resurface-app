/*
 * The app shell, kept so the app opens on a network that will not serve it.
 *
 * On eduroam the app's own domain can be held back by the campus filter while
 * supabase.co — where the questions come from — is not. Without a copy here
 * the app only worked in a tab already open from home; a reload was a dead
 * page. So:
 *
 *   the page   network first; the last good copy if the network fails
 *   /assets/*  cache first: hashed names never change, so a copy is right
 *   other own  network first, cached copy as fallback (icons, manifest)
 *   elsewhere  not touched — Supabase, Google, the API go straight out
 *
 * "Good" means it came from Vercel. A filter that answers in a blocked site's
 * place sends its own page with a 200; caching that would replace the app
 * with the filter's notice for good. Vercel stamps every response with
 * x-vercel-id, and nothing else is kept — or trusted over the cache.
 */
const CACHE = "resurface-shell-v2";
const SHELL = "/";
const MAX_ENTRIES = 160;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

const fromVercel = (res) => res && res.ok && res.headers.has("x-vercel-id");

async function keep(req, res) {
  const cache = await caches.open(CACHE);
  await cache.put(req, res);
  /* Every deploy brings new hashed files; drop the oldest past a bound. */
  const keys = await cache.keys();
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) {
    if (new URL(old.url).pathname !== SHELL) await cache.delete(old);
  }
}

async function page(req) {
  try {
    const res = await fetch(req);
    if (fromVercel(res)) { await keep(SHELL, res.clone()); return res; }
    const copy = await caches.match(SHELL);
    return copy || res;
  } catch (e) {
    const copy = await caches.match(SHELL);
    if (copy) return copy;
    throw e;
  }
}

async function asset(req) {
  const copy = await caches.match(req);
  if (copy) return copy;
  let res = await fetch(req);
  /* A script that comes back as anything but a script — a 404, or an HTML
     page from before /assets stopped being rewritten to index.html — may be
     the browser's own HTTP cache replaying a bad answer it was told to keep
     for a year (Rafil's blank screen, 2026-10-17). Ask once more, past that
     cache, before giving up; and never keep a bad answer here. */
  const bad = r => !r.ok || (r.headers.get("content-type") || "").includes("text/html");
  if (bad(res)) {
    try { res = await fetch(req.url, { cache: "reload", credentials: "same-origin" }); } catch { /* keep the first answer */ }
  }
  if (fromVercel(res) && !bad(res)) await keep(req, res.clone());
  return res;
}

async function other(req) {
  try {
    const res = await fetch(req);
    if (fromVercel(res)) { await keep(req, res.clone()); return res; }
    return (await caches.match(req)) || res;
  } catch (e) {
    const copy = await caches.match(req);
    if (copy) return copy;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js") return;
  /* The network check has to see the network, not this cache. */
  if (url.pathname === "/netcheck.html" || url.searchParams.has("nc")) return;
  /* Video and audio arrive as ranges (206), which a cache cannot store — a
     put would throw and take the response down with it. They go straight out. */
  if (req.headers.has("range") || req.destination === "video" || req.destination === "audio") return;
  if (req.mode === "navigate") event.respondWith(page(req));
  else if (url.pathname.startsWith("/assets/")) event.respondWith(asset(req));
  else event.respondWith(other(req));
});
