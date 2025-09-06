import { Injectable, signal } from '@angular/core';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

@Injectable({
  providedIn: 'root'
})
export class PwaService {
  private deferredPrompt = signal<BeforeInstallPromptEvent | null>(null);
  private isInstallable = signal(false);
  private isInstalled = signal(false);
  private isOnline = signal(navigator.onLine);

  constructor() {
    this.setupEventListeners();
    this.checkInstallationStatus();
  }

  get installable() {
    return this.isInstallable.asReadonly();
  }

  get installed() {
    return this.isInstalled.asReadonly();
  }

  get online() {
    return this.isOnline.asReadonly();
  }

  private setupEventListeners() {
    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      const installEvent = e as BeforeInstallPromptEvent;
      this.deferredPrompt.set(installEvent);
      this.isInstallable.set(true);
    });

    // Listen for appinstalled event
    window.addEventListener('appinstalled', () => {
      this.isInstalled.set(true);
      this.isInstallable.set(false);
      this.deferredPrompt.set(null);
    });

    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline.set(true);
    });

    window.addEventListener('offline', () => {
      this.isOnline.set(false);
    });
  }

  private checkInstallationStatus() {
    // Check if app is installed
    if (window.matchMedia('(display-mode: standalone)').matches || 
        (window.navigator as any).standalone) {
      this.isInstalled.set(true);
    }
  }

  async installApp(): Promise<boolean> {
    const prompt = this.deferredPrompt();
    if (!prompt) {
      return false;
    }

    try {
      await prompt.prompt();
      const choiceResult = await prompt.userChoice;
      
      if (choiceResult.outcome === 'accepted') {
        this.deferredPrompt.set(null);
        this.isInstallable.set(false);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error during app installation:', error);
      return false;
    }
  }

  // Update management
  checkForUpdates(): Promise<boolean> {
    return new Promise((resolve) => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
          registration.update().then(() => {
            resolve(true);
          }).catch(() => {
            resolve(false);
          });
        });
      } else {
        resolve(false);
      }
    });
  }

  // Notification permission
  async requestNotificationPermission(): Promise<NotificationPermission> {
    if ('Notification' in window) {
      return await Notification.requestPermission();
    }
    return 'denied';
  }

  // Show notification
  showNotification(title: string, options?: NotificationOptions): void {
    if ('Notification' in window && Notification.permission === 'granted') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
          registration.showNotification(title, {
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            ...options
          });
        });
      } else {
        new Notification(title, {
          icon: '/favicon.ico',
          ...options
        });
      }
    }
  }

  // Cache management
  async clearCache(): Promise<void> {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      );
    }
  }

  // Get app info
  getAppInfo() {
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
      deviceMemory: (navigator as any).deviceMemory,
      connection: (navigator as any).connection
    };
  }
}
