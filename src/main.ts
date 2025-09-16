import { bootstrapApplication } from '@angular/platform-browser';
// Disable console.log globally at startup to remove noisy logs during development/builds.
import './disable-console';
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