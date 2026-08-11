/**
 * The service worker.
 *
 * The promise was already half true: work survives offline because it lives in
 * the browser. What did not survive was the *app* — the only way to reach any
 * of it — which needed a network to load. A workspace you cannot open on a
 * train is a workspace you cannot rely on.
 *
 * Two strategies, and the split matters:
 *
 *   - **Navigations** are network-first with a cached fallback. Fresh when
 *     there is a connection, and the last known good shell when there isn't.
 *     Cache-first here would pin people to a stale build until they cleared
 *     their browser, which is the classic way to ship an un-fixable bug.
 *   - **Build assets** (`/_next/static/…`) are cache-first, because their
 *     names contain a content hash: the file at a given URL never changes, so
 *     revalidating it is a round trip that can only return what we have.
 *
 * Nothing that could carry somebody else's data is cached. `/api/…` is never
 * touched — an answer from the AI or a row from the database that came back
 * for one account must not be replayed to whoever opens the browser next.
 */

const VERSION = "tougather-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

/** Pre-cached so a first-run offline visit still opens the workspace. */
const PRECACHE = ["/library", "/offline", "/logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // Individually, and forgiving: one 404 in this list would otherwise
      // reject the whole install and leave the app with no worker at all.
      .then((cache) =>
        Promise.all(
          PRECACHE.map((url) =>
            cache.add(new Request(url, { cache: "reload" })).catch(() => {}),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** A page that lets someone in, when the network can't. */
const fallbackPage = async () => {
  const cache = await caches.open(SHELL);
  return (
    (await cache.match("/library")) ??
    (await cache.match("/offline")) ??
    new Response(
      "<!doctype html><meta charset=utf-8><title>Offline</title><p>Tougather can't reach the network, and this browser hasn't stored the app yet.",
      { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 },
    )
  );
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Same origin only. A cross-origin response is somebody else's to cache.
  if (url.origin !== self.location.origin) return;
  // Never the API: see the note at the top.
  if (url.pathname.startsWith("/api/")) return;

  // Hashed build output: the URL is the version, so the cache can be trusted.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(ASSETS).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(SHELL).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? fallbackPage()),
    );
    return;
  }

  // Everything else — fonts, the logo, the icons — is worth keeping but not
  // worth going stale over, so it is served from cache and refreshed behind.
  event.respondWith(
    caches.match(request).then((hit) => {
      const live = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(ASSETS).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => hit);
      return hit ?? live;
    }),
  );
});

/**
 * Signing out clears everything cached under this origin.
 *
 * Two people share a laptop more often than anyone designing this remembers,
 * and a cached shell is not private. The app posts this message rather than
 * the worker guessing.
 */
self.addEventListener("message", (event) => {
  if (event.data === "clear-caches")
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    );
});
