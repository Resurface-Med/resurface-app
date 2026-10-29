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
 * Offline (2026-10-19): every file of the app is kept as soon as the app is
 * opened online (precache.json, written by the build), not only the ones
 * that happened to be fetched — a screen never visited online was a blank
 * page offline. Fonts and public images (profile photos, announcement
 * covers) are kept as well, in caches of their own. Question images are kept
 * by the app itself (lib/questionImage), since their links expire.
 *
 * "Good" means it came from Vercel. A filter that answers in a blocked site's
 * place sends its own page with a 200; caching that would replace the app
 * with the filter's notice for good. Vercel stamps every response with
 * x-vercel-id, and nothing else is kept — or trusted over the cache.
 */
const CACHE = "resurface-shell-v3";
const FONTS = "resurface-fonts-v1";
const MEDIA = "resurface-media-v1";
const KEEP = [CACHE, FONTS, MEDIA];
const SHELL = "/";
const MAX_ENTRIES = 300;
const MAX_MEDIA = 250;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    /* A failed precache must not stop the worker installing: it is tried
       again on every page load. */
    try { await precache(true); } catch { /* next time */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (!KEEP.includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

const fromVercel = (res) => res && res.ok && res.headers.has("x-vercel-id");
const notPage = (res) => !(res.headers.get("content-type") || "").includes("text/html");

/* The current build's files, once known: never the ones trimmed. */
let current = new Set();

async function keep(req, res) {
  const cache = await caches.open(CACHE);
  await cache.put(req, res);
  /* Every deploy brings new hashed files; past a bound, drop the oldest that
     are not part of this build. */
  const keys = await cache.keys();
  let over = keys.length - MAX_ENTRIES;
  for (const old of keys) {
    if (over <= 0) break;
    const path = new URL(old.url).pathname;
    if (path === SHELL || current.has(path)) continue;
    await cache.delete(old);
    over -= 1;
  }
}

/*
 * Every file of the current build, into the cache: the page, then each
 * script and stylesheet not already there. `withPage` also fetches the page
 * itself (at install, when nothing has been fetched through here yet).
 */
let precaching = null;
function precache(withPage = false) {
  if (!precaching) precaching = (async () => {
    const list = await fetch("/precache.json", { cache: "no-store" });
    if (!fromVercel(list)) return;
    const { files = [] } = await list.json();
    current = new Set(files);
    const cache = await caches.open(CACHE);
    if (withPage) {
      const res = await fetch(SHELL, { cache: "no-store" });
      if (fromVercel(res)) await cache.put(SHELL, res);
    }
    for (let i = 0; i < files.length; i += 6) {
      await Promise.all(files.slice(i, i + 6).map(async (f) => {
        if (await cache.match(f)) return;
        try {
          const res = await fetch(f);
          if (fromVercel(res) && notPage(res)) await cache.put(f, res);
        } catch { /* next time */ }
      }));
    }
  })().finally(() => { precaching = null; });
  return precaching;
}

async function page(req, event) {
  try {
    const res = await fetch(req);
    if (fromVercel(res)) {
      await keep(SHELL, res.clone());
      event.waitUntil(precache().catch(() => {}));
      return res;
    }
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

/* Fonts: kept, served from the copy, refreshed behind it. */
async function font(req, event) {
  const cache = await caches.open(FONTS);
  const copy = await cache.match(req);
  const fresh = fetch(req).then(async (res) => {
    if (res && (res.ok || res.type === "opaque")) await cache.put(req, res.clone());
    return res;
  });
  if (copy) { event.waitUntil(fresh.catch(() => {})); return copy; }
  return fresh;
}

/* Public images from Storage (profile photos, announcement covers): the
   network first, so a new photo shows; the copy when there is none. */
async function media(req) {
  const cache = await caches.open(MEDIA);
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === "opaque")) {
      await cache.put(req, res.clone());
      const keys = await cache.keys();
      for (const old of keys.slice(0, Math.max(0, keys.length - MAX_MEDIA))) await cache.delete(old);
    }
    return res;
  } catch (e) {
    const copy = await cache.match(req);
    if (copy) return copy;
    throw e;
  }
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
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(font(req, event));
    return;
  }
  if (url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/storage/v1/object/public/")) {
    event.respondWith(media(req));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js") return;
  /* The featured decks download is cached by version at the edge and kept
     in IndexedDB by the app; a second copy here would only cost space. */
  if (url.pathname.startsWith("/api/")) return;
  /* The network check has to see the network, not this cache. */
  if (url.pathname === "/netcheck.html" || url.searchParams.has("nc")) return;
  /* Video and audio arrive as ranges (206), which a cache cannot store — a
     put would throw and take the response down with it. They go straight out. */
  if (req.headers.has("range") || req.destination === "video" || req.destination === "audio") return;
  if (req.mode === "navigate") event.respondWith(page(req, event));
  else if (url.pathname.startsWith("/assets/")) event.respondWith(asset(req));
  else event.respondWith(other(req));
});

/* ── Reminders (2026-10-17, experimental) ────────────────────────────
   A push from the backend: show it, and put the number of questions due
   on the app's icon where the system allows. Tapping it opens Study in
   the app's own window if one is open, a new one if not. */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || "Resurface";
  event.waitUntil((async () => {
    if (typeof data.badge === "number" && self.navigator.setAppBadge) {
      try { await self.navigator.setAppBadge(data.badge); } catch { /* not supported */ }
    }
    await self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "resurface-reminder",
      data: { url: data.url || "/" },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus();
        try { await w.navigate(url); } catch { /* navigation refused; focused is enough */ }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
