import { ApplicationConfig, APP_INITIALIZER, provideZoneChangeDetection, isDevMode } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideHttpClient, withInterceptors, HTTP_INTERCEPTORS } from '@angular/common/http';
import { csrfInterceptor } from './interceptors/csrf.interceptor';
import { HttpErrorInterceptor } from './interceptors/http-error.interceptor';
import { RuntimeConfigService } from './services/runtime-config.service';

import { inject } from '@angular/core';

function initRuntimeConfig() {
  const cfg = inject(RuntimeConfigService);
  return () => cfg.load();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideAnimations(),
    provideRouter(routes),
    // Hydration is disabled because the app is not using SSR. Enabling it without SSR caused NG0505.
    // If SSR is added later, re-enable: provideClientHydration(withEventReplay()) in the SERVER config.
    provideHttpClient(
      withInterceptors([csrfInterceptor])
    ),
    {
      provide: APP_INITIALIZER,
      useFactory: initRuntimeConfig,
      multi: true
    },
    // Interceptor de errores HTTP global
    {
      provide: HTTP_INTERCEPTORS,
      useClass: HttpErrorInterceptor,
      multi: true
    },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
