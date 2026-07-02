// Minimal service worker — satisfies PWA installability (Chrome's "Add to
// Home Screen" wants a fetch-handling SW) and gives push notifications a
// place to register later. No caching yet: every request goes to network,
// so nothing here can serve you stale UI during active development.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
