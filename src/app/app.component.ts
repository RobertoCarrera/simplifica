import { Component, inject } from '@angular/core';
import { ResponsiveLayoutComponent } from './shared/layout/responsive-layout/responsive-layout.component';
import { ToastComponent } from './shared/ui/toast/toast.component';
import { PwaInstallComponent } from './shared/ui/pwa-install/pwa-install.component';
import { ToastService } from './services/toast.service';
import { PWAService } from './services/pwa.service';
import { ThemeService } from './services/theme.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    ResponsiveLayoutComponent,
    ToastComponent,
    PwaInstallComponent,
  ],
  template: `
    <app-responsive-layout></app-responsive-layout>
    <app-toast></app-toast>
    <app-pwa-install></app-pwa-install>
  `,
})
export class AppComponent {
  title = 'simplifica';
  private toastService = inject(ToastService);
  pwaService = inject(PWAService);
  themeService = inject(ThemeService);

  constructor() {
    // Las notificaciones y toasts se mostrarán solo cuando el usuario esté autenticado
    // No mostrar nada en el login
  }
}
