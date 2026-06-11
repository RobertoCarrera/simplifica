// Service Worker registration is DISABLED.
// Reason: the SW was aggressively caching the JS bundles and serving
// stale versions across hot-reloads, causing "fix doesn't work" symptoms
// that were actually just bundle cache issues. We prefer the user always
// gets the freshest bundle from the dev server, even at the cost of no
// offline support. If you want offline support, re-enable the registration
// below and add a proper cache-bust / update-on-reload strategy.
if ('serviceWorker' in navigator) {
  // Unregister any previously installed SW so it stops intercepting
  // requests and serving stale assets.
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    regs.forEach(function (r) { r.unregister(); });
  });
}
