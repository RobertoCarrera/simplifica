import { Component, inject } from '@angular/core';
import { ResponsiveLayoutComponent } from './components/responsive-layout/responsive-layout.component';
import { ToastComponent } from './components/toast/toast.component';
import { PwaInstallComponent } from './components/pwa-install/pwa-install.component';
import { MobileStatusComponent } from './components/mobile-status/mobile-status.component';
import { DevNavComponent } from './components/dev-nav/dev-nav.component';
import { ToastService } from './services/toast.service';
import { NotificationService } from './services/notification.service';
import { PWAService } from './services/pwa.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ResponsiveLayoutComponent, ToastComponent, PwaInstallComponent, MobileStatusComponent, DevNavComponent],
  template: `
    <app-responsive-layout></app-responsive-layout>
    <app-toast></app-toast>
    <app-pwa-install></app-pwa-install>
    <!-- Solo mostrar mobile status en dispositivos pequeños -->
    @if (pwaService.shouldShowMobileOptimizations()) {
      <app-mobile-status></app-mobile-status>
    }
    <!-- Navigation de desarrollo -->
    <app-dev-nav></app-dev-nav>
  `
})
export class AppComponent {
  title = 'simplifica';
  private toastService = inject(ToastService);
  private notificationService = inject(NotificationService);
  pwaService = inject(PWAService);

  constructor() {
    // Las notificaciones y toasts se mostrarán solo cuando el usuario esté autenticado
    // No mostrar nada en el login
  }
}
