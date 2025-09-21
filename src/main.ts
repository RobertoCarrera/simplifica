import { bootstrapApplication } from '@angular/platform-browser';
import { environment } from './environments/environment';
// Load a small shim to reduce navigator.locks error noise before anything else initializes
import './locks-shim';
// Only disable console.log in production builds to keep useful logs during development
if (environment.production) {
  import('./disable-console');
}
import { provideAnimations } from '@angular/platform-browser/animations';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { provideHttpClient } from '@angular/common/http';

bootstrapApplication(AppComponent,{
  ...appConfig,
  providers:[
    provideHttpClient(),
    provideAnimations(),
    ...(appConfig.providers || []),
  ]
}).catch((err) => console.error(err));