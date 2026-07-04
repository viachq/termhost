// Service Worker for termhost — App Shell with offline fallback
// Caches the single-file mobile.html plus static assets (icons, manifest).
// WebSocket connections pass through untouched.

const CACHE = "termhost-v1";
const ASSETS = ["/", "/mobile.html", "/manifest.json", "/icon-192.png", "/icon-512.png"];

// Install: pre-cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Best-effort pre-caching — don't block activation on failures
      for (const url of ASSETS) {
        try {
          const res = await fetch(url, { cache: "no-cache" });
          if (res.ok) cache.put(url, res.clone());
        } catch {
          // Offline at install time — fine, will cache on first access
        }
      }
    })()
  );
  self.skipWaiting();
});

// Activate: clean old caches, take control
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Fetch: network-first for HTML, cache-first for assets, pass-through for WS
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Don't intercept WebSocket upgrades
  if (request.headers.get("Upgrade") === "websocket") return;

  // API calls — network only
  if (url.pathname.startsWith("/api/")) return;

  // Static assets (icons, manifest) — cache-first, network fallback
  if (url.pathname.match(/\.(png|ico|svg|json)$/)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // HTML (mobile.html) — network-first, fallback to cache, then offline page
  if (url.pathname === "/" || url.pathname === "/mobile.html") {
    event.respondWith(networkFirst(request));
    return;
  }

  // Everything else — network only
});

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Return minimal offline page
    return new Response(
      `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>termhost — offline</title>
<style>
body{margin:0;display:flex;align-items:center;justify-content:center;height:100dvh;
background:#0b0b0d;color:#888;font-family:system-ui,-apple-system,sans-serif;text-align:center;}
div{max-width:320px;padding:24px}
h1{font-size:20px;font-weight:600;color:#ccc;margin:0 0 8px}
p{font-size:13px;margin:0 0 24px;line-height:1.5}
button{background:#e94560;color:#fff;border:none;border-radius:8px;padding:10px 24px;
font-size:14px;cursor:pointer}
</style></head>
<body><div>
<h1>⏸️ Connection lost</h1>
<p>Your PC went offline or is unreachable.<br>Reconnect when you're back on the same network.</p>
<button onclick="location.reload()">Retry</button>
</div></body></html>`,
      { headers: { "Content-Type": "text/html;charset=utf-8" } }
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    return new Response("", { status: 404 });
  }
}
