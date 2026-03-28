import { bootstrapApplication } from '@angular/platform-browser';
import { environment } from './environments/environment';
// Load a small shim to reduce navigator.locks error noise before anything else initializes
// import './locks-shim';
// Only disable console.log in production builds to keep useful logs during development
if (environment.production) {
  // Suppress all diagnostic output in production builds.
  // console.log/info/warn/debug can leak internal state, PII and architecture details
  // to anyone with DevTools open.
  // console.error is also suppressed: use a real monitoring service (Sentry, etc.) instead.
  const noop = function () {};
  console.log   = noop;
  console.info  = noop;
  console.warn  = noop;
  console.debug = noop;
  console.error = noop;
}
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { configureSecurity } from './app/core/utils/security.config';

// Initialize global security configurations (DOMPurify hooks, etc.)
configureSecurity();

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));