import { bootstrapApplication } from '@angular/platform-browser';
// Silence console.log on server-side bootstrap too
import './disable-console';
import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

const bootstrap = () => bootstrapApplication(AppComponent, config);

export default bootstrap;
