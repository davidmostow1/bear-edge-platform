// @ts-nocheck

const CACHE_NAME = "bear-edge-dashboard-v1";
const SHELL_ASSETS = [
  "/dashboard",
  "/dashboard/",
  "/dashboard/styles.css",
  "/dashboard/app.js",
  "/dashboard/manifest.json",
  "/dashboard/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Never cache API responses: odds, injuries, games, and decisions must not
  // be presented as current after the provider or local server changes.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok && url.pathname.startsWith("/dashboard")) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });

      return network.catch(() => cached ?? new Response("Bear Edge is offline.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" }
      }));
    })
  );
});
