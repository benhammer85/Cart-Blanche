// Cart Blanche service worker — keeps the shopping list usable offline.
// • Pages: network first, fall back to the last cached copy (so /list opens
//   in the store with no signal). Data itself lives in IndexedDB.
// • Next.js static assets & icons: cache first (they are content-hashed).
// • Supabase / API calls are never cached.
const VERSION = "cb-v1";
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGES).then((c) => c.addAll(["/list"]).catch(() => {})).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  const isPage = req.mode === "navigate";
  const isRsc = req.headers.get("RSC") === "1";
  if (isPage || isRsc) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGES);
        const key = isRsc ? `${url.pathname}?__rsc` : url.pathname;
        try {
          const res = await fetch(req);
          if (res.ok && !res.redirected) cache.put(key, res.clone());
          return res;
        } catch {
          const hit = (await cache.match(key)) || (isPage ? await cache.match("/list") : undefined);
          if (hit) return hit;
          return new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } });
        }
      })(),
    );
  }
});
