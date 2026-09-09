// Trend Watch service worker
// Caches the app shell (HTML/manifest/icons/chart library) for fast, offline-tolerant
// loading, but NEVER caches Alpaca API responses — market data must always be live.
const CACHE_VERSION = "trend-watch-v2";
const SHELL_ASSETS = [
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./apple-touch-icon.png",
  "https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js"
];

// Hosts that must always hit the network. Alpaca's data and trading APIs
// are excluded from caching on purpose — stale prices/signals are worse than none.
const NEVER_CACHE_HOSTS = [
  "data.alpaca.markets",
  "paper-api.alpaca.markets",
  "api.alpaca.markets"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll(SHELL_ASSETS).catch(() => {
        // Don't fail install if e.g. the CDN script is briefly unreachable;
        // shell assets will just be fetched from network on first use.
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  if (NEVER_CACHE_HOSTS.includes(url.hostname)) {
    // Always go to network for market/account data; don't touch the cache at all.
    event.respondWith(fetch(req));
    return;
  }

  // App shell: cache-first, falling back to network, and quietly refreshing
  // the cache in the background so the next offline load has the latest shell.
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
