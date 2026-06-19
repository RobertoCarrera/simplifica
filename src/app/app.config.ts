import {
  ApplicationConfig,
  APP_INITIALIZER,
  provideZoneChangeDetection,
  LOCALE_ID,
} from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import localeCa from '@angular/common/locales/ca';
import localeDe from '@angular/common/locales/de';

registerLocaleData(localeEs, 'es-ES');
registerLocaleData(localeCa, 'ca');
registerLocaleData(localeDe, 'de');
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideHttpClient, withInterceptors, HTTP_INTERCEPTORS } from '@angular/common/http';
import { csrfInterceptor } from './interceptors/csrf.interceptor';
import { HttpErrorInterceptor } from './interceptors/http-error.interceptor';
import { RuntimeConfigService } from './services/runtime-config.service';
import { GlobalInputConfigService } from './core/services/global-input-config.service';
import { LanguageService } from './core/services/language.service';
import { TranslocoHttpLoader } from './core/services/transloco-http.loader';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { inject, isDevMode } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { provideServiceWorker } from '@angular/service-worker';

function initRuntimeConfig() {
  const cfg = inject(RuntimeConfigService);
  return () => cfg.load();
}

function initGlobalInputs() {
  const service = inject(GlobalInputConfigService);
  return () => service.init();
}

/**
 * Dev-only: unregister any previously registered Service Worker and clear
 * its caches. This is necessary because a production-deployed SW (with
 * aggressive caching rules that include /assets/* under a 1-hour freshness
 * cache) can persist in the browser across sessions and serve stale
 * runtime-config.json responses even when running locally with `ng serve`.
 * Without this cleanup, the dev experience shows confusing "supabaseUrl is
 * required" errors caused by SW-cached empty config responses.
 */
function unregisterDevServiceWorker() {
  return async () => {
    if (isDevMode() && 'serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          for (const k of keys) {
            // Only clear caches that look like Angular SW caches
            if (k.startsWith('ngsw:') || k.includes('ngsw')) {
              await caches.delete(k);
            }
          }
        }
      } catch { /* noop — non-critical cleanup */ }
    }
  };
}

function initLanguage() {
  const languageService = inject(LanguageService);
  const translocoService = inject(TranslocoService);
  const translocoLoader = inject(TranslocoHttpLoader);

  return async () => {
    languageService.initLanguage();

    // Wait for translations to be fully loaded before bootstrapping
    // This prevents "Missing translation" warnings during initial render
    const lang = translocoService.getActiveLang();
    await lastValueFrom(translocoLoader.getTranslation(lang));
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideAnimations(),
    provideRouter(routes),
    // Hydration is disabled because the app is not using SSR. Enabling it without SSR caused NG0505.
    // If SSR is added later, re-enable: provideClientHydration(withEventReplay()) in the SERVER config.
    provideHttpClient(withInterceptors([csrfInterceptor])),
    {
      provide: APP_INITIALIZER,
      useFactory: initRuntimeConfig,
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initGlobalInputs,
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: unregisterDevServiceWorker,
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initLanguage,
      multi: true,
    },
    provideTransloco({
      config: {
        availableLangs: ['es', 'ca', 'de'],
        defaultLang: 'es',
        fallbackLang: 'es',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        missingHandler: {
          logMissingKey: true,
          useFallbackTranslation: true,
        },
      },
      loader: TranslocoHttpLoader,
    }),
    {
      provide: LOCALE_ID,
      useValue: 'es-ES',
    },
    // Interceptor de errores HTTP global
    {
      provide: HTTP_INTERCEPTORS,
      useClass: HttpErrorInterceptor,
      multi: true,
    },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
