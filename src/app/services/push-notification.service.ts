import { Injectable, signal, inject } from '@angular/core';
import { PWAService } from './pwa.service';

export interface PushNotificationOptions {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  tag?: string;
  renotify?: boolean;
  requireInteraction?: boolean;
  actions?: NotificationAction[];
  data?: any;
}

export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PushNotificationService {
  private pwaService = inject(PWAService);
  private swRegistration: ServiceWorkerRegistration | null = null;

  // Signals
  readonly permission = signal<NotificationPermission>(Notification.permission);
  readonly isSupported = signal(this.checkSupport());
  readonly subscription = signal<PushSubscription | null>(null);

  // VAPID key - En producción, esto debería venir del backend
  private readonly vapidPublicKey = 'your-vapid-public-key-here';

  constructor() {
    this.initializeServiceWorker();
  }

  private checkSupport(): boolean {
    return 'Notification' in window && 
           'serviceWorker' in navigator && 
           'PushManager' in window;
  }

  private async initializeServiceWorker(): Promise<void> {
    if (!this.isSupported()) {
      console.warn('Push notifications not supported');
      return;
    }

    try {
      this.swRegistration = await navigator.serviceWorker.register('/sw.js');
      console.log('ServiceWorker registered successfully');
      
      // Check for existing subscription
      const existingSubscription = await this.swRegistration.pushManager.getSubscription();
      this.subscription.set(existingSubscription);
      
    } catch (error) {
      console.error('ServiceWorker registration failed:', error);
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) {
      console.warn('Notifications not supported');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.permission.set(permission);
      return permission === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }

  async subscribeToPush(): Promise<PushSubscription | null> {
    if (!this.swRegistration || this.permission() !== 'granted') {
      console.warn('Cannot subscribe to push: no registration or permission denied');
      return null;
    }

    try {
      const subscription = await this.swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey) as BufferSource
      });

      this.subscription.set(subscription);
      
      // Send subscription to your backend
      await this.sendSubscriptionToServer(subscription);
      
      return subscription;
    } catch (error) {
      console.error('Error subscribing to push:', error);
      return null;
    }
  }

  async unsubscribeFromPush(): Promise<boolean> {
    const subscription = this.subscription();
    if (!subscription) {
      return true;
    }

    try {
      await subscription.unsubscribe();
      this.subscription.set(null);
      
      // Remove subscription from your backend
      await this.removeSubscriptionFromServer(subscription);
      
      return true;
    } catch (error) {
      console.error('Error unsubscribing from push:', error);
      return false;
    }
  }

  async showNotification(options: PushNotificationOptions): Promise<void> {
    if (!this.swRegistration || this.permission() !== 'granted') {
      console.warn('Cannot show notification: no registration or permission denied');
      return;
    }

    try {
      await this.swRegistration.showNotification(options.title, {
        body: options.body,
        icon: options.icon || '/favicon.ico',
        badge: options.badge || '/favicon.ico',
        tag: options.tag,
        renotify: options.renotify || false,
        requireInteraction: options.requireInteraction || false,
        actions: options.actions || [],
        data: options.data,
        vibrate: this.pwaService.deviceInfo().isMobile ? [200, 100, 200] : undefined
      } as NotificationOptions);
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  // Notification templates para diferentes tipos
  async showTicketNotification(ticketId: string, title: string, message: string): Promise<void> {
    await this.showNotification({
      title: `Ticket #${ticketId}`,
      body: `${title}: ${message}`,
      icon: '/favicon.ico',
      tag: `ticket-${ticketId}`,
      requireInteraction: true,
      actions: [
        {
          action: 'view',
          title: 'Ver Ticket',
          icon: '/assets/icons/view.png'
        },
        {
          action: 'dismiss',
          title: 'Descartar'
        }
      ],
      data: {
        type: 'ticket',
        ticketId,
        url: `/tickets/${ticketId}`
      }
    });
  }

  async showWorkCompletedNotification(workId: string, customerName: string): Promise<void> {
    await this.showNotification({
      title: 'Servicio Completado',
      body: `El servicio para ${customerName} ha sido finalizado`,
      icon: '/favicon.ico',
      tag: `work-${workId}`,
      actions: [
        {
          action: 'view',
          title: 'Ver Detalles'
        },
        {
          action: 'invoice',
          title: 'Generar Factura'
        }
      ],
      data: {
        type: 'work-completed',
        workId,
        customerName,
        url: `/works/${workId}`
      }
    });
  }

  async showReminderNotification(title: string, message: string, reminderData: any): Promise<void> {
    await this.showNotification({
      title: `Recordatorio: ${title}`,
      body: message,
      icon: '/favicon.ico',
      tag: `reminder-${reminderData.id}`,
      requireInteraction: true,
      actions: [
        {
          action: 'complete',
          title: 'Marcar como Hecho'
        },
        {
          action: 'snooze',
          title: 'Recordar en 1h'
        }
      ],
      data: {
        type: 'reminder',
        ...reminderData
      }
    });
  }

  async scheduleNotification(options: PushNotificationOptions, delay: number): Promise<void> {
    // En un entorno real, esto se haría en el backend
    setTimeout(() => {
      this.showNotification(options);
    }, delay);
  }

  private async sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
    // Implementar llamada al backend para guardar la suscripción
    console.log('Sending subscription to server:', subscription);
    
    try {
      // Ejemplo de llamada al backend:
      // await this.http.post('/api/push/subscribe', {
      //   subscription: subscription.toJSON(),
      //   userAgent: navigator.userAgent
      // }).toPromise();
    } catch (error) {
      console.error('Error sending subscription to server:', error);
    }
  }

  private async removeSubscriptionFromServer(subscription: PushSubscription): Promise<void> {
    console.log('Removing subscription from server:', subscription);
    
    try {
      // Ejemplo de llamada al backend:
      // await this.http.post('/api/push/unsubscribe', {
      //   subscription: subscription.toJSON()
      // }).toPromise();
    } catch (error) {
      console.error('Error removing subscription from server:', error);
    }
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Utilidades para testing
  async testNotification(): Promise<void> {
    if (this.permission() !== 'granted') {
      const granted = await this.requestPermission();
      if (!granted) {
        console.warn('Permission not granted for test notification');
        return;
      }
    }

    await this.showNotification({
      title: 'Simplifica CRM',
      body: '¡Las notificaciones funcionan correctamente! 🎉',
      icon: '/favicon.ico',
      tag: 'test-notification',
      actions: [
        {
          action: 'thumbs-up',
          title: '👍 Perfecto'
        }
      ],
      data: {
        type: 'test'
      }
    });
  }
}
