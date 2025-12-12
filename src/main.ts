import { bootstrapApplication } from '@angular/platform-browser';
import { environment } from './environments/environment';
// Load a small shim to reduce navigator.locks error noise before anything else initializes
import './locks-shim';
// Only disable console.log in production builds to keep useful logs during development
if (environment.production) {
  // Disable console logs in production
  console.log = function () { };
  console.info = function () { };
  console.warn = function () { };
  // Keep console.error for critical crash reports if needed, or disable it too:
  // console.error = function () {}; 
}
import { provideAnimations } from '@angular/platform-browser/animations';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { provideHttpClient } from '@angular/common/http';

bootstrapApplication(AppComponent, {
  ...appConfig,
  providers: [
    provideHttpClient(),
    provideAnimations(),
    ...(appConfig.providers || []),
  ]
}).catch((err) => console.error(err));