import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideHttpClient } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    // Hydration is disabled because the app is not using SSR. Enabling it without SSR caused NG0505.
    // If SSR is added later, re-enable: provideClientHydration(withEventReplay()) in the SERVER config.
    provideHttpClient()
  ]
};
