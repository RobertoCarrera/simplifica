import { ApplicationConfig, APP_INITIALIZER, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideHttpClient, withInterceptors, HTTP_INTERCEPTORS } from '@angular/common/http';
import { csrfInterceptor } from './interceptors/csrf.interceptor';
import { HttpErrorInterceptor } from './interceptors/http-error.interceptor';
import { RuntimeConfigService } from './services/runtime-config.service';

function initRuntimeConfig(cfg: RuntimeConfigService) {
  return () => cfg.load();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    // Hydration is disabled because the app is not using SSR. Enabling it without SSR caused NG0505.
    // If SSR is added later, re-enable: provideClientHydration(withEventReplay()) in the SERVER config.
    provideHttpClient(
      withInterceptors([csrfInterceptor])
    ),
    {
      provide: APP_INITIALIZER,
      useFactory: initRuntimeConfig,
      deps: [RuntimeConfigService],
      multi: true
    },
    // Interceptor de errores HTTP global
    {
      provide: HTTP_INTERCEPTORS,
      useClass: HttpErrorInterceptor,
      multi: true
    }
  ]
};
