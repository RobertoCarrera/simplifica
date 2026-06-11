// Final Service Worker — version 4.0
// Purpose: this SW is intentionally hostile to itself. When the browser
// fetches /sw.js (e.g. an old browser tab still pinning the old SW),
// it installs a no-op SW that immediately activates, deletes every
// cache, and unregisters. This forces the next page load to fall back
// to the bare network (no SW interception), so users finally get the
// freshest HTML + bundles regardless of when they last visited.

const VERSION = 'simplifica-crm-v4.0-final';
const INSTALL_SENTINEL = '__no_op_sw__';

self.addEventListener('install', (event) => {
  // Take over immediately so this SW replaces the previous one on the
  // very next navigation, no waiting for all tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop every cache the previous SWs created.
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => caches.delete(k).catch(() => undefined)),
    );
    // Unregister self so the browser no longer routes fetches through
    // a service worker. After this, every fetch is straight to the
    // network and the HTTP cache is the only intermediate.
    await self.registration.unregister();
    // Force all open clients to reload so they pick up the unregister.
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) {
      try { c.navigate(c.url); } catch (_) { /* ignore */ }
    }
  })());
});

self.addEventListener('fetch', (event) => {
  // The activate handler above will unregister us as soon as we take
  // over, but in the brief window between install and activate we
  // still need to answer fetches. Pass through to the network.
  event.respondWith(fetch(event.request));
});
