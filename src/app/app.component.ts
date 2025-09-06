import { Component, inject } from '@angular/core';
import { LayoutComponent } from './components/layout/layout.component';
import { NotificationToastComponent } from './components/notification-toast/notification-toast.component';
import { PwaInstallComponent } from './components/pwa-install/pwa-install.component';
import { ToastService } from './services/toast.service';
import { NotificationService } from './services/notification.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LayoutComponent, NotificationToastComponent, PwaInstallComponent],
  template: `
    <app-layout></app-layout>
    <app-notification-toast></app-notification-toast>
    <app-pwa-install></app-pwa-install>
  `
})
export class AppComponent {
  title = 'simplifica';
  private toastService = inject(ToastService);
  private notificationService = inject(NotificationService);

  constructor() {
    // Mensaje de bienvenida
    setTimeout(() => {
      this.toastService.info(
        '¡Bienvenido a Simplifica CRM!', 
        'Experiencia de usuario premium con PWA activada 🎉'
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
