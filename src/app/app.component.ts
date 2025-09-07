import { Component, inject } from '@angular/core';
import { ResponsiveLayoutComponent } from './components/responsive-layout/responsive-layout.component';
import { ToastComponent } from './components/toast/toast.component';
import { PwaInstallComponent } from './components/pwa-install/pwa-install.component';
import { MobileStatusComponent } from './components/mobile-status/mobile-status.component';
import { ToastService } from './services/toast.service';
import { NotificationService } from './services/notification.service';
import { PWAService } from './services/pwa.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ResponsiveLayoutComponent, ToastComponent, PwaInstallComponent, MobileStatusComponent],
  template: `
    <app-responsive-layout></app-responsive-layout>
    <app-toast></app-toast>
    <app-pwa-install></app-pwa-install>
    <!-- Solo mostrar mobile status en dispositivos pequeños -->
    @if (pwaService.shouldShowMobileOptimizations()) {
      <app-mobile-status></app-mobile-status>
    }
  `
})
export class AppComponent {
  title = 'simplifica';
  private toastService = inject(ToastService);
  private notificationService = inject(NotificationService);
  pwaService = inject(PWAService);

  constructor() {
    // Mensaje de bienvenida adaptado al dispositivo
    setTimeout(() => {
      const deviceType = this.pwaService.isMobileDevice() ? 'móvil' : 'escritorio';
      const isPWA = this.pwaService.isInstalled() ? 'PWA' : 'web';
      
      this.toastService.info(
        '¡Bienvenido a Simplifica CRM!', 
        `Experiencia optimizada para ${deviceType} (${isPWA}) 🎉`
      );
    }, 1000);
    
    // Initialize notification system
    setTimeout(() => {
      this.notificationService.createNotification({
        type: 'info',
        title: '🎉 Sistema de Notificaciones Activado',
        message: 'El nuevo centro de notificaciones está ahora disponible con filtros avanzados y seguimiento en tiempo real.',
        priority: 'medium',
        category: 'system',
        actionUrl: '/notifications',
        actionLabel: 'Explorar centro',
        persistent: false
      });
    }, 3000);
  }
}
