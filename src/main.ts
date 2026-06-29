import { bootstrapApplication } from "@angular/platform-browser";
import { environment } from "./environments/environment";
// Load a small shim to reduce navigator.locks error noise before anything else initializes
// import './locks-shim';
// Only disable console.log in production builds to keep useful logs during development
if (environment.production) {
  // Suppress all diagnostic output in production builds.
  // console.log/info/warn/debug can leak internal state, PII and architecture details
  // to anyone with DevTools open.
  // console.error is also suppressed: use a real monitoring service (Sentry, etc.) instead.
  const noop = function () {};
  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.debug = noop;
  console.error = noop;
} else if ('serviceWorker' in navigator) {
  // Dev-only: unregister any PWA service worker BEFORE Angular bootstraps.
  //
  // Why: The Angular Service Worker (`ngsw-worker.js`) ships in production
  // bundles and uses an `api-freshness` data group (1h window for `/assets/*`).
  // If a developer previously visited the production site, that SW is
  // permanently installed on the origin and intercepts every subsequent
  // request — including local `ng serve` requests — serving the stale
  // production bundle. Hard refresh does not always bypass the SW.
  //
  // Symptom: local code changes (e.g., to a pipe or component import)
  // appear to have no effect, with no useful console error. Root cause:
  // the SW keeps serving the cached `main.js` instead of the rebundled one.
  //
  // Unregistering here gives us the earliest possible window to clear the
  // SW so the next page load picks up fresh assets. The companion APP_INIT
  // `unregisterDevServiceWorker` in src/app/app.config.ts does the same
  // cleanup later, during Angular init, and also deletes ngsw cache
  // buckets — keep both in sync if the strategy ever changes.
  (async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((k) => k.startsWith('ngsw:') || k.includes('ngsw'))
            .map((k) => caches.delete(k)),
        );
      }
    } catch {
      /* non-critical — dev cleanup only */
    }
  })();
}
import { appConfig } from "./app/app.config";
import { AppComponent } from "./app/app.component";

bootstrapApplication(AppComponent, appConfig).catch((err) =>
  console.error(err),
);
