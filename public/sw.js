// Cart Blanche service worker — keeps the shopping list usable offline.
// • Pages: network first, fall back to the last cached copy (so /list opens
//   in the store with no signal). Data itself lives in IndexedDB.
// • Next.js static assets & icons: cache first (they are content-hashed).
// • Recipe photos (Supabase storage): cache first, so this week's recipes show offline.
// • This week's recipe pages are saved ahead of time when the app asks (see OfflineRecipes).
// • Supabase data / API calls are never cached.
const VERSION = "cb-v2";
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
const PHOTOS = `${VERSION}-photos`;

// Save pages and photos for offline use: { type: "save-offline", pages: [...], photos: [...] }.
self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || msg.type !== "save-offline") return;
  event.waitUntil(
    (async () => {
      const pages = await caches.open(PAGES);
      for (const path of msg.pages || []) {
        try {
          const res = await fetch(path, { credentials: "same-origin", headers: { accept: "text/html" } });
          if (res.ok && !res.redirected) await pages.put(new URL(path, self.location.origin).pathname, res);
        } catch {
          /* offline now; try next time */
        }
      }
      const photos = await caches.open(PHOTOS);
      for (const src of msg.photos || []) {
        try {
          if (await photos.match(src)) continue;
          const res = await fetch(src, { mode: "no-cors" });
          await photos.put(src, res);
        } catch {
          /* skip */
        }
      }
    })(),
  );
});

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
  if (url.origin !== self.location.origin) {
    if (req.destination === "image" && url.pathname.includes("/storage/v1/object/public/")) {
      event.respondWith(
        caches.open(PHOTOS).then(async (cache) => {
          const hit = await cache.match(req.url);
          if (hit) return hit;
          const res = await fetch(req);
          if (res.ok || res.type === "opaque") cache.put(req.url, res.clone());
          return res;
        }),
      );
    }
    return;
  }
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
