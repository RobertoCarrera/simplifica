import { ApplicationConfig, APP_INITIALIZER, provideZoneChangeDetection, LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import localeCa from '@angular/common/locales/ca';

registerLocaleData(localeEs, 'es-ES');
registerLocaleData(localeCa, 'ca');
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
import { provideTransloco } from '@jsverse/transloco';

import { inject, isDevMode } from '@angular/core';

function initRuntimeConfig() {
  const cfg = inject(RuntimeConfigService);
  return () => cfg.load();
}

function initGlobalInputs() {
  const service = inject(GlobalInputConfigService);
  return () => service.init();
}

function initLanguage() {
  const service = inject(LanguageService);
  return () => service.initLanguage();
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
    {
      provide: APP_INITIALIZER,
      useFactory: initGlobalInputs,
      multi: true
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initLanguage,
      multi: true
    },
    provideTransloco({
      config: {
        availableLangs: ['es', 'ca'],
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
      useValue: 'es-ES'
    },
    // Interceptor de errores HTTP global
    {
      provide: HTTP_INTERCEPTORS,
      useClass: HttpErrorInterceptor,
      multi: true
    }
  ]
};
