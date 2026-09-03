/* Installability only — Chrome needs a fetch handler before it offers
   Add to Home Screen. Caching / offline is a later pass; for now every
   request still goes to the network. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
