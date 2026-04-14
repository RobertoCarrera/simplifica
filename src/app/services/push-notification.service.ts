import { Injectable, signal, computed, inject } from '@angular/core';
import { PWAService } from './pwa.service';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';
import { RuntimeConfigService } from './runtime-config.service';

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
  private supabaseClient = inject(SupabaseClientService);
  private authService = inject(AuthService);
  private runtimeConfig = inject(RuntimeConfigService);

  private swRegistration: ServiceWorkerRegistration | null = null;

  // Signals
  readonly permission = signal<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  readonly isSupported = signal(this.checkSupport());
  readonly subscription = signal<PushSubscription | null>(null);
  readonly isSubscribed = computed(() => this.subscription() !== null);

  private get vapidPublicKey(): string {
    const cfg = this.runtimeConfig.get();
    return (cfg as any).vapidPublicKey || '';
  }

  constructor() {
    this.initializeServiceWorker();
  }

  private checkSupport(): boolean {
    return typeof window !== 'undefined' &&
           'Notification' in window &&
           'serviceWorker' in navigator &&
           'PushManager' in window;
  }

  private async initializeServiceWorker(): Promise<void> {
    if (!this.isSupported()) return;

    try {
      this.swRegistration = await navigator.serviceWorker.ready;
      const existingSubscription = await this.swRegistration.pushManager.getSubscription();
      this.subscription.set(existingSubscription);
    } catch (error) {
      console.error('[PushNotification] SW ready failed:', error);
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;

    try {
      const permission = await Notification.requestPermission();
      this.permission.set(permission);
      return permission === 'granted';
    } catch (error) {
      console.error('[PushNotification] Permission request error:', error);
      return false;
    }
  }

  /**
   * Subscribe to Web Push, persist subscription in push_subscriptions table.
   */
  async subscribe(): Promise<void> {
    if (!this.vapidPublicKey) {
      console.warn('[PushNotification] No VAPID public key configured');
      return;
    }

    if (this.permission() !== 'granted') {
      const granted = await this.requestPermission();
      if (!granted) return;
    }

    if (!this.swRegistration) {
      console.warn('[PushNotification] No SW registration');
      return;
    }

    try {
      const subscription = await this.swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey) as BufferSource
      });

      this.subscription.set(subscription);
      await this.saveSubscriptionToSupabase(subscription);
    } catch (error) {
      console.error('[PushNotification] Subscribe error:', error);
    }
  }

  /**
   * Unsubscribe from Web Push, remove from push_subscriptions table.
   */
  async unsubscribe(): Promise<void> {
    const sub = this.subscription();
    if (!sub) return;

    try {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      this.subscription.set(null);
      await this.removeSubscriptionFromSupabase(endpoint);
    } catch (error) {
      console.error('[PushNotification] Unsubscribe error:', error);
    }
  }

  async showNotification(options: PushNotificationOptions): Promise<void> {
    if (!this.swRegistration || this.permission() !== 'granted') return;

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
      console.error('[PushNotification] Show notification error:', error);
    }
  }

  // ── Supabase persistence ──────────────────────────────────────────

  private async saveSubscriptionToSupabase(subscription: PushSubscription): Promise<void> {
    const userId = this.authService.userProfile?.id;
    if (!userId) {
      console.warn('[PushNotification] No user id — cannot persist subscription');
      return;
    }

    const json = subscription.toJSON();
    const keys = json.keys || {};

    const { error } = await this.supabaseClient.getClient()
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint: json.endpoint!,
          p256dh: keys.p256dh || '',
          auth: keys.auth || '',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,endpoint' }
      );

    if (error) {
      console.error('[PushNotification] Upsert subscription error:', error);
    }
  }

  private async removeSubscriptionFromSupabase(endpoint: string): Promise<void> {
    const userId = this.authService.userProfile?.id;
    if (!userId) return;

    const { error } = await this.supabaseClient.getClient()
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint);

    if (error) {
      console.error('[PushNotification] Delete subscription error:', error);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

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

  async testNotification(): Promise<void> {
    if (this.permission() !== 'granted') {
      const granted = await this.requestPermission();
      if (!granted) return;
    }

    await this.showNotification({
      title: 'Simplifica CRM',
      body: '¡Las notificaciones funcionan correctamente! 🎉',
      icon: '/favicon.ico',
      tag: 'test-notification',
      data: { type: 'test' }
    });
  }
}
